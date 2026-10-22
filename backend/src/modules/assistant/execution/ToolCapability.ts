import { ToolExecutionPolicy } from "./ToolExecutionPolicy";
import { ToolParameter } from "./ToolParameter";

export interface ToolCapability {
  readonly id: string;
  readonly supportedIntent: string;
  readonly supportedEntityTypes: string[];
  readonly executionPolicy: ToolExecutionPolicy;
  readonly requiredParameters: string[];
  readonly optionalParameters: string[];
  readonly description: string;
  readonly parameters?: ToolParameter[];
}
