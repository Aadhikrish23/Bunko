import { AIPlan } from "../types/AIPlan";
import { AIToolContext } from "./AIToolContext";

export interface AIPlanner {
    plan(
        request: string,
        context: AIToolContext
    ): Promise<AIPlan>;
}