export interface ConversationReference {
  entityType: string;
  entityId: string;
  displayName: string;
  metadata?: Record<string, unknown>;
}
