/*
 * A mocked Ollama HTTP API (ai-assistant.md §6): a `fetch` replacement that answers like Ollama
 * from scripted responses. No port, no network, and no Ollama installed. It records every request
 * and honours the abort signal, as a real connection would.
 */

export interface FakeOllamaModel {
  readonly name: string;
  readonly digest?: string;
  readonly size?: number;
  readonly parameterSize?: string;
  readonly quantization?: string;
  readonly architecture?: string;
  readonly contextLength?: number;
  /** `/api/show` capabilities; omitted, the field is left out (older Ollama). */
  readonly capabilities?: readonly string[];
  readonly remoteHost?: string;
  readonly remoteModel?: string;
  /** `/api/show` fails for this model with this status. */
  readonly showStatus?: number;
}

/** One scripted response. */
export interface FakeResponse {
  readonly status?: number;
  /** A JSON body (or raw text). */
  readonly json?: unknown;
  readonly raw?: string;
  /** NDJSON lines: objects are serialized, strings are sent as they are. */
  readonly lines?: readonly unknown[];
  /** Wait before each line. */
  readonly lineDelayMs?: number;
  /** Never answers; only an abort ends the request. */
  readonly hang?: boolean;
  /** Sends the lines, then never ends; only an abort ends the request. */
  readonly hangAfterLines?: boolean;
  /** The connection is refused (fetch rejects). */
  readonly refuse?: boolean;
  /** Breaks the connection after the lines. */
  readonly breakAfterLines?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly body: unknown;
}

type Handler = (body: unknown, index: number) => FakeResponse;

export interface FakeOllamaOptions {
  readonly version?: string;
  readonly models?: readonly FakeOllamaModel[];
  readonly chat?: Handler | readonly FakeResponse[];
  readonly pull?: Handler;
  readonly remove?: Handler;
  /** Overrides any route, e.g. to refuse every connection. */
  readonly override?: (path: string) => FakeResponse | null;
}

export interface FakeOllama {
  readonly fetch: typeof fetch;
  readonly requests: RecordedRequest[];
  set(options: Partial<FakeOllamaOptions>): void;
  /** Requests to one path. */
  to(path: string): RecordedRequest[];
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

const wait = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(timer), reject(abortError())), {
      once: true,
    });
  });

const untilAborted = (signal: AbortSignal | undefined) =>
  new Promise<never>((_, reject) => {
    if (signal?.aborted) return reject(abortError());
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });

