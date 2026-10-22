export class GameNotFoundError extends Error {
  constructor(gameName: string) {
    super(`Game "${gameName}" was not found in the user's library.`);
    this.name = "GameNotFoundError";
    Object.setPrototypeOf(this, GameNotFoundError.prototype);
  }
}
