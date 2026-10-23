import { registerContextProviders } from "./context/ContextProviderRegistrar";
import { ContextBuilder } from "./context/ContextBuilder";
import { AIService } from "./aiService";
import { ActionExecutor } from "./executor/ActionExecutor";
import type { AIProvider } from "./providers/AIProvider";
import { createProvider, providerNames, registerProvider } from "./providers/ProviderRegistry";
import { setDomainPack } from "./domain/activeDomain";
import booksPack from "./domains/books";
import { GuardedProvider } from "./domains/books/policy/GuardedProvider";
import { MockBooksProvider } from "./domains/books/testing/MockBooksProvider";
import { checkRegistryConsistency, reportRegistryConsistency } from "./registry/RegistryConsistencyCheck";
import toolMapper from "./execution/ToolMapper";
import toolMetadataRegistry from "./execution/ToolMetadataRegistry";
import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import AIConfig from "./config/AIConfig";
import { coreLog } from "./logging/coreLog";
import { AI_OFFLINE_MESSAGE, AI_SLOW_MESSAGE, AIProviderUnavailableError } from "./runtime/errors/AIProviderUnavailableError";
import { AppError } from "../../lib/app-error";
import { requireUserId } from "../../lib/require-user";
import { sendOk } from "../../lib/response";
import { requireConsent } from "../ai/ai.service";

// The composition root (SRS §20.6, ARCHITECTURE.md §8): the one place that picks this app's
// domain and provider, and applies Bunko's policy. Everything else asks domainPack().
setDomainPack(booksPack);
const toolRegistry = booksPack.createToolRegistry();
const contextRegistry = registerContextProviders();
const capabilityRegistry = booksPack.registerCapabilities();

reportRegistryConsistency(
  checkRegistryConsistency(capabilityRegistry, toolRegistry, toolMapper, toolMetadataRegistry),
);

/** A provider that's misconfigured fails each chat clearly instead of crashing the server. */
class UnconfiguredProvider implements AIProvider {
  constructor(private readonly reason: string) {}
  plan(): never {
    throw new AIProviderUnavailableError(this.reason);
  }
  answer(): never {
    throw new AIProviderUnavailableError(this.reason);
  }
}

// AI_PROVIDER=mock: a deterministic stand-in for tests and keyless local work (T-103).
registerProvider("mock", () => new MockBooksProvider());

function buildProvider(): AIProvider {
  // No key: say so on every model call instead of letting the provider fail with a 401.
  if (AIConfig.aiProvider === "nvidia" && !AIConfig.nvidiaApiKey) {
    coreLog.warn("[assistant] NVIDIA_API_KEY is not set; messages that need the model will say the AI isn't set up.");
    return new UnconfiguredProvider("NVIDIA NIM is not configured: NVIDIA_API_KEY is not set.");
  }
  const chosen = createProvider(AIConfig.aiProvider);
  if (chosen) return new GuardedProvider(chosen);
  const reason = `AI_PROVIDER "${AIConfig.aiProvider}" is not configured: it isn't one of ${providerNames().join(", ")}`;
  coreLog.warn(`[assistant] ${reason}. The assistant will report itself unavailable.`);
  return new UnconfiguredProvider(reason);
}

const executor = new ActionExecutor(toolRegistry);
const contextBuilder = new ContextBuilder(contextRegistry);

const aiService = new AIService(buildProvider(), executor, toolRegistry, contextBuilder, capabilityRegistry);

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

const NOT_SET_UP_MESSAGE =
  "My AI model isn't set up on this server yet, so I can only do plain commands and questions about your library right now. Try something like \"finished Circe, 4 stars\", \"put Dune on my Sci-Fi shelf\" or \"what am I reading?\".";
const SOMETHING_WENT_WRONG = "Something went wrong on my side, so I didn't change anything. Could you try that again, maybe in other words?";

/** What a client sees of a reply; the runtime's profiling metrics stay on the server. */
function toReply(result: Record<string, any>) {
  return {
    success: Boolean(result.success),
    status: (result.status as string | undefined) ?? (result.success ? "SUCCESS" : "FAILED"),
    message: String(result.message ?? ""),
    ...(result.clarificationRequest ? { clarificationRequest: result.clarificationRequest } : {}),
  };
}

export class AIController {
  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = requireUserId(req);
      // The message and a summary of the library go to the AI provider (AI_DATA_POLICY §2).
      await requireConsent(userId, "generative");
      const { message, client: raw = {} } = req.body as { message: string; client?: { pageBookId?: string } };
      const requestId = crypto.randomUUID();
      const client = { canLaunchGames: false, pageBookId: raw.pageBookId };

      try {
        const result = await runExclusivePerUser(userId, () => aiService.chat(userId, message, requestId, client));
        sendOk(res, toReply(result));
      } catch (error: any) {
        if (error && error.code === "AI_PROVIDER_UNAVAILABLE") {
          // Misconfigured (no or rejected key): retrying won't help, so it's a plain reply.
          if (/not configured/i.test(String(error.message ?? ""))) {
            sendOk(res, { success: false, status: "FAILED", message: NOT_SET_UP_MESSAGE });
            return;
          }
          const slow = /timed out/i.test(String(error.message ?? ""));
          throw new AppError("AI_UNAVAILABLE", slow ? AI_SLOW_MESSAGE : AI_OFFLINE_MESSAGE);
        }
        // The daily allowance is a reply, not a crash.
        if (error && (error.code === "AI_QUOTA" || error.cause?.code === "AI_QUOTA")) {
          sendOk(res, { success: false, status: "LIMITED", message: error.code === "AI_QUOTA" ? error.message : error.cause.message });
          return;
        }
        if (error && (error.code === "PROVIDER_VALIDATION_ERROR" || error.cause?.code === "PROVIDER_VALIDATION_ERROR")) {
          // A raw parser diagnostic ("Unterminated string in JSON...") means nothing to a reader.
          sendOk(res, { success: false, status: "FAILED", message: "I had trouble understanding that. Could you say it another way?" });
          return;
        }
        if (error && error.code === "POLICY_VIOLATION") {
          sendOk(res, { success: false, status: "FAILED", message: error.message || "I can't do that." });
          return;
        }
        // Anything else is our bug: log it, but answer like a person, with nothing changed.
        req.log.error({ err: error }, "assistant chat failed");
        sendOk(res, { success: false, status: "FAILED", message: SOMETHING_WENT_WRONG });
      }
    } catch (error) {
      next(error);
    }
  }
}

export const aiController = new AIController();

/** POST /assistant/reset -- "Clear" in the chat: forget the conversation, not just the visible messages. */
export async function resetConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await aiService.reset(requireUserId(req));
    sendOk(res, { cleared: true });
  } catch (error) {
    next(error);
  }
}
