import { AITool } from "./AITool";

export interface AIToolRegistry {
  register(tool: AITool): void;

  get(name: string): AITool | undefined;

  list(): AITool[];

  exists(name: string): boolean;
  remove(name: string): void;
}
