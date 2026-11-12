export interface ToolAnnotations {
  readonly title?: string | undefined;
  readonly readOnlyHint?: boolean | undefined;
  readonly destructiveHint?: boolean | undefined;
  readonly idempotentHint?: boolean | undefined;
  readonly openWorldHint?: boolean | undefined;
}

export interface ToolEntry {
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly annotations?: ToolAnnotations | undefined;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ResourceEntry {
  readonly uri: string;
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

export interface ResourceTemplateEntry {
  readonly uriTemplate: string;
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

interface PromptArgumentEntry {
  readonly name: string;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
}

export interface PromptEntry {
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly arguments?: readonly PromptArgumentEntry[] | undefined;
}

export interface Reference {
  readonly tools: readonly ToolEntry[];
  readonly resources: readonly ResourceEntry[];
  readonly resourceTemplates: readonly ResourceTemplateEntry[];
  readonly prompts: readonly PromptEntry[];
}
