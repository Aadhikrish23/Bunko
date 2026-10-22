import { registerContextProviders } from "./context/ContextProviderRegistrar";
import { ContextBuilder } from "./context/ContextBuilder";
import { AIService } from "./aiService";
import { ActionExecutor } from "./executor/ActionExecutor";
import { AIProvider } from "./providers/AIProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { NvidiaNimProvider } from "./providers/NvidiaNimProvider";
import { setDomainPack } from "./domain/activeDomain";
import booksPack from "./domains/books";
import { checkRegistryConsistency, reportRegistryConsistency } from "./registry/RegistryConsistencyCheck";
import toolMapper from "./execution/ToolMapper";
import toolMetadataRegistry from "./execution/ToolMetadataRegistry";
import { Request, Response } from "express";
import crypto from "crypto";
import AIConfig from "./config/AIConfig";
import { AI_OFFLINE_MESSAGE, AI_SLOW_MESSAGE } from "./runtime/errors/AIProviderUnavailableError";

// The composition root: the one place that picks this app's domain. Everything else asks domainPack().
setDomainPack(booksPack);
const toolRegistry = booksPack.createToolRegistry();
const contextRegistry = registerContextProviders();
const capabilityRegistry = booksPack.registerCapabilities();

reportRegistryConsistency(
  checkRegistryConsistency(capabilityRegistry, toolRegistry, toolMapper, toolMetadataRegistry),
);

const provider: AIProvider =
  AIConfig.aiProvider === "nvidia" ? new NvidiaNimProvider() : new OllamaProvider();
const executor = new ActionExecutor(toolRegistry);
const contextBuilder = new ContextBuilder(contextRegistry);

const aiService = new AIService(
  provider,
  executor,
  toolRegistry,
  contextBuilder,
  capabilityRegistry,
);

// Conversation state (ConversationStore, session references) is mutable and keyed
// per-user with no locking of its own. Two concurrent requests from the same user
// (e.g. a double-click, or a retry racing the original) would otherwise interleave
// reads/writes of that shared session and corrupt each other's turn. Chaining each
// user's requests onto their own queue makes them run strictly one-at-a-time.
const userRequestQueues = new Map<string, Promise<unknown>>();

function runExclusivePerUser<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = userRequestQueues.get(userId) || Promise.resolve();
  const next = previous.then(task, task);
  userRequestQueues.set(
    userId,
    next.catch(() => {}),
  );
  return next;
}

export class AIController {
  async chat(req: Request, res: Response): Promise<void> {
    const { message } = req.body;
    const requestId = crypto.randomUUID();
    // Anything other than an explicit `true` means "can't launch" (older clients, the web build).
    const raw = req.body?.client ?? {};
    const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9]{1,40}$/.test(v) ? v : undefined);
    const client = {
      canLaunchGames: raw.canLaunchGames === true,
      pageGameId: id(raw.pageGameId),
      pageCollectionId: id(raw.pageCollectionId),
    };

    if (typeof message !== "string" || message.trim() === "") {
      res.status(400).json({
        success: false,
        message: "Please tell me what you'd like to do.",
      });
      return;
    }

    try {
      const result = await runExclusivePerUser(req.user!.id, () =>
        aiService.chat(req.user!.id, message, requestId, client),
      );
      res.status(200).json(result);
    } catch (error: any) {
      if (error && error.code === "AI_PROVIDER_UNAVAILABLE") {
        const slow = /timed out/i.test(String(error.message ?? ""));
        res.status(503).json({ success: false, offline: true, message: slow ? AI_SLOW_MESSAGE : AI_OFFLINE_MESSAGE });
        return;
      }
      // A daily limit (or a revoked install) is a reply, not a crash.
      if (error && (error.code === "AI_QUOTA" || error.cause?.code === "AI_QUOTA")) {
        res.status(200).json({ success: false, status: "LIMITED", message: error.code === "AI_QUOTA" ? error.message : error.cause.message });
        return;
      }
      if (error && error.code === "PROVIDER_VALIDATION_ERROR") {
        // error.message here is a raw parser diagnostic (e.g. "Unterminated string in
        // JSON at position 41") -- meaningful in the trace log, not to an end user.
        res.status(200).json({
          success: false,
          message: "I had trouble understanding that request. Could you try rephrasing it?",
        });
        return;
      }
      if (error && error.code === "POLICY_VIOLATION") {
        res.status(200).json({
          success: false,
          message: error.message || "Validation failed."
        });
        return;
      }
      throw error;
    }
  }
}

export const aiController = new AIController();

/** POST /ai/reset -- "Clear" in the chat: forget the conversation, not just the visible messages. */
export async function resetConversation(req: Request, res: Response): Promise<void> {
  await aiService.reset(req.user!.id);
  res.status(200).json({ Status: "Success", Message: "Conversation cleared" });
}