import { ClarificationType } from "./ClarificationType";

export interface ClarificationTemplateInput {
  originalQuery?: string;
  entityType?: string;
  missingFact?: string;
}

export class ClarificationTemplateRegistry {
  private readonly templates = new Map<string, (input: ClarificationTemplateInput) => string>();

  constructor() {
    this.templates.set(ClarificationType.AMBIGUOUS_ENTITY, (input) => {
      const queryStr = input.originalQuery ? `"${input.originalQuery}" ` : "";
      const typeStr = input.entityType?.toLowerCase() || "entity";
      return `Which ${queryStr}${typeStr} did you mean?`;
    });

    this.templates.set(ClarificationType.MISSING_ENTITY, (input) => {
      const entity = input.entityType || "book";
      return `Which ${entity.toLowerCase()} are you referring to?`;
    });

    this.templates.set(ClarificationType.MISSING_PARAMETER, (input) => {
      const fact = input.missingFact?.toLowerCase() || "";
      if (fact === "rating") {
        return "What rating (1-10) would you like to give?";
      }
      if (fact === "status") {
        return "What status should I set for that book?";
      }
      if (fact === "collection" || fact === "collectionname" || fact === "name") {
        return "Which collection would you like to use?";
      }
      if (fact === "searchvalue" || fact === "query") {
        return "What should I look for in your library?";
      }
      if (fact === "content") {
        return "What should the note say?";
      }
      if (fact === "bookid" || fact === "bookname" || fact === "book") {
        return "Which book do you mean?";
      }
      return "Could you tell me a bit more about what you'd like me to do?";
    });

    this.templates.set(ClarificationType.CONFIRM_ACTION, () => {
      return "Are you sure you want to perform this action?";
    });
  }

  getQuestion(type: ClarificationType, input: ClarificationTemplateInput): string {
    const generator = this.templates.get(type);
    if (generator) {
      return generator(input);
    }
    return "Could you please clarify?";
  }
}

export default new ClarificationTemplateRegistry();
