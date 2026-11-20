import { cancelled, isLLMError, LLMError, type LLMErrorKind } from '../errors';
import { localFetch, type Lookup } from '../localEndpoint';
import { checkModelName, hasCloudSuffix } from '../modelNames';
import { readLines, withTimeouts } from '../streams';
import type {
  ChatMessage,
  GenerateEvent,
  GenerateRequest,
  InstallProgress,
  LLMProvider,
  ModelCapabilities,
  ModelInfo,
  ProviderDescriptor,
} from '../types';

/*
 * The Ollama adapter (BR-40 – BR-44, RULE-27, ADR-0014 §3). The only module that knows Ollama's
 * HTTP API. Everything it returns is provider-neutral (`llm/types.ts`), and every failure is an
 * `LLMError`.
 *
 * - Requests go only to this machine (`localFetch`: loopback, resolved, no redirects).
 * - Remote (cloud) models are reported as `remote` and never asked for details (RULE-27).
 * - Ollama's own error text is kept in the `LLMError` detail for the local log only.
 */

export const OLLAMA_PROVIDER_ID = 'ollama';
/** Not `localhost`: on Windows it can resolve to `::1` while Ollama listens on IPv4 (OD-36). */
export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
/** A download fails after this long without progress; there is no overall limit (OD-37). */
export const OLLAMA_PULL_IDLE_MS = 120_000;

export const OLLAMA_DESCRIPTOR: ProviderDescriptor = {
  id: OLLAMA_PROVIDER_ID,
  displayName: 'Ollama (on this computer)',
  location: 'local',
  settings: [
    {
      key: 'serverUrl',
      label: 'Ollama address',
      kind: 'local-url',
      defaultValue: OLLAMA_DEFAULT_URL,
      help: 'The address of Ollama on this computer. Start Ollama with "ollama serve" or the Ollama app.',
    },
  ],
};

export interface OllamaOptions {
  readonly serverUrl: string;
  /** Injected in tests: no test talks to a real Ollama. */
  readonly fetch?: typeof fetch;
  readonly lookup?: Lookup;
  readonly pullIdleMs?: number;
}

// --- Reading Ollama's responses ------------------------------------------------------------------

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** The kind of an error Ollama reports in a body or a stream line, from its message. */
function kindForMessage(message: string, fallback: LLMErrorKind): LLMErrorKind {
  if (/does not support tools/i.test(message)) return 'tools-unsupported';
  return fallback;
}

/** The kind of a failed HTTP response (ADR-0014 §3, "Errors"). */
function kindForStatus(status: number, message: string): LLMErrorKind {
  if (status === 400) return kindForMessage(message, 'bad-request');
  if (status === 404) return 'model-unavailable';
  if (status === 503) return 'busy';
  if (status >= 500) return 'model-error';
  return 'bad-request';
}

async function failure(response: Response): Promise<LLMError> {
  let message = '';
  try {
    const body = await response.text();
    try {
      const json: unknown = JSON.parse(body);
      message = isObject(json) && typeof json.error === 'string' ? json.error : body;
    } catch {
      message = body;
    }
  } catch {
    // The body could not be read; the status is enough.
  }
  return new LLMError(
    kindForStatus(response.status, message),
    `HTTP ${response.status}${message ? `: ${message.slice(0, 300)}` : ''}`,
  );
}

/** The JSON objects of an NDJSON response, one per line. */
async function* ndjson(response: Response, signal: AbortSignal): AsyncGenerator<Json> {
  if (!response.body) throw new LLMError('invalid-response', 'no response body');
  try {
    for await (const line of readLines(response.body)) {
      if (signal.aborted) throw cancelled();
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new LLMError('invalid-response', 'a response line is not JSON');
      }
      if (!isObject(value))
        throw new LLMError('invalid-response', 'a response line is not an object');
      yield value;
    }
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (isLLMError(error)) throw error;
    throw new LLMError('unavailable', `connection lost: ${(error as Error).message}`);
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<Json> {
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (signal.aborted) throw cancelled();
    throw new LLMError('invalid-response', `not JSON: ${(error as Error).message}`);
  }
  if (!isObject(value)) throw new LLMError('invalid-response', 'not a JSON object');
  return value;
}

// --- Converting to Ollama's chat format ----------------------------------------------------------

function toOllamaMessages(request: GenerateRequest): Json[] {
  const messages: Json[] = [{ role: 'system', content: request.system }];
  for (const message of request.messages) messages.push(toOllamaMessage(message));
  return messages;
}

