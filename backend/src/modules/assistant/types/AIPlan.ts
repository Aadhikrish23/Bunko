export interface AIPlanStep {
  id: string;

  tool: string;

  input: Record<string, unknown>;
}

export interface AIPlan {

    id: string;

    steps: AIPlanStep[];

}
