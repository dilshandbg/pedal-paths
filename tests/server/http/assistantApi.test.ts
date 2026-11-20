// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantEvent, ModelDownload } from '../../../src/types/assistant';
import { SYNTHETIC_ANALYTICS } from '../../../server/assistant/evaluation';
import { createProviderRegistry } from '../../../server/assistant/llm/registry';
import { createAssistantService, type AssistantService } from '../../../server/assistant/service';
import { openSettingsFile } from '../../../server/assistant/settingsFile';
import { createAssistantApi, MAX_QUESTION_LENGTH } from '../../../server/http/assistantApi';
import {
  analyst,
  createFakeProvider,
  fakeModel,
  type FakeProvider,
} from '../assistant/fakeProvider';

/*
 * The assistant API over a real local HTTP server, with the fake provider behind it (no Ollama).
 */

let server: Server;
let base: string;
let provider: FakeProvider;
let service: AssistantService;

beforeEach(async () => {
  provider = createFakeProvider({ id: 'ollama', respond: analyst() });
  const registry = createProviderRegistry([
    {
      descriptor: {
        id: 'ollama',
        displayName: 'Local test provider',
        location: 'local',
        settings: [
          {
            key: 'serverUrl',
            label: 'Address',
            kind: 'local-url',
            defaultValue: 'http://127.0.0.1:11434',
            help: '',
          },
        ],
      },
      create: () => provider,
    },
  ]);
  service = createAssistantService({
    registry,
    file: openSettingsFile(null),
    analytics: () => SYNTHETIC_ANALYTICS,
    history: () => ({ rideCount: 62, firstRideDate: '2018-01-06', lastRideDate: '2019-06-29' }),
    timeZone: 'UTC',
    clock: () => new Date('2020-01-15T12:00:00Z'),
    log: () => {},
  });
  const api = createAssistantApi(() => service);
  server = createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 418; // not handled: the next middleware
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant`;
});
afterEach(async () => {
  service.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const json = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
  };
};
const post = (path: string, body: unknown = {}) =>
  json(path, { method: 'POST', body: JSON.stringify(body) });

/** Reads a Server-Sent Events response to its end. */
async function events<T>(path: string, body: unknown): Promise<{ status: number; events: T[] }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.headers.get('content-type')?.startsWith('text/event-stream')) {
    return { status: response.status, events: [JSON.parse(text) as T] };
  }
  const parsed = text
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)) as T);
  return { status: response.status, events: parsed };
}

const selectAndTest = async () => {
  await json('/settings', { method: 'PUT', body: JSON.stringify({ model: 'qwen3:8b' }) });
  return post('/models/qwen3%3A8b/test');
};

describe('NFR-07 / NFR-08: local requests only', () => {
  it('refuses another site', async () => {
    const response = await json('/settings', { headers: { origin: 'https://evil.example' } });
    expect(response).toEqual({ status: 403, body: { error: { code: 'forbidden-origin' } } });
  });

  it('answers unknown paths and wrong methods with error codes only', async () => {
    expect((await json('/nothing')).status).toBe(404);
    expect((await json('/status', { method: 'DELETE' })).status).toBe(405);
  });

  it('refuses bodies that are not small JSON objects', async () => {
    expect((await json('/test-connection', { method: 'POST', body: '[1]' })).status).toBe(400);
    expect(
      (await json('/test-connection', { method: 'POST', body: 'x'.repeat(20_000) })).status,
    ).toBe(413);
    expect((await post('/test-connection', { serverUrl: 'x', extra: 1 })).body).toMatchObject({
      error: { code: 'invalid-payload', problems: ['Unknown fields: extra.'] },
    });
  });
});

describe('BR-41 / AC-46: settings and connection', () => {
  it('shows the settings and the provider with its settings', async () => {
    expect((await json('/settings')).body).toEqual({
      settings: { provider: 'ollama', serverUrl: 'http://127.0.0.1:11434', model: null },
      providers: [expect.objectContaining({ id: 'ollama', displayName: 'Local test provider' })],
    });
  });

  it('saves a local address and refuses any other, naming the problem', async () => {
    const saved = await json('/settings', {
      method: 'PUT',
      body: JSON.stringify({ serverUrl: 'http://localhost:11500' }),
    });
    expect(saved.body).toMatchObject({ settings: { serverUrl: 'http://localhost:11500' } });
    const refused = await json('/settings', {
      method: 'PUT',
      body: JSON.stringify({ serverUrl: 'http://ollama.example.com' }),
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: { code: 'invalid-payload' } });
  });

  it('tests the connection: the version when reachable, a plain message when not', async () => {
    expect((await post('/test-connection')).body).toEqual({
      reachable: true,
      version: 'fake-1.0',
      problem: null,
      message: null,
    });
    provider.setReachable(false);
    expect((await post('/test-connection', { serverUrl: 'http://127.0.0.1:9999' })).body).toEqual(
      expect.objectContaining({
        reachable: false,
        problem: 'provider-unavailable',
        message: expect.stringContaining('Start Ollama'),
      }),
    );
    expect((await post('/test-connection', { serverUrl: 'http://10.0.0.1' })).status).toBe(400);
  });

  it('reports what stops a question, step by step, until the assistant is ready', async () => {
    provider.setReachable(false);
    expect((await json('/status')).body).toMatchObject({
      reachable: false,
      ready: false,
      problem: 'provider-unavailable',
    });
    provider.setReachable(true);
    expect((await json('/status')).body).toMatchObject({
      reachable: true,
      version: 'fake-1.0',
      problem: 'no-model-selected',
    });
    await json('/settings', { method: 'PUT', body: JSON.stringify({ model: 'qwen3:8b' }) });
    expect((await json('/status')).body).toMatchObject({ problem: 'model-not-evaluated' });
    await post('/models/qwen3%3A8b/test');
    expect((await json('/status')).body).toMatchObject({
      ready: true,
      problem: null,
      model: 'qwen3:8b',
    });
  });
});

describe('BR-42 / BR-43 / AC-47 / AC-50: models', () => {
  it('lists models with details, locality, selection and test result', async () => {
    provider.setModels([fakeModel('qwen3:8b'), fakeModel('gpt-oss:120b-cloud')]);
    const { body } = await json('/models');
    expect(body.models).toEqual([
      expect.objectContaining({
        id: 'qwen3:8b',
        parameterSize: '8.0B',
        contextWindow: 32_768,
        toolCalling: true,
        local: true,
        selected: false,
        suitability: 'untested',
        evaluation: null,
        testing: false,
      }),
      expect.objectContaining({ id: 'gpt-oss:120b-cloud', local: false }),
    ]);
    expect(body.downloads).toEqual([]);
  });

  it('answers a provider that is not running with a plain message', async () => {
    provider.setReachable(false);
    expect(await json('/models')).toEqual({
      status: 503,
      body: {
        error: { code: 'provider-unavailable', message: expect.stringContaining('Start Ollama') },
      },
    });
  });

  it('tests a model, keeps the result, and marks it suitable only after it passed', async () => {
    const tested = await selectAndTest();
    expect(tested.status).toBe(200);
    expect(tested.body.evaluation).toMatchObject({ model: 'qwen3:8b', passed: true });
    const { body } = await json('/models');
    expect(body.models).toEqual([
      expect.objectContaining({ selected: true, suitability: 'suitable' }),
    ]);
  });

  it('reports a failed test and keeps the model unsuitable', async () => {
    provider.respondWith(analyst({ answer: () => 'I looked it up.' }));
    const tested = await selectAndTest();
    expect(tested.body.evaluation).toMatchObject({ passed: false });
    expect((await json('/status')).body).toMatchObject({ problem: 'model-failed-evaluation' });
  });

  it('refuses to test a model twice at the same time', async () => {
    provider.respondWith([{ delayMs: 200, text: 'Slow.' }]);
    const first = post('/models/qwen3%3A8b/test');
    await vi.waitFor(() => expect(provider.requests.length).toBeGreaterThan(0));
    const second = await post('/models/qwen3%3A8b/test');
    expect(second).toMatchObject({ status: 409, body: { error: { code: 'model-test-running' } } });
    expect((await first).status).toBe(200);
  });

  it('cannot test a model that is not installed or a cloud model', async () => {
    expect((await post('/models/llama3.2/test')).body).toMatchObject({
      error: { code: 'model-not-installed' },
    });
    expect((await post('/models/gpt-oss%3A120b-cloud/test')).status).toBe(400);
  });

  it('removes a model and clears the selection when it was selected (AC-49)', async () => {
    await json('/settings', { method: 'PUT', body: JSON.stringify({ model: 'qwen3:8b' }) });
    expect(await json('/models/qwen3%3A8b', { method: 'DELETE' })).toEqual({
      status: 200,
      body: { model: 'qwen3:8b', selectionCleared: true },
    });
    expect((await json('/settings')).body).toMatchObject({ settings: { model: null } });
    expect((await json('/models/qwen3%3A8b', { method: 'DELETE' })).body).toMatchObject({
      error: { code: 'model-not-installed' },
    });
  });
});

describe('BR-42 / AC-48: model downloads', () => {
  it('streams progress until the download completed, then lists the model', async () => {
    const { events: steps } = await events<ModelDownload>('/models/install', { name: 'llama3.2' });
    expect(steps[0]).toMatchObject({ model: 'llama3.2', status: 'downloading' });
    expect(steps.some((s) => s.completedBytes === 50 && s.totalBytes === 100)).toBe(true);
    expect(steps.at(-1)).toMatchObject({ status: 'completed', error: null });
    const { body } = await json('/models');
    expect((body.models as { id: string }[]).map((m) => m.id)).toContain('llama3.2');
  });

  it('refuses a cloud model or an invalid name before downloading anything', async () => {
    expect((await post('/models/install', { name: 'gpt-oss:120b-cloud' })).status).toBe(400);
    expect((await post('/models/install', { name: '../x' })).status).toBe(400);
    expect(provider.installRequests).toEqual([]);
  });

  it('cancels the download when its stream is closed', async () => {
    const hanging = createFakeProvider({
      id: 'ollama',
      install: () => ({
        steps: [{ status: 'pulling', completedBytes: 1, totalBytes: 9 }],
        hang: true,
      }),
    });
    provider.models = hanging.models;
    const controller = new AbortController();
    const response = await fetch(`${base}/models/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'llama3.2' }),
      signal: controller.signal,
    });
    const reader = response.body!.getReader(); // an event stream has a body
    await reader.read();
    controller.abort();
    await vi.waitFor(async () => {
      const { body } = await json('/models');
      expect(body.downloads).toEqual([expect.objectContaining({ status: 'cancelled' })]);
    });
  });

  it('joins a download that is already running instead of starting another', async () => {
    const slow = createFakeProvider({
      id: 'ollama',
      install: () => ({
        steps: [{ status: 'pulling', completedBytes: 1, totalBytes: 2 }],
        stepDelayMs: 50,
      }),
    });
    provider.models = slow.models;
    const [a, b] = await Promise.all([
      events<ModelDownload>('/models/install', { name: 'llama3.2' }),
      events<ModelDownload>('/models/install', { name: 'llama3.2:latest' }),
    ]);
    expect(slow.installRequests).toEqual(['llama3.2']);
    expect(a.events.at(-1)?.status).toBe('completed');
    expect(b.events.at(-1)?.status).toBe('completed');
  });
});

