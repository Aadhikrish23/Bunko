export class ClarificationStrategy {
  // Configurable priorities
  private priorities: string[] = [
    "game",
    "entity",
    "status",
    "platform",
    "rating",
    "provider",
    "review",
  ];

  /**
   * Sorts missing facts according to priority rules.
   */
  prioritizeMissingFacts(facts: string[]): string[] {
    return [...facts].sort((a, b) => {
      const idxA = this.priorities.indexOf(a.toLowerCase());
      const idxB = this.priorities.indexOf(b.toLowerCase());

      const scoreA = idxA === -1 ? 999 : idxA;
      const scoreB = idxB === -1 ? 999 : idxB;

      return scoreA - scoreB;
    });
  }

  /**
   * Updates the priority configuration.
   */
  setPriorities(newPriorities: string[]): void {
    this.priorities = newPriorities;
  }
}

export default new ClarificationStrategy();
