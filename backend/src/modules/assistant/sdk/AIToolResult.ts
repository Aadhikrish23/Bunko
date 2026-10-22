import { ToolExecutionResult } from "./ToolExecutionResult";

export interface AIToolResult<T = unknown> extends ToolExecutionResult<T> {}