/** A streamed body that errors as a dropped connection would when the request is aborted. */
function streamBody(response: FakeResponse, signal: AbortSignal | undefined) {
  const encoder = new TextEncoder();
  const lines = response.lines ?? [];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const onAbort = () => controller.error(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        for (const line of lines) {
          if (response.lineDelayMs) await wait(response.lineDelayMs, signal);
          controller.enqueue(
            encoder.encode(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`),
          );
        }
        if (response.hangAfterLines) await untilAborted(signal);
        if (response.breakAfterLines) controller.error(new TypeError('terminated'));
        else controller.close();
      } catch {
        // Aborted: the stream was already errored by onAbort.
      }
    },
  });
}

export const chatLines = {
  text: (...parts: string[]) => [
    ...parts.map((content) => ({
      model: 'qwen3:8b',
      message: { role: 'assistant', content },
      done: false,
    })),
    {
      model: 'qwen3:8b',
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 120,
      eval_count: 14,
    },
  ],
  toolCall: (name: string, args: unknown) => [
    {
      model: 'qwen3:8b',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name, arguments: args } }],
      },
      done: false,
    },
    {
      model: 'qwen3:8b',
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
    },
  ],
};

export const QWEN: FakeOllamaModel = {
  name: 'qwen3:8b',
  digest: 'sha256:qwen3-8b-digest',
  size: 5_225_388_164,
  parameterSize: '8.2B',
  quantization: 'Q4_K_M',
  architecture: 'qwen3',
  contextLength: 40_960,
  capabilities: ['completion', 'tools', 'thinking'],
};

export function createFakeOllama(initial: FakeOllamaOptions = {}): FakeOllama {
  let options: FakeOllamaOptions = { version: '0.12.6', models: [QWEN], ...initial };
  const requests: RecordedRequest[] = [];
  let chatIndex = 0;

  const route = (method: string, path: string, body: unknown): FakeResponse => {
    const override = options.override?.(path);
    if (override) return override;
    const models = options.models ?? [];
    const name = (body as { model?: unknown } | null)?.model;
    if (method === 'GET' && path === '/api/version') return { json: { version: options.version } };
    if (method === 'GET' && path === '/api/tags') {
      return {
        json: {
          models: models.map((m) => ({
            name: m.name,
            model: m.name,
            size: m.size ?? 1_000,
            digest: m.digest ?? `sha256:${m.name}`,
            details: {
              format: 'gguf',
              parameter_size: m.parameterSize ?? '1B',
              quantization_level: m.quantization ?? 'Q4_K_M',
            },
            ...(m.remoteHost ? { remote_host: m.remoteHost } : {}),
            ...(m.remoteModel ? { remote_model: m.remoteModel } : {}),
          })),
        },
      };
    }
    if (method === 'POST' && path === '/api/show') {
      const model = models.find((m) => m.name === name);
      if (!model) return { status: 404, json: { error: `model '${String(name)}' not found` } };
      if (model.showStatus) return { status: model.showStatus, json: { error: 'show failed' } };
      const architecture = model.architecture ?? 'llama';
      return {
        json: {
          details: { parameter_size: model.parameterSize, quantization_level: model.quantization },
          model_info: {
            'general.architecture': architecture,
            ...(model.contextLength
              ? { [`${architecture}.context_length`]: model.contextLength }
              : {}),
          },
          ...(model.capabilities ? { capabilities: model.capabilities } : {}),
        },
      };
    }
    if (method === 'POST' && path === '/api/chat') {
      const chat = options.chat ?? [{ lines: chatLines.text('Hello.') }];
      const index = chatIndex;
      chatIndex += 1;
      if (typeof chat === 'function') return chat(body, index);
      return chat[Math.min(index, chat.length - 1)] ?? { status: 500 };
    }
    if (method === 'POST' && path === '/api/pull') {
      return (
        options.pull?.(body, 0) ?? {
          lines: [
            { status: 'pulling manifest' },
            { status: 'pulling abc', digest: 'sha256:abc', total: 100, completed: 50 },
            { status: 'pulling abc', digest: 'sha256:abc', total: 100, completed: 100 },
            { status: 'verifying sha256 digest' },
            { status: 'writing manifest' },
            { status: 'success' },
          ],
        }
      );
    }
    if (method === 'DELETE' && path === '/api/delete') {
      if (options.remove) return options.remove(body, 0);
      return models.some((m) => m.name === name)
        ? { status: 200 }
        : { status: 404, json: { error: `model '${String(name)}' not found` } };
    }
    return { status: 404, raw: '404 page not found' };
  };

  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    requests.push({ method, url: url.href, path: url.pathname, body });
    const signal = init.signal ?? undefined;
    if (signal?.aborted) throw abortError();
    const response = route(method, url.pathname, body);
    if (response.refuse) throw new TypeError('fetch failed');
    if (response.hang) await untilAborted(signal);
    const status = response.status ?? 200;
    const headers = { 'content-type': 'application/json', ...response.headers };
    if (response.lines) return new Response(streamBody(response, signal), { status, headers });
    const text = response.raw ?? (response.json === undefined ? '' : JSON.stringify(response.json));
    return new Response(status === 204 || status === 302 ? null : text, { status, headers });
  };

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    set: (next) => void (options = { ...options, ...next }),
    to: (path) => requests.filter((r) => r.path === path),
  };
}
