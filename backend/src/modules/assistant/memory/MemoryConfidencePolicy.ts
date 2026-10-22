export const MemoryConfidencePolicy = {
  INITIAL_CONFIDENCE: 0.50,
  LEARNING_INCREMENT: 0.10,
  REPEATED_USAGE_INCREMENT: 0.02,
  OVERRIDE_DECREMENT: 0.20,
  OVERRIDE_THRESHOLD: 0.20,

  strengthen(currentConfidence: number): number {
    return Math.min(1.0, currentConfidence + this.LEARNING_INCREMENT);
  },

  strengthenRepeated(currentConfidence: number): number {
    return Math.min(1.0, currentConfidence + this.REPEATED_USAGE_INCREMENT);
  },

  weaken(currentConfidence: number): number {
    return Math.max(0.0, currentConfidence - this.OVERRIDE_DECREMENT);
  },

  shouldOverride(currentConfidence: number): boolean {
    return currentConfidence <= this.OVERRIDE_THRESHOLD;
  }
};

export default MemoryConfidencePolicy;
