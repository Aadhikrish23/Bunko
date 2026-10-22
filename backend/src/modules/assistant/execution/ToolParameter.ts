export interface ToolParameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly validator?: (value: unknown) => boolean | string;
  readonly resolver?: (context: unknown) => unknown;
}
