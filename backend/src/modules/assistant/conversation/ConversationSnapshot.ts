export interface ConversationSnapshot {
  sessionId: string;
  userId: string;
  status: string;
  turnsCount: number;
  lastMessageAt?: Date;
  snapshotAt: Date;
}
