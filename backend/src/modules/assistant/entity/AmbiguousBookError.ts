export class AmbiguousBookError extends Error {
  constructor(bookName: string) {
    super(`Multiple books matched "${bookName}".`);
    this.name = "AmbiguousBookError";
    Object.setPrototypeOf(this, AmbiguousBookError.prototype);
  }
}