function toOllamaMessage(message: ChatMessage): Json {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.text };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.text,
        ...(message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                function: {
                  name: call.name,
                  // Ollama expects an object; a model that sent something else gets it back empty.
                  arguments: isObject(call.arguments) ? call.arguments : {},
                },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', content: message.content, tool_name: message.name };
  }
}

/** The arguments as the model sent them: an object, or a JSON string of one. */
function toolArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value; // invalid arguments are reported to the model by the tool's validation
  }
}

// --- Models --------------------------------------------------------------------------------------

interface ShowInfo {
  readonly capabilities: ModelCapabilities;
  readonly contextWindow: number | null;
}

const UNKNOWN_CAPABILITIES: ModelCapabilities = {
  toolCalling: 'unknown',
  streaming: 'unknown',
  structuredOutput: 'unknown',
  other: [],
};

function readShow(show: Json): ShowInfo {
  const reported = Array.isArray(show.capabilities)
    ? show.capabilities.filter((c): c is string => typeof c === 'string')
    : null;
  const info = isObject(show.model_info) ? show.model_info : {};
  const architecture = text(info['general.architecture']);
  const contextWindow = architecture ? count(info[`${architecture}.context_length`]) : null;
  return {
    capabilities: {
      // Without a capability list (older Ollama) tool calling is unknown; the model test decides.
      toolCalling: reported === null ? 'unknown' : reported.includes('tools'),
      streaming: true,
      // Ollama's `format` takes a JSON Schema for local models.
      structuredOutput: true,
      other: (reported ?? []).filter((c) => c !== 'tools' && c !== 'completion'),
    },
    contextWindow,
  };
}

/** Failures of the connection itself, which no other model request would get past either. */
const CONNECTION_FAILURES: ReadonlySet<LLMErrorKind> = new Set([
  'unavailable',
  'not-local',
  'timeout',
]);

