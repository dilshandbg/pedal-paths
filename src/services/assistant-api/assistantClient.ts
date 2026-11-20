import type {
  AssistantEvent,
  AssistantModel,
  AssistantProviderInfo,
  AssistantSettings,
  AssistantStatus,
  ConnectionTestResult,
  ModelDownload,
  ModelEvaluation,
  ModelRemoval,
} from '@/types/assistant';
import { readEvents } from './eventStream';

/*
 * Client for the local assistant API (BR-39 – BR-45, ADR-0014 §7). Same origin only: the browser
 * talks to the local backend, never to the model provider (NFR-07). Long answers and downloads
 * arrive as event streams; aborting the signal closes the stream, which stops the work behind it.
 */

export const ASSISTANT_API = '/api/assistant';

/** A failed request: `message` is plain and ready to show (NFR-12). */
export class AssistantApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly problems: readonly string[] = [],
  ) {
    super(message);
    this.name = 'AssistantApiError';
  }
}

const UNREACHABLE =
  'The app could not reach its local assistant service. Make sure the app is running with `npm run dev` or `npm run preview`.';

const isJson = (response: Response) =>
  (response.headers.get('content-type') ?? '').includes('application/json');

async function failure(response: Response): Promise<AssistantApiError> {
  if (!isJson(response)) return new AssistantApiError('unavailable', UNREACHABLE);
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: unknown; message?: unknown; problems?: unknown };
  } | null;
  const code = typeof body?.error?.code === 'string' ? body.error.code : 'internal';
  const problems = Array.isArray(body?.error?.problems)
    ? body.error.problems.filter((p): p is string => typeof p === 'string')
    : [];
  const message =
    typeof body?.error?.message === 'string'
      ? body.error.message
      : problems.length > 0
        ? problems.join(' ')
        : 'The assistant could not do that. Try again.';
  return new AssistantApiError(code, message, problems);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${ASSISTANT_API}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'content-type': 'application/json' } : {},
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new AssistantApiError('unavailable', UNREACHABLE);
  }
  if (!response.ok) throw await failure(response);
  return response;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  if (!isJson(response)) throw new AssistantApiError('unavailable', UNREACHABLE);
  return (await response.json()) as T;
}

/** Calls `onEvent` for each event of a stream response until it ends. */
async function stream<T>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal: AbortSignal,
) {
  const response = await request(path, { method: 'POST', body: JSON.stringify(body), signal });
  if (!response.body) throw new AssistantApiError('unavailable', UNREACHABLE);
  for await (const event of readEvents(response.body)) onEvent(event as T);
}

const model = (name: string) => `/models/${encodeURIComponent(name)}`;

export interface AssistantClient {
  status(signal?: AbortSignal): Promise<AssistantStatus>;
  settings(): Promise<{
    settings: AssistantSettings;
    providers: readonly AssistantProviderInfo[];
  }>;
  saveSettings(patch: { serverUrl?: string; model?: string | null }): Promise<AssistantSettings>;
  testConnection(serverUrl?: string): Promise<ConnectionTestResult>;
  models(): Promise<{ models: readonly AssistantModel[]; downloads: readonly ModelDownload[] }>;
  /** Streams a download's state until it ends; aborting cancels the download. */
  install(
    name: string,
    onUpdate: (download: ModelDownload) => void,
    signal: AbortSignal,
  ): Promise<void>;
  remove(name: string): Promise<ModelRemoval>;
  test(name: string, signal?: AbortSignal): Promise<ModelEvaluation>;
  startConversation(): Promise<string>;
  /** Streams the answer to a question; aborting stops it (Stop). */
  ask(
    id: string,
    question: string,
    onEvent: (event: AssistantEvent) => void,
    signal: AbortSignal,
  ): Promise<void>;
  endConversation(id: string): Promise<void>;
}

export const assistantClient: AssistantClient = {
  status: (signal) => json('/status', signal ? { signal } : {}),
  settings: () => json('/settings'),
  saveSettings: async (patch) =>
    (
      await json<{ settings: AssistantSettings }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
    ).settings,
  testConnection: (serverUrl) =>
    json('/test-connection', {
      method: 'POST',
      body: JSON.stringify(serverUrl === undefined ? {} : { serverUrl }),
    }),
  models: () => json('/models'),
  install: (name, onUpdate, signal) => stream('/models/install', { name }, onUpdate, signal),
  remove: (name) => json(model(name), { method: 'DELETE' }),
  test: async (name, signal) =>
    (
      await json<{ evaluation: ModelEvaluation }>(`${model(name)}/test`, {
        method: 'POST',
        ...(signal ? { signal } : {}),
      })
    ).evaluation,
  startConversation: async () =>
    (await json<{ id: string }>('/conversations', { method: 'POST' })).id,
  ask: (id, question, onEvent, signal) =>
    stream(`/conversations/${encodeURIComponent(id)}/messages`, { question }, onEvent, signal),
  endConversation: async (id) => {
    await request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