describe('BR-39 / BR-45 / AC-43 / AC-52: conversations', () => {
  it('answers a ride question as a stream: text, analytics used, done', async () => {
    await selectAndTest();
    const { body } = await post('/conversations');
    const id = body.id as string;
    const { events: answer } = await events<AssistantEvent>(`/conversations/${id}/messages`, {
      question: 'How far did I ride in each month of 2019?',
    });
    expect(answer.find((e) => e.type === 'tool')).toMatchObject({
      use: { name: 'distance_by_month', ok: true },
    });
    expect(answer.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('')).toBe(
      '2019-03: 487.3 km; 2019-04: 312.8 km; 2019-06: 655.1 km',
    );
    expect(answer.at(-1)).toEqual({ type: 'done', reason: 'stop' });
  });

  it('refuses to ask with a model that was not tested, and sends it nothing', async () => {
    await json('/settings', { method: 'PUT', body: JSON.stringify({ model: 'qwen3:8b' }) });
    const { body } = await post('/conversations');
    const { events: answer } = await events<AssistantEvent>(
      `/conversations/${String(body.id)}/messages`,
      { question: 'How far in 2019?' },
    );
    expect(answer).toEqual([
      expect.objectContaining({ type: 'error', code: 'model-not-evaluated' }),
    ]);
    expect(provider.requests).toEqual([]);
  });

  it('validates the question', async () => {
    const { body } = await post('/conversations');
    const ask = (question: unknown) =>
      post(`/conversations/${String(body.id)}/messages`, { question });
    expect((await ask('  ')).status).toBe(400);
    expect((await ask(7)).status).toBe(400);
    expect((await ask('x'.repeat(MAX_QUESTION_LENGTH + 1))).status).toBe(400);
  });

  it('reports a conversation that does not exist, and ends one', async () => {
    const { events: answer } = await events<AssistantEvent>('/conversations/unknown/messages', {
      question: 'Hello?',
    });
    expect(answer).toEqual([
      expect.objectContaining({ type: 'error', code: 'conversation-not-found' }),
    ]);
    const { body } = await post('/conversations');
    expect((await json(`/conversations/${String(body.id)}`, { method: 'DELETE' })).status).toBe(
      204,
    );
  });

  it('stops the answer when the stream is closed (Stop), and the conversation can go on', async () => {
    await selectAndTest();
    const { body } = await post('/conversations');
    const id = String(body.id);
    provider.respondWith([{ text: ['Part one '], hang: true }]);
    const controller = new AbortController();
    const response = await fetch(`${base}/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Tell me a long story.' }),
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    controller.abort();
    provider.respondWith(analyst());
    await vi.waitFor(async () => {
      const { events: answer } = await events<AssistantEvent>(`/conversations/${id}/messages`, {
        question: 'How far did I ride in each month of 2019?',
      });
      expect(answer.at(-1)).toEqual({ type: 'done', reason: 'stop' });
    });
  });
});
