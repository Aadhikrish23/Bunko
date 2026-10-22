export class GameNameNormalizer {
  /**
   * Normalizes a game name string by:
   * - normalising unicode characters
   * - converting to lowercase
   * - replacing punctuation and non-alphanumeric characters with spaces
   * - collapsing multiple spaces into one
   * - trimming leading/trailing whitespace
   */
  static normalize(name: string): string {
    if (!name) {
      return "";
    }
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }
}
