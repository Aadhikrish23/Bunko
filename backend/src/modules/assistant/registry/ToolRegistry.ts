import { AITool } from "../sdk/AITool";
import { AIToolRegistry } from "../sdk/AIToolRegistry";

export class ToolRegistry implements AIToolRegistry {
  private readonly tools = new Map<string, AITool>();

  register(tool: AITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): AITool | undefined {
    return this.tools.get(name);
  }

  list(): AITool[] {
    return Array.from(this.tools.values());
  }

  exists(name: string): boolean {
    return this.tools.has(name);
  }

  remove(name: string): void {
    this.tools.delete(name);
  }
}