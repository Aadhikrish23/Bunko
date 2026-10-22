export interface ConversationTurn {
  requestId: string;
  timestamp: Date;
  userMessage: string;
  assistantResponse: {
    success: boolean;
    message?: string;
    status?: string;
    clarificationRequest?: {
      requestId: string;
      type: string;
      reason: string;
      entityType: string;
      originalQuery: string;
      candidates: Array<{
        id: string;
        label: string;
        subtitle?: string;
        confidence?: number;
      }>;
    } | null;
  };
  intentPlanId?: string | null;
  executionPlanId?: string | null;
  summary?: string | null;
  referencesCreated?: string[] | null;
}
