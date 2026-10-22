import { Router } from "express";
import { aiController, resetConversation } from "./aiController";
import { authMiddleware } from "../../middleware/auth";

// Wiring file (like aiController.ts): the one other place allowed to import
// Bunko's own modules -- here, its JWT auth, which sets req.user.id.
const router = Router();

router.post("/chat", authMiddleware, aiController.chat.bind(aiController));
router.post("/reset", authMiddleware, resetConversation);

export default router;
