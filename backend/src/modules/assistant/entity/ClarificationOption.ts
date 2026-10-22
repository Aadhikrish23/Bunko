export interface ClarificationOption {
  id: string;
  label: string;
  subtitle?: string;
  confidence?: number;
  payload?: Record<string, unknown>;
  
  // Phase 7 properties
  description?: string;
  metadata?: Record<string, unknown>;
}

