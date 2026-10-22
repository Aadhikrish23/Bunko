export class AmbiguousGameError extends Error {
  constructor(gameName: string) {
    super(`Multiple games matched "${gameName}".`);
    this.name = "AmbiguousGameError";
    Object.setPrototypeOf(this, AmbiguousGameError.prototype);
  }
}
