import { cancelled, LLMError } from '../../../server/assistant/llm/errors';
import type {
  ChatMessage,
  FinishReason,
  GenerateEvent,
  GenerateRequest,
  InstallProgress,
  LLMProvider,
  ModelInfo,
} from '../../../server/assistant/llm/types';

/*
 * The fake language-model provider: a PERMANENT test implementation of `LLMProvider` (BRD v2.4,
 * NFR-05). It needs no Ollama and no network. Tests script what the "model" does, inspect every
 * request it received, and script model downloads.
 */

export interface FakeTurn {
  /** Text of the answer; several strings are streamed as separate parts. */
  readonly text?: string | readonly string[];
  readonly toolCalls?: readonly { readonly name: string; readonly arguments: unknown }[];
  readonly reason?: FinishReason;
  /** Thrown before anything is streamed. */
  readonly error?: LLMError;
  /** Thrown after the text has been streamed. */
  readonly errorAfterText?: LLMError;
  /** Wait before the first part. */
  readonly delayMs?: number;
  /** Never answers; ends only when aborted. */
  readonly hang?: boolean;
  /** Ignores the abort signal (a misbehaving provider). */
  readonly ignoreAbort?: boolean;
}

export type FakeResponder = (request: GenerateRequest, index: number) => FakeTurn;

export interface FakeInstall {
  readonly steps?: readonly InstallProgress[];
  /** `success` installs the model; `interrupted` ends the stream early; an error is thrown. */
  readonly outcome?: 'success' | 'interrupted' | LLMError;
  readonly stepDelayMs?: number;
  /** Waits after the steps until aborted. */
  readonly hang?: boolean;
}

export interface FakeProviderOptions {
  readonly id?: string;
  readonly models?: readonly ModelInfo[];
  readonly reachable?: boolean;
  /** Thrown by `checkConnection` and `listModels` instead of answering. */
  readonly connectionError?: LLMError;
  readonly respond?: FakeResponder | readonly FakeTurn[];
  readonly install?: (name: string) => FakeInstall;
}

export interface FakeProvider extends LLMProvider {
  readonly requests: GenerateRequest[];
  readonly installRequests: string[];
  readonly removeRequests: string[];
  models: NonNullable<LLMProvider['models']>;
  setModels(models: readonly ModelInfo[]): void;
  setReachable(reachable: boolean): void;
  respondWith(respond: FakeResponder | readonly FakeTurn[]): void;
}

export const fakeModel = (id: string, patch: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  name: id,
  sizeBytes: 4_700_000_000,
  parameterSize: '8.0B',
  quantization: 'Q4_K_M',
  contextWindow: 32_768,
  capabilities: { toolCalling: true, streaming: true, structuredOutput: true, other: [] },
  location: 'local',
  revision: `sha256:${id}`,
  ...patch,
});

const wait = (ms: number, signal: AbortSignal, ignoreAbort = false) =>
  new Promise<void>((resolve, reject) => {
    if (!ignoreAbort && signal.aborted) return reject(cancelled());
    const timer = setTimeout(resolve, ms);
    if (!ignoreAbort) {
      signal.addEventListener('abort', () => (clearTimeout(timer), reject(cancelled())), {
        once: true,
      });
    }
  });

const untilAborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(cancelled());
    signal.addEventListener('abort', () => reject(cancelled()), { once: true });
  });

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  let models = [...(options.models ?? [fakeModel('qwen3:8b')])];
  let reachable = options.reachable ?? true;
  let respond: FakeResponder | readonly FakeTurn[] = options.respond ?? [{ text: 'Hello.' }];
  const requests: GenerateRequest[] = [];
  const installRequests: string[] = [];
  const removeRequests: string[] = [];

  const reach = () => {
    if (options.connectionError) throw options.connectionError;
    if (!reachable) throw new LLMError('unavailable', 'fake provider is not reachable');
  };

  const turnFor = (request: GenerateRequest, index: number): FakeTurn => {
    if (typeof respond === 'function') return respond(request, index);
    const turn = respond[Math.min(index, respond.length - 1)];
    if (!turn) throw new Error('The fake provider has no scripted turn.');
    return turn;
  };

  async function* generate(
    request: GenerateRequest,
    signal: AbortSignal,
  ): AsyncGenerator<GenerateEvent> {
    const index = requests.length;
    requests.push(request);
    reach();
    if (!models.some((m) => m.id === request.model)) throw new LLMError('model-unavailable');
    const turn = turnFor(request, index);
    if (turn.hang) await untilAborted(signal);
    if (turn.delayMs) await wait(turn.delayMs, signal, turn.ignoreAbort);
    if (turn.error) throw turn.error;
    const parts = typeof turn.text === 'string' ? [turn.text] : (turn.text ?? []);
    for (const part of parts) {
      if (!turn.ignoreAbort && signal.aborted) throw cancelled();
      yield { type: 'text', delta: part };
      await Promise.resolve();
    }
    if (turn.errorAfterText) throw turn.errorAfterText;
    const calls = turn.toolCalls ?? [];
    for (const [i, call] of calls.entries()) {
      yield { type: 'tool-call', call: { id: `fake-${index}-${i}`, ...call } };
    }
    yield {
      type: 'finish',
      reason: turn.reason ?? (calls.length > 0 ? 'tool-calls' : 'stop'),
      usage: { inputTokens: null, outputTokens: null },
    };
  }

  const provider: FakeProvider = {
    descriptor: {
      id: options.id ?? 'fake',
      displayName: 'Fake provider (tests)',
      location: 'local',
      settings: [],
    },
    requests,
    installRequests,
    removeRequests,
    async checkConnection(signal) {
      if (signal.aborted) throw cancelled();
      reach();
      return { version: 'fake-1.0' };
    },
    async listModels(signal) {
      if (signal.aborted) throw cancelled();
      reach();
      return models;
    },
    generate,
    models: {
      async *install(name, signal) {
        installRequests.push(name);
        reach();
        const script = options.install?.(name) ?? {
          steps: [
            { status: 'pulling manifest', completedBytes: null, totalBytes: null },
            { status: 'downloading', completedBytes: 50, totalBytes: 100 },
            { status: 'downloading', completedBytes: 100, totalBytes: 100 },
          ],
        };
        for (const step of script.steps ?? []) {
          if (script.stepDelayMs) await wait(script.stepDelayMs, signal);
          if (signal.aborted) throw cancelled();
          yield step;
        }
        if (script.hang) await untilAborted(signal);
        const outcome = script.outcome ?? 'success';
        if (outcome instanceof LLMError) throw outcome;
        if (outcome === 'interrupted') {
          throw new LLMError('invalid-response', 'download stream ended before success');
        }
        if (!models.some((m) => m.id === name)) models = [...models, fakeModel(name)];
      },
      async remove(name, signal) {
        removeRequests.push(name);
        if (signal.aborted) throw cancelled();
        reach();
        if (!models.some((m) => m.id === name)) throw new LLMError('model-unavailable');
        models = models.filter((m) => m.id !== name);
      },
    },
    setModels: (next) => void (models = [...next]),
    setReachable: (next) => void (reachable = next),
    respondWith: (next) => void (respond = next),
  };
  return provider;
}

// --- A scripted "model" for the analytics questions ----------------------------------------------

type Call = { readonly name: string; readonly arguments: unknown };

const lastUser = (messages: readonly ChatMessage[]) =>
  [...messages]
    .reverse()
    .find((m): m is Extract<ChatMessage, { role: 'user' }> => m.role === 'user');

/** Tool results after the last user message, by tool name. */
const resultsSinceQuestion = (messages: readonly ChatMessage[]) => {
  const start = messages.findLastIndex((m) => m.role === 'user');
  return messages
    .slice(start + 1)
    .filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool');
};

