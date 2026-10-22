import { ConversationSession } from "./ConversationSession";
import { ConversationReference } from "./ConversationReference";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { IntentTargetType } from "../intent/IntentTargetType";
import aiTraceLogger from "../debug/AITraceLogger";
import { domainPack } from "../domain/activeDomain";

import { OptionEntity } from "../clarification/ClarificationOptionBuilder";

export class ConversationReferenceManager {
  /**
   * Updates conversational reference slots based on resolved intent plan.
   */
  updateReferences(session: ConversationSession, resolvedIntentPlan: ResolvedIntentPlan): void {
    if (!resolvedIntentPlan || !resolvedIntentPlan.intents) return;

    const trace = aiTraceLogger.current();

    for (const intent of resolvedIntentPlan.intents) {
      if (intent.type) {
        session.references.lastIntent = intent.type;
      }

      if (!intent.resolvedTargets) continue;

      for (const target of intent.resolvedTargets) {
        let entityId = target.originalTarget.name;
        let displayName = target.originalTarget.name;
        const entityType = target.originalTarget.type;

        if (target.resolution?.entity) {
          const ent = target.resolution.entity as OptionEntity;
          if (ent._id) {
            entityId = ent._id.toString();
          }
          if (ent.title) {
            displayName = ent.title;
          } else if (ent.name) {
            displayName = ent.name;
          }
        }

        const ref: ConversationReference = {
          entityType,
          entityId,
          displayName,
          metadata: {
            resolvedAt: new Date().toISOString()
          }
        };

        // Update generic last entity
        session.references.lastEntity = ref;
        if (trace) {
          trace.log("ConversationRuntime", "Reference Added", {
            slot: "lastEntity",
            reference: ref
          });
        }

        // Update slots depending on entityType. An item the user just added (the
        // "Library" target of an intent the pack runs first, i.e. an add) is what
        // "it" refers to next, not whichever item was current before.
        const isAddedBook = entityType === IntentTargetType.Library && domainPack().runsFirst(intent.type);
        if (entityType === IntentTargetType.Book || isAddedBook) {
          session.references.currentBook = ref;
          if (trace) {
            trace.log("ConversationRuntime", "Reference Added", {
              slot: "currentBook",
              reference: ref
            });
          }
        } else if (entityType === IntentTargetType.Collection) {
          session.references.currentCollection = ref;
          if (trace) {
            trace.log("ConversationRuntime", "Reference Added", {
              slot: "currentCollection",
              reference: ref
            });
          }
        } else if (entityType === IntentTargetType.Provider) {
          session.references.currentProvider = ref;
          if (trace) {
            trace.log("ConversationRuntime", "Reference Added", {
              slot: "currentProvider",
              reference: ref
            });
          }
        }
      }
    }
  }

  /**
   * Adds or replaces a reference in a specific slot manually.
   */
  addOrReplaceReference(session: ConversationSession, slot: string, ref: ConversationReference): void {
    session.references[slot] = ref;
    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ConversationRuntime", "Reference Added", {
        slot,
        reference: ref
      });
    }
  }

  /**
   * Clears all conversational reference slots.
   */
  clearReferences(session: ConversationSession): void {
    session.references = {
      currentBook: null,
      currentCollection: null,
      currentProvider: null,
      lastEntity: null,
      lastIntent: null,
      pendingEntity: null
    };
  }
}

export default new ConversationReferenceManager();
