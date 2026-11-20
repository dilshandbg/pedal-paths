/*
 * The provider-neutral language-model interface of the assistant (BR-40, ADR-0014 §2).
 *
 * Everything outside `llm/providers/*` talks to a model only through these types. They contain no
 * provider's field names, endpoints or error formats: an adapter converts to and from them.
 */

/** The JSON Schema subset tool parameters use: an object of named primitive values. */
export interface JsonSchemaProperty {
  readonly type: 'string' | 'number' | 'integer' | 'boolean';
  readonly description: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
}

export interface JsonSchemaObject {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** A setting a provider needs, rendered generically by the settings screen. */
export interface ProviderSetting {
  readonly key: string;
  readonly label: string;
  readonly kind: 'local-url';
  readonly defaultValue: string;
  readonly help: string;
}

export interface ProviderDescriptor {
  readonly id: string;
  readonly displayName: string;
  /** Where inference runs. BRD v2.4 allows only local providers (BR-44). */
  readonly location: 'local';
  readonly settings: readonly ProviderSetting[];
}

export interface ModelCapabilities {
  readonly toolCalling: boolean | 'unknown';
  readonly streaming: boolean | 'unknown';
  readonly structuredOutput: boolean | 'unknown';
  /** Other capabilities the provider reports (e.g. `thinking`, `vision`), for information. */
  readonly other: readonly string[];
}

export interface ModelInfo {
  /** The identifier the provider uses, e.g. `qwen3:8b`. */
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number | null;
  /** E.g. `8.2B`. */
  readonly parameterSize: string | null;
  /** E.g. `Q4_K_M`. */
  readonly quantization: string | null;
  /** In tokens. */
  readonly contextWindow: number | null;
  readonly capabilities: ModelCapabilities;
  /** A remote (cloud) model is never offered or used (RULE-27). */
  readonly location: 'local' | 'remote';
  /** Changes when the model's files change (e.g. a digest); a model evaluation belongs to one revision. */
  readonly revision: string | null;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchemaObject;
}

/** A tool call as the model made it. `arguments` is whatever the model sent: validate it. */
export interface ToolCall {
  /** Unique within a conversation; assigned by the adapter when the provider has none. */
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}

export type ChatMessage =
  | { readonly role: 'user'; readonly text: string }
  | { readonly role: 'assistant'; readonly text: string; readonly toolCalls: readonly ToolCall[] }
  | {
      readonly role: 'tool';
      readonly callId: string;
      readonly name: string;
      readonly content: string;
      readonly isError: boolean;
    };

export interface GenerateRequest {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolDefinition[];
  /** Asks for structured output, only when the model supports it. */
  readonly responseSchema?: JsonSchemaObject;
  /** Context window to use, in tokens. */
  readonly contextTokens: number;
  readonly maxOutputTokens: number;
}

export interface TokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export type FinishReason = 'stop' | 'tool-calls' | 'length';

/** One model turn is a stream of these, ending with exactly one `finish`. */
export type GenerateEvent =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'tool-call'; readonly call: ToolCall }
  | { readonly type: 'finish'; readonly reason: FinishReason; readonly usage: TokenUsage | null };

export interface InstallProgress {
  /** The provider's own status text, e.g. `pulling manifest`. */
  readonly status: string;
  readonly completedBytes: number | null;
  readonly totalBytes: number | null;
}

/** Installing and removing models, for providers that keep models locally (Ollama). */
export interface ModelManager {
  /** Streams progress; ends normally only when the model is installed completely. */
  install(name: string, signal: AbortSignal): AsyncIterable<InstallProgress>;
  remove(name: string, signal: AbortSignal): Promise<void>;
}

export interface ConnectionStatus {
  readonly version: string | null;
}

export interface LLMProvider {
  readonly descriptor: ProviderDescriptor;
  /** Resolves when the provider is reachable; generates nothing. Throws `LLMError` otherwise. */
  checkConnection(signal: AbortSignal): Promise<ConnectionStatus>;
  listModels(signal: AbortSignal): Promise<readonly ModelInfo[]>;
  /** One model turn. Throws `LLMError` on failure, including when `signal` aborts. */
  generate(request: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateEvent>;
  /** Present only when models can be installed and removed through the provider. */
  readonly models?: ModelManager;
}