/** The tool a well-behaved model would call for one of the known question shapes. */
export function callFor(question: string): Call | null {
  let match = /each month of (\d{4})/i.exec(question);
  if (match)
    return {
      name: 'distance_by_month',
      arguments: { from: `${match[1]}-01-01`, to: `${match[1]}-12-31` },
    };
  match = /within (\d+) m of (-?[\d.]+), (-?[\d.]+)/i.exec(question);
  if (match) {
    return {
      name: 'location_visits',
      arguments: { lat: Number(match[2]), lng: Number(match[3]), radiusM: Number(match[1]) },
    };
  }
  match = /compare my total distance in (\d{4}) with (\d{4})/i.exec(question);
  if (match) {
    return {
      name: 'compare_periods',
      arguments: {
        metric: 'distanceKm',
        aFrom: `${match[1]}-01-01`,
        aTo: `${match[1]}-12-31`,
        bFrom: `${match[2]}-01-01`,
        bTo: `${match[2]}-12-31`,
      },
    };
  }
  match = /in (\d{4})/i.exec(question);
  if (match && /how far|distance/i.test(question)) {
    return {
      name: 'distance_by_year',
      arguments: { from: `${match[1]}-01-01`, to: `${match[1]}-12-31` },
    };
  }
  return null;
}

/** An answer quoting a tool result the way a well-behaved model would. */
export function answerFrom(name: string, content: string): string {
  const result = JSON.parse(content) as Record<string, unknown>;
  if (result.error) return 'The analytics could not answer that question.';
  switch (name) {
    case 'distance_by_month':
      return (result.months as { year: number; month: number; distanceKm: number; rides: number }[])
        .map((m) => `${m.year}-${String(m.month).padStart(2, '0')}: ${m.distanceKm} km`)
        .join('; ');
    case 'distance_by_year':
      return (result.years as { year: number; distanceKm: number }[])
        .map((y) => `${y.year}: ${y.distanceKm} km`)
        .join('; ');
    case 'location_visits':
      return `${String(result.visitCount)} rides passed that place.`;
    case 'compare_periods': {
      const a = result.periodA as { value: number };
      const b = result.periodB as { value: number };
      return `Period A: ${a.value} km, period B: ${b.value} km.`;
    }
    default:
      return 'Here is what the analytics found.';
  }
}

export interface AnalystBehaviour {
  /** Which tool to call for a question; default: `callFor`. */
  readonly call?: (question: string) => Call | null;
  /** A second tool call made in the same round as `call`; default: none. */
  readonly extraCall?: (question: string) => Call | null;
  /** The call to make next when every tool result so far is an error; default: answer anyway. */
  readonly retry?: (question: string) => Call | null;
  /** The final answer from a tool result; default: `answerFrom`. */
  readonly answer?: (name: string, content: string) => string;
  /** The answer when no tool fits; default: a refusal without numbers. */
  readonly noTool?: (question: string) => string;
}

/**
 * A scripted model that calls the right analytics tool for known question shapes and then answers
 * from its result. Pass `behaviour` overrides to script a model that misbehaves.
 */
export function analyst(behaviour: AnalystBehaviour = {}): FakeResponder {
  const call = behaviour.call ?? callFor;
  const answer = behaviour.answer ?? answerFrom;
  const noTool =
    behaviour.noTool ??
    (() => "I can't answer that from your rides: the analytics don't include it.");
  return (request) => {
    const results = resultsSinceQuestion(request.messages);
    const question = lastUser(request.messages)?.text ?? '';
    const retried = results.length > 0 && results.every((r) => r.isError) && behaviour.retry;
    const again = retried ? behaviour.retry?.(question) : null;
    if (again) return { toolCalls: [again] };
    if (results.length > 0) {
      return { text: results.map((r) => answer(r.name, r.content)).join(' ') };
    }
    const next = call(question);
    const extra = behaviour.extraCall?.(question) ?? null;
    return next ? { toolCalls: extra ? [next, extra] : [next] } : { text: noTool(question) };
  };
}
