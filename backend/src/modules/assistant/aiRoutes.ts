import { Router } from "express";
import { z } from "zod";
import { aiController, resetConversation } from "./aiController";
import { authMiddleware } from "../../middleware/auth";
import { validate } from "../../middleware/validate";

// Wiring file (like aiController.ts): the one other place allowed to import Bunko's own
// modules -- its JWT auth (sets req.user.id) and request validation. Mounted at
// /api/v1/assistant (SRS §20.6).
const chatSchema = z
  .object({
    message: z.string().trim().min(1, "Please tell me what you'd like to do.").max(2_000),
    // The book page the reader has open, for "this one".
    client: z.object({ pageBookId: z.string().uuid().optional() }).strict().optional(),
  })
  .strict();

const router = Router();

router.post("/chat", authMiddleware, validate(chatSchema), aiController.chat.bind(aiController));
router.post("/reset", authMiddleware, resetConversation);

export default router;
