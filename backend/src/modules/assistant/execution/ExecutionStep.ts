export interface ExecutionStep {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}
