import { IntentPlan } from "../intent/IntentPlan";
import { ConversationSession } from "./ConversationSession";
import { IntentTargetType } from "../intent/IntentTargetType";
import aiTraceLogger from "../debug/AITraceLogger";

export class PronounResolver {
  /**
   * Resolves target names that are pronouns using current conversational slots.
   */
  resolveReferences(intentPlan: IntentPlan, session: ConversationSession): IntentPlan {
    if (!intentPlan || !intentPlan.intents) return intentPlan;

    const trace = aiTraceLogger.current();

    for (const intent of intentPlan.intents) {
      if (!intent.targets) continue;

      for (const target of intent.targets) {
        const nameLower = target.name.trim().toLowerCase();

        let resolvedName: string | null = null;

        if (target.type === IntentTargetType.Game) {
          if (this.isGamePronoun(nameLower)) {
            resolvedName = session.references.currentGame?.displayName ||
                           session.references.lastEntity?.displayName ||
                           null;
          }
        } else if (target.type === IntentTargetType.Collection) {
          if (this.isCollectionPronoun(nameLower)) {
            resolvedName = session.references.currentCollection?.displayName ||
                           session.references.lastEntity?.displayName ||
                           null;
          }
        } else if (target.type === IntentTargetType.Provider) {
          if (this.isProviderPronoun(nameLower)) {
            resolvedName = session.references.currentProvider?.displayName ||
                           session.references.lastEntity?.displayName ||
                           null;
          }
        } else {
          if (this.isGeneralPronoun(nameLower)) {
            resolvedName = session.references.lastEntity?.displayName || null;
          }
        }

        if (resolvedName) {
          const original = target.name;
          target.name = resolvedName;
          if (trace) {
            trace.log("ConversationRuntime", "Reference Resolved", {
              original,
              resolved: resolvedName,
              type: target.type
            });
          }
        }
      }
    }

    return intentPlan;
  }

  private isGamePronoun(name: string): boolean {
    const pronouns = ["it", "that", "this game", "the game", "the previous one", "last game", "the previous game", "the first one", "the second one", "the third one"];
    return pronouns.includes(name);
  }

  private isCollectionPronoun(name: string): boolean {
    const pronouns = ["it", "that", "the collection", "this collection", "the previous one", "last collection", "the previous collection"];
    return pronouns.includes(name);
  }

  private isProviderPronoun(name: string): boolean {
    const pronouns = ["it", "that", "the provider", "this provider", "the previous one", "last provider", "the previous provider"];
    return pronouns.includes(name);
  }

  private isGeneralPronoun(name: string): boolean {
    const pronouns = ["it", "that", "this", "the previous one"];
    return pronouns.includes(name);
  }
}

export default new PronounResolver();
