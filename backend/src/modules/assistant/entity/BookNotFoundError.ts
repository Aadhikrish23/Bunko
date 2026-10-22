export class BookNotFoundError extends Error {
  constructor(bookName: string) {
    super(`Book "${bookName}" was not found in the user's library.`);
    this.name = "BookNotFoundError";
    Object.setPrototypeOf(this, BookNotFoundError.prototype);
  }
}
