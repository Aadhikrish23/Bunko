import { MemoryType } from "./MemoryType";
import { MemorySource } from "./MemorySource";

export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  key: string;
  value: string;
  confidence: number;
  source: MemorySource;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  usageCount: number;
  metadata?: Record<string, any>;
}
