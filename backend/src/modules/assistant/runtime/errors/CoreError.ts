class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational!: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    if (this.statusCode < 500) {
      this.status = "Fail";
    } else {
      this.status = "Error";
    }
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export default AppError;