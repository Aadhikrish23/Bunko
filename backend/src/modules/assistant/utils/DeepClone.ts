/**
 * Centralized utility for deep cloning objects.
 * Uses structuredClone where supported by runtime, falling back to JSON serialization as last resort.
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback in case of non-clonable elements
    }
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

export default deepClone;
