import type { IntentPlan } from "../intent/IntentPlan";
import type { ToolRegistry } from "../registry/ToolRegistry";
import type { CapabilityRegistry } from "../planning/CapabilityRegistry";
import type { AIClientCapabilities } from "../sdk/AIToolContext";
import type { ConversationSession } from "../conversation/ConversationSession";
import type { AIRequestContext } from "../conversation/AIRequestContext";
import type { Exchange } from "../conversation/RecentExchanges";
import type { RuntimeResponse } from "../pipeline/Replies";
import type { ModelGateway } from "../pipeline/ModelGateway";
import type { ExecutionResult } from "../execution/ExecutionResult";
import type { AIToolContext } from "../sdk/AIToolContext";
import type { Capability } from "../planning/Capability";
import type { ContextProviderRegistry } from "../context/ContextProviderRegistry";
import type { EntityResolutionResult } from "../entity/EntityResolutionResult";
import type { ToolCapability } from "../execution/ToolCapability";
import type { ExecutionStep } from "../execution/ExecutionStep";

/**
 * Everything the assistant knows about one app's world. The core (providers, conversation
 * state, planning and execution machinery, the runtime pipeline) is the same for any app; a
 * pack supplies the domain: its tools and capabilities, how to read the user's words about
 * its things (games, books...), its prompts, and its replies.
 *
 * RoninArc ships one pack, `domains/games`. A books tracker would add `domains/books`
 * implementing this interface and select it in its composition root.
 */
export interface DomainPack {
  /** "games", "books", ... */
  readonly id: string;

  // ---- Wiring (called once, from the composition root) ----
  /** The tools the planner can call. */
  createToolRegistry(): ToolRegistry;
  /** Every intent type the model may return (the core adds none of its own beyond AskQuestion/Help). */
  readonly intentTypes: readonly string[];
  /** Tool metadata, capability-to-tool mapping and how each tool's input is built. */
  readonly tools: DomainTools;
  /** Which capabilities exist and which intents reach them. */
  registerCapabilities(): CapabilityRegistry;
  /** Context providers (the user's library, reviews, ...) the planner may read. */
  registerContextProviders(registry: ContextProviderRegistry): void;
  /** Turn a name the user typed into one of their items (or candidates to ask about). */
  resolveEntity(userId: string, query: string, options?: { isBulk?: boolean }): Promise<EntityResolutionResult<any>>;

  // ---- Reading the message ----
  /** Slang, typos and references ("the second one") resolved before anything else. */
  normalizeMessage(message: string, lastExchange?: Exchange): string;
  /** A question about "this one" on an item's page names that item. */
  withPageContext(message: string, pageTitle?: string): string;
  /**
   * Deterministic handling before (and instead of) the model where the domain can: answers
   * from the user's data, plain commands, undo. Falls back to the model's plan.
   */
  preRoute(input: PreRouteInput): Promise<PreRouteOutcome>;
  /** The model's plan, checked against the message's own words. Returns how many changes were dropped. */
  correctPlan(plan: IntentPlan, ctx: CorrectionContext): number;
  /** Domain clean-up of a plan from any source (statuses the model spelled oddly...). */
  normalizePlan(plan: IntentPlan): void;
  /** Only act on things the user named or clearly referred to. */
  groundPlan(plan: IntentPlan, ctx: GroundingContext): Promise<GroundingResult>;
  /** Final shaping (split per item, recommendation vs action...). */
  shapePlan(plan: IntentPlan, message: string, fromModel: boolean): void;
  /** Intents that must run before the rest (adding an item before rating it). */
  runsFirst(intentType: string): boolean;

