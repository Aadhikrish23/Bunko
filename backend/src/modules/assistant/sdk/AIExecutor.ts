import { AIPlan } from "../types/AIPlan";
import { AIToolContext } from "./AIToolContext";
import { AIToolResult } from "./AIToolResult";

export interface AIExecutor {
    execute(
        plan: AIPlan,
        context: AIToolContext
    ): Promise<AIToolResult[]>;
}