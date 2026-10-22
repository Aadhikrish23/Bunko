import { ClarificationRequest } from "../entity/ClarificationRequest";
import { ClarificationOption } from "../entity/ClarificationOption";
import { ConversationSession } from "../conversation/ConversationSession";
import aiTraceLogger from "../debug/AITraceLogger";

export class ClarificationResolver {
  /**
   * Resolves selected option from clarification candidates.
   */
  resolveClarification(
    userMessage: string,
    clarificationRequest: ClarificationRequest,
    session?: ConversationSession
  ): ClarificationOption | null {
    const query = userMessage.trim().toLowerCase();
    const candidates = clarificationRequest.candidates;

    if (!candidates || candidates.length === 0) return null;

    let selected: ClarificationOption | null = null;

    // Index or specific word detection
    if (
      query === "first" ||
      query === "1" ||
      query === "the first one" ||
      query === "the first" ||
      query === "first option"
    ) {
      selected = candidates[0] ?? null;
    } else if (
      query === "second" ||
      query === "2" ||
      query === "the second one" ||
      query === "the second" ||
      query === "second option"
    ) {
      selected = candidates[1] || null;
    } else if (
      query === "third" ||
      query === "3" ||
      query === "the third one" ||
      query === "the third" ||
      query === "third option"
    ) {
      selected = candidates[2] || null;
    } else if (
      query === "last" ||
      query === "the last" ||
      query === "last one" ||
      query === "the last one"
    ) {
      selected = candidates[candidates.length - 1] ?? null;
    } else if (query === "this one" || query === "that one") {
      // Try resolving using session references
      if (session && session.references) {
        const lastEntity = session.references.lastEntity;
        const currentBook = session.references.currentBook;

        if (lastEntity) {
          selected = candidates.find(
            (c) =>
              c.id === lastEntity.entityId ||
              c.label.toLowerCase() === lastEntity.displayName.toLowerCase()
          ) || null;
        }

        if (!selected && currentBook) {
          selected = candidates.find(
            (c) =>
              c.id === currentBook.entityId ||
              c.label.toLowerCase() === currentBook.displayName.toLowerCase()
          ) || null;
        }
      }

      // Default fallback if no match found
      if (!selected) {
        selected = candidates[0] ?? null;
      }
    }

    if (!selected) {
      // Try exact label match (case-insensitive)
      const matches = candidates.filter((c) => c.label.toLowerCase() === query);
      if (matches.length === 1) {
        selected = matches[0] ?? null;
      }
    }

    if (!selected) {
      // Try exact ID match
      const matches = candidates.filter((c) => c.id === userMessage);
      if (matches.length === 1) {
        selected = matches[0] ?? null;
      }
    }

    if (!selected) {
      // Try partial/substring label match (case-insensitive).
      // Auto-resume if only one candidate remains matching the user query.
      const matches = candidates.filter(
        (c) =>
          c.label.toLowerCase().includes(query) ||
          query.includes(c.label.toLowerCase())
      );
      if (matches.length === 1) {
        selected = matches[0] ?? null;
      }
    }

    const trace = aiTraceLogger.current();
    if (selected && trace) {
      trace.log("ClarificationRuntime", "Clarification Resolved", {
        userMessage,
        selectedCandidate: selected,
      });
    }

    return selected;
  }
}

export default new ClarificationResolver();