  // ---- After a plan runs ----
  undo: {
    /** What the plan is about to change, so "undo" can put it back. */
    snapshotBefore(userId: string, plan: IntentPlan): Promise<unknown>;
    remember(userId: string, snapshot: unknown): void;
    /** Something undo can't restore happened. */
    forget(userId: string): void;
    hasUntrackedChanges(plan: IntentPlan): boolean;
  };
  /** "Want me to mark it Completed?" -- an offer to make after a change, if any. */
  followUpOffer(userId: string, plan: IntentPlan, message: string): Promise<FollowUpOffer | undefined>;
  /**
   * A yes/no card to show before running the plan (removing an item and what's lost with it),
   * or undefined to run it now. Only consulted for plans the user hasn't confirmed yet.
   */
  confirmBeforeRunning(plan: IntentPlan, resolved: any, ctx: { userId: string; requestId: string; message: string }): Promise<RuntimeResponse | undefined>;
  /**
   * Every final reply passes through here: domain tidying, and offers in it ("I can add
   * Silksong...") becoming a pending yes/no. Returns the reply to send.
   */
  finishReply(userId: string, requestId: string, message: string): string;
  /** Sentences for what the tools did. */
  describeResults(executionResult: ExecutionResult): string;

  // ---- The model ----
  prompts: {
    /** The planner prompt for this domain. */
    plan(request: string, toolContext: AIToolContext, capabilities: Capability[], context: AIRequestContext): string;
    /** The plain-text answer prompt. */
    answer(question: string, context: AIRequestContext): string;
  };
  /** Domain shorthand spelled out and facts looked up before a question goes to the answer model. */
  prepareQuestion(question: string, context: AIRequestContext): Promise<{ question: string; context: AIRequestContext }>;

  // ---- Words ----
  phrases: DomainPhrases;
}

export interface DomainTools {
  metadata: ToolCapability[];
  /** Capability id -> its one tool. */
  capabilityTools: Record<string, string>;
  /** Capabilities whose tool is picked per request by chooseTool, with every tool they can pick. */
  multiToolCapabilities: Record<string, string[]>;
  chooseTool?(capabilityId: string, targetsOrInput?: any[] | Record<string, unknown>, query?: string): string | undefined;
  /** The concrete input for a step's tool, or undefined to pass targets and parameters through. */
  buildInput(step: ExecutionStep): Record<string, unknown> | undefined;
  /** Which input key a free-text parameter becomes, per tool. */
  textParamKeyByTool: Record<string, string>;
  defaultTextParamKey: string;
  /** Tools that must never fill a missing target from an earlier conversation reference. */
  noReferenceFallbackTools: string[];
}

export interface DomainPhrases {
  /** "no, i meant ...": the reply starts with an apology. */
  correction: RegExp;
  /** A model reply worth keeping as is ("I can't ..."). */
  keepModelReply: RegExp;
  looksLikeQuestion: RegExp;
  /** An answer-mode reply claiming it changed something (it can't have). */
  claimsAction: RegExp;
  notSureWhatToChange: string;
  notSureWhich: string;
  /** Named items the user doesn't have. */
  missing(names: string[]): string;
  ungrounded: string;
  keptReview: string;
  /** Said instead of a model answer that claimed to change something. */
  claimsActionReply: string;
  /** Greeting and "what can you do" replies. */
  greetings: Record<"hello" | "thanks" | "howAreYou" | "capabilities", string>;
}

export type PreRouteOutcome =
  /** `rest`: more of the message to handle after this reply ("rename X to Y and get rid of Z"). */
  | { kind: "reply"; response: RuntimeResponse; rest?: string }
  /** `notice` goes in front of the reply; `pinned` is the message with "it" resolved. */
  | { kind: "plan"; plan: IntentPlan; notice?: string; pinned?: string };

export interface PreRouteInput {
  userId: string;
  requestId: string;
  message: string;
  client: AIClientCapabilities;
  session: ConversationSession;
  requestContext: AIRequestContext;
  model: ModelGateway;
}

export interface CorrectionContext {
  message: string;
  lastReply: string;
  requestContext?: AIRequestContext;
}

export interface GroundingContext {
  userId: string;
  message: string;
  requestContext?: AIRequestContext;
  lastExchange?: Exchange;
  session: ConversationSession;
}

export interface GroundingResult {
  ungrounded: number;
  skippedMissing: string[];
  keptReviews: string[];
}

export interface FollowUpOffer {
  question: string;
  label: string;
  collection?: string;
  run: () => Promise<string>;
  /** What "no" replies (default: "Okay, I kept <label>."). */
  cancelMessage?: string;
}