// Implements: BR-40, BR-41, BR-42, BR-43, BR-44, RULE-27, AC-45, AC-46, AC-47, AC-51
export function createOllamaProvider(options: OllamaOptions): LLMProvider {
  const pullIdleMs = options.pullIdleMs ?? OLLAMA_PULL_IDLE_MS;
  /** Details per digest: they only change when the model's files change. */
  const showCache = new Map<string, ShowInfo>();
  let turns = 0;

  async function call(
    path: string,
    init: { readonly method: string; readonly body?: Json },
    signal: AbortSignal,
  ): Promise<Response> {
    if (signal.aborted) throw cancelled();
    const response = await localFetch(
      options.serverUrl,
      path,
      {
        method: init.method,
        signal,
        ...(init.body
          ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } }
          : {}),
      },
      {
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.lookup ? { lookup: options.lookup } : {}),
      },
    );
    if (!response.ok) throw await failure(response);
    return response;
  }

  async function show(name: string, digest: string | null, signal: AbortSignal): Promise<ShowInfo> {
    const cached = digest ? showCache.get(digest) : undefined;
    if (cached) return cached;
    try {
      const info = readShow(
        await readJson(
          await call('/api/show', { method: 'POST', body: { model: name } }, signal),
          signal,
        ),
      );
      if (digest) showCache.set(digest, info);
      return info;
    } catch (error) {
      // One model without details does not hide the others; it is listed with unknown capabilities.
      if (signal.aborted) throw cancelled();
      if (!isLLMError(error) || CONNECTION_FAILURES.has(error.kind)) throw error;
      return { capabilities: UNKNOWN_CAPABILITIES, contextWindow: null };
    }
  }

  async function listModels(signal: AbortSignal): Promise<readonly ModelInfo[]> {
    const tags = await readJson(await call('/api/tags', { method: 'GET' }, signal), signal);
    if (!Array.isArray(tags.models)) throw new LLMError('invalid-response', 'no model list');
    const entries = tags.models.filter(isObject).filter((m) => text(m.name) ?? text(m.model));
    return Promise.all(
      entries.map(async (entry): Promise<ModelInfo> => {
        const id = (text(entry.name) ?? text(entry.model))!; // filtered above
        const details = isObject(entry.details) ? entry.details : {};
        const digest = text(entry.digest);
        // A cloud model is never asked for details: that request could reach the cloud (RULE-27).
        const remote =
          text(entry.remote_host) !== null ||
          text(entry.remote_model) !== null ||
          hasCloudSuffix(id);
        const info = remote
          ? { capabilities: UNKNOWN_CAPABILITIES, contextWindow: null }
          : await show(id, digest, signal);
        return {
          id,
          name: id,
          sizeBytes: count(entry.size),
          parameterSize: text(details.parameter_size),
          quantization: text(details.quantization_level),
          contextWindow: info.contextWindow,
          capabilities: info.capabilities,
          location: remote ? 'remote' : 'local',
          revision: digest,
        };
      }),
    );
  }

  async function* generate(
    request: GenerateRequest,
    signal: AbortSignal,
  ): AsyncGenerator<GenerateEvent> {
    turns += 1;
    const turn = turns;
    const response = await call(
      '/api/chat',
      {
        method: 'POST',
        body: {
          model: request.model,
          messages: toOllamaMessages(request),
          ...(request.tools.length > 0
            ? {
                tools: request.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
              }
            : {}),
          ...(request.responseSchema ? { format: request.responseSchema } : {}),
          stream: true,
          options: { num_ctx: request.contextTokens, num_predict: request.maxOutputTokens },
        },
      },
      signal,
    );
    let calls = 0;
    for await (const chunk of ndjson(response, signal)) {
      if (typeof chunk.error === 'string') {
        throw new LLMError(kindForMessage(chunk.error, 'model-error'), chunk.error.slice(0, 300));
      }
      const message = isObject(chunk.message) ? chunk.message : {};
      // `thinking` text is neither shown nor kept (ADR-0014 §3).
      const content = text(message.content);
      if (content) yield { type: 'text', delta: content };
      for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        const fn = isObject(toolCall) && isObject(toolCall.function) ? toolCall.function : null;
        const name = fn ? text(fn.name) : null;
        if (!fn || !name) throw new LLMError('invalid-response', 'a tool call has no name');
        calls += 1;
        yield {
          type: 'tool-call',
          call: { id: `call-${turn}-${calls}`, name, arguments: toolArguments(fn.arguments) },
        };
      }
      if (chunk.done === true) {
        yield {
          type: 'finish',
          reason: calls > 0 ? 'tool-calls' : chunk.done_reason === 'length' ? 'length' : 'stop',
          usage: {
            inputTokens: count(chunk.prompt_eval_count),
            outputTokens: count(chunk.eval_count),
          },
        };
        return;
      }
    }
    throw new LLMError('invalid-response', 'the answer ended before it was done');
  }

  async function* install(rawName: string, signal: AbortSignal): AsyncGenerator<InstallProgress> {
    const checked = checkModelName(rawName);
    if (!checked.ok) throw new LLMError('bad-request', checked.problem);
    const stalled = new AbortController();
    const both = AbortSignal.any([signal, stalled.signal]);
    const response = await call(
      '/api/pull',
      { method: 'POST', body: { model: checked.name, stream: true } },
      both,
    );
    const progress = withTimeouts(
      ndjson(response, both),
      { firstMs: pullIdleMs, idleMs: pullIdleMs },
      () => stalled.abort(),
    );
    try {
      for await (const line of progress) {
        if (typeof line.error === 'string') {
          const kind = /file does not exist|not found|manifest unknown/i.test(line.error)
            ? 'model-unavailable'
            : 'model-error';
          throw new LLMError(kind, line.error.slice(0, 300));
        }
        const status = text(line.status) ?? '';
        if (status === 'success') return;
        yield { status, completedBytes: count(line.completed), totalBytes: count(line.total) };
      }
    } catch (error) {
      if (signal.aborted) throw cancelled();
      throw error;
    }
    // Ollama confirms a complete download with `success`; anything else was interrupted.
    throw new LLMError('invalid-response', 'the download ended before it completed');
  }

  async function remove(rawName: string, signal: AbortSignal): Promise<void> {
    const checked = checkModelName(rawName);
    if (!checked.ok) throw new LLMError('bad-request', checked.problem);
    const response = await call(
      '/api/delete',
      { method: 'DELETE', body: { model: checked.name } },
      signal,
    );
    await response.body?.cancel().catch(() => {});
  }

  return {
    descriptor: OLLAMA_DESCRIPTOR,
    async checkConnection(signal) {
      const version = await readJson(await call('/api/version', { method: 'GET' }, signal), signal);
      return { version: text(version.version) };
    },
    listModels,
    generate,
    models: { install, remove },
  };
}
