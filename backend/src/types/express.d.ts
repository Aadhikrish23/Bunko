// Augments Express's Request type with fields our middleware attaches.
// authMiddleware (T-009) sets `user`; request-logger (T-011) sets `id`.
declare namespace Express {
  interface Request {
    id: string;
    user?: {
      id: string;
      email: string;
    };
  }
}
