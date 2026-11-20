// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LLMErrorKind } from '../../../../server/assistant/llm/errors';
import {
  createOllamaProvider,
  OLLAMA_DEFAULT_URL,
} from '../../../../server/assistant/llm/providers/ollama';
import {
  createProviderRegistry,
  DEFAULT_PROVIDER_FACTORIES,
} from '../../../../server/assistant/llm/registry';
import type {
  GenerateEvent,
  GenerateRequest,
  InstallProgress,
  LLMProvider,
} from '../../../../server/assistant/llm/types';
import { evaluateModel } from '../../../../server/assistant/evaluation';
import { answerFrom, callFor } from '../fakeProvider';
import { describeProviderContract, type ContractScenario } from '../providerContract';
import {
  chatLines,
  createFakeOllama,
  QWEN,
  type FakeOllama,
  type FakeResponse,
} from './fakeOllama';

/* The Ollama adapter against a mocked Ollama HTTP API; no Ollama is needed (NFR-05). */

const signal = () => new AbortController().signal;

/** Ollama keeps models locally, so its provider has a model manager. */
const manager = (provider: LLMProvider) => {
  if (!provider.models) throw new Error('Ollama has a model manager.');
  return provider.models;
};

const make = (fake: FakeOllama, extra: Partial<Parameters<typeof createOllamaProvider>[0]> = {}) =>
  createOllamaProvider({ serverUrl: OLLAMA_DEFAULT_URL, fetch: fake.fetch, ...extra });

const ERROR_RESPONSES: Partial<Record<LLMErrorKind, FakeResponse>> = {
  unavailable: { refuse: true },
  'not-local': { status: 302, headers: { location: 'http://203.0.113.7/' } },
  'model-unavailable': { status: 404, json: { error: "model 'qwen3:8b' not found" } },
  'tools-unsupported': {
    status: 400,
    json: { error: 'registry.ollama.ai/library/gemma:2b does not support tools' },
  },
  busy: { status: 503, json: { error: 'server busy, please try again.' } },
  'invalid-response': { lines: ['this is not json'] },
  'model-error': { lines: [{ error: 'llama runner process has terminated' }] },
  'bad-request': { status: 400, json: { error: 'invalid options' } },
};

describeProviderContract('Ollama', () => {
  const fake = createFakeOllama();
  const responseFor = (scenario: ContractScenario): FakeResponse => {
    switch (scenario.kind) {
      case 'text':
        return { lines: chatLines.text(...scenario.parts) };
      case 'tool-call':
        return { lines: chatLines.toolCall(scenario.name, scenario.arguments) };
      case 'error':
        return ERROR_RESPONSES[scenario.error] ?? { status: 500 };
      case 'slow':
        return { hang: true };
    }
  };
  return {
    provider: make(fake),
    model: 'qwen3:8b',
    errorKinds: Object.keys(ERROR_RESPONSES) as LLMErrorKind[],
    prepare: (scenario) => fake.set({ chat: () => responseFor(scenario) }),
  };
});

const request = (patch: Partial<GenerateRequest> = {}): GenerateRequest => ({
  model: 'qwen3:8b',
  system: 'You answer questions about rides.',
  messages: [{ role: 'user', text: 'How far in 2024?' }],
  tools: [
    {
      name: 'distance_by_year',
      description: 'Distance per year.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string', description: 'First day.' } },
        required: [],
        additionalProperties: false,
      },
    },
  ],
  contextTokens: 8192,
  maxOutputTokens: 1024,
  ...patch,
});

async function collect(provider: LLMProvider, req = request(), abort = signal()) {
  const events: GenerateEvent[] = [];
  for await (const event of provider.generate(req, abort)) events.push(event);
  return events;
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { kind?: string };
  }
  throw new Error('expected a failure');
}

describe('AC-46: connection', () => {
  it('reports the version when Ollama is reachable', async () => {
    const fake = createFakeOllama({ version: '0.12.6' });
    expect(await make(fake).checkConnection(signal())).toEqual({ version: '0.12.6' });
    expect(fake.requests[0]).toMatchObject({
      method: 'GET',
      url: 'http://127.0.0.1:11434/api/version',
    });
  });

  it('is unavailable when Ollama is not running', async () => {
    const fake = createFakeOllama({ override: () => ({ refuse: true }) });
    expect(await failureOf(make(fake).checkConnection(signal()))).toMatchObject({
      kind: 'unavailable',
    });
  });

  it('is cancelled when the caller gives up (e.g. the 3 s connection check)', async () => {
    const fake = createFakeOllama({ override: () => ({ hang: true }) });
    const pending = failureOf(make(fake).checkConnection(AbortSignal.timeout(20)));
    expect(await pending).toMatchObject({ kind: 'cancelled' });
  });

  it('never contacts an address that is not on this computer', async () => {
    const fake = createFakeOllama();
    const remote = createOllamaProvider({
      serverUrl: 'http://192.168.1.20:11434',
      fetch: fake.fetch,
    });
    expect(await failureOf(remote.checkConnection(signal()))).toMatchObject({ kind: 'not-local' });
    const renamed = createOllamaProvider({
      serverUrl: 'http://localhost:11434',
      fetch: fake.fetch,
      lookup: async () => ['10.0.0.9'],
    });
    expect(await failureOf(renamed.checkConnection(signal()))).toMatchObject({ kind: 'not-local' });
    expect(fake.requests).toEqual([]);
  });

  it('connects to localhost through the loopback address it resolves to', async () => {
    const fake = createFakeOllama();
    const provider = createOllamaProvider({
      serverUrl: 'http://localhost:11434',
      fetch: fake.fetch,
      lookup: async () => ['::1'],
    });
    await provider.checkConnection(signal());
    expect(fake.requests[0]?.url).toBe('http://[::1]:11434/api/version');
  });
});

describe('AC-47 / BR-43: installed models and their capabilities', () => {
  it('lists models with size, parameter size, quantization, context window, capabilities and digest', async () => {
    const fake = createFakeOllama();
    expect(await make(fake).listModels(signal())).toEqual([
      {
        id: 'qwen3:8b',
        name: 'qwen3:8b',
        sizeBytes: 5_225_388_164,
        parameterSize: '8.2B',
        quantization: 'Q4_K_M',
        contextWindow: 40_960,
        capabilities: {
          toolCalling: true,
          streaming: true,
          structuredOutput: true,
          other: ['thinking'],
        },
        location: 'local',
        revision: 'sha256:qwen3-8b-digest',
      },
    ]);
    expect(fake.to('/api/show')[0]?.body).toEqual({ model: 'qwen3:8b' });
  });

  it('reports no tool calling when the capabilities lack tools, unknown when there are none', async () => {
    const fake = createFakeOllama({
      models: [{ name: 'gemma:2b', capabilities: ['completion'] }, { name: 'old:1b' }],
    });
    const [gemma, old] = await make(fake).listModels(signal());
    expect(gemma?.capabilities.toolCalling).toBe(false);
    expect(old?.capabilities.toolCalling).toBe('unknown');
    expect(old?.contextWindow).toBeNull();
  });

  it('lists a model whose details fail with unknown capabilities, without hiding the others', async () => {
    const fake = createFakeOllama({ models: [QWEN, { name: 'broken:1b', showStatus: 500 }] });
    const models = await make(fake).listModels(signal());
    expect(models.map((m) => [m.id, m.capabilities.toolCalling])).toEqual([
      ['qwen3:8b', true],
      ['broken:1b', 'unknown'],
    ]);
  });

  it('asks for the details of a model only once per digest', async () => {
    const fake = createFakeOllama();
    const provider = make(fake);
    await provider.listModels(signal());
    await provider.listModels(signal());
    expect(fake.to('/api/show')).toHaveLength(1);
    fake.set({ models: [{ ...QWEN, digest: 'sha256:updated' }] });
    expect((await provider.listModels(signal()))[0]?.revision).toBe('sha256:updated');
    expect(fake.to('/api/show')).toHaveLength(2);
  });

  it('fails on a model list that is not one', async () => {
    const fake = createFakeOllama({
      override: (path) => (path === '/api/tags' ? { json: { x: 1 } } : null),
    });
    expect(await failureOf(make(fake).listModels(signal()))).toMatchObject({
      kind: 'invalid-response',
    });
  });
});

describe('RULE-27 / AC-51: cloud models', () => {
  it('marks models with a remote host, a remote model or a cloud name as remote, and never asks for their details', async () => {
    const fake = createFakeOllama({
      models: [
        QWEN,
        { name: 'gpt-oss:120b-cloud' },
        { name: 'deepseek-v3.1:671b', remoteHost: 'https://ollama.com:443' },
        { name: 'mirror:1b', remoteModel: 'kimi-k2' },
      ],
    });
    const models = await make(fake).listModels(signal());
    expect(models.map((m) => [m.id, m.location])).toEqual([
      ['qwen3:8b', 'local'],
      ['gpt-oss:120b-cloud', 'remote'],
      ['deepseek-v3.1:671b', 'remote'],
      ['mirror:1b', 'remote'],
    ]);
    expect(fake.to('/api/show').map((r) => r.body)).toEqual([{ model: 'qwen3:8b' }]);
  });

  it('refuses to download a cloud model and sends nothing', async () => {
    const fake = createFakeOllama();
    const install = manager(make(fake)).install('gpt-oss:120b-cloud', signal());
    expect(await failureOf(drain(install))).toMatchObject({ kind: 'bad-request' });
    expect(fake.requests).toEqual([]);
  });
});

describe('BR-39 / BR-45: chat', () => {
  it('sends the system prompt, the conversation, the tools and the limits', async () => {
    const fake = createFakeOllama();
    await collect(
      make(fake),
      request({
        messages: [
          { role: 'user', text: 'How far in 2024?' },
          {
            role: 'assistant',
            text: '',
            toolCalls: [
              { id: 'call-1-1#1', name: 'distance_by_year', arguments: { from: '2024-01-01' } },
            ],
          },
          {
            role: 'tool',
            callId: 'call-1-1#1',
            name: 'distance_by_year',
            content: '{"years":[]}',
            isError: false,
          },
        ],
      }),
    );
    expect(fake.to('/api/chat')[0]?.body).toEqual({
      model: 'qwen3:8b',
      messages: [
        { role: 'system', content: 'You answer questions about rides.' },
        { role: 'user', content: 'How far in 2024?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'distance_by_year', arguments: { from: '2024-01-01' } } },
          ],
        },
        { role: 'tool', content: '{"years":[]}', tool_name: 'distance_by_year' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'distance_by_year',
            description: 'Distance per year.',
            parameters: request().tools[0]!.parameters, // the request has one tool
          },
        },
      ],
      stream: true,
      options: { num_ctx: 8192, num_predict: 1024 },
    });
  });

  it('asks for structured output with a JSON Schema, and sends no tools when there are none', async () => {
    const fake = createFakeOllama();
    const schema = request().tools[0]!.parameters; // the request has one tool
    await collect(make(fake), request({ tools: [], responseSchema: schema }));
    const body = fake.to('/api/chat')[0]?.body as Record<string, unknown>;
    expect(body.format).toEqual(schema);
    expect(body).not.toHaveProperty('tools');
  });

  it('streams text, skips thinking, and reports token usage', async () => {
    const fake = createFakeOllama({
      chat: [
        {
          lines: [
            { message: { role: 'assistant', content: '', thinking: 'Let me see…' }, done: false },
            ...chatLines.text('You rode ', '1,234 km.'),
          ],
        },
      ],
    });
    expect(await collect(make(fake))).toEqual([
      { type: 'text', delta: 'You rode ' },
      { type: 'text', delta: '1,234 km.' },
      { type: 'finish', reason: 'stop', usage: { inputTokens: 120, outputTokens: 14 } },
    ]);
  });

  it('reports a cut answer as length', async () => {
    const fake = createFakeOllama({
      chat: [{ lines: [{ message: { content: 'You rode' }, done: true, done_reason: 'length' }] }],
    });
    expect((await collect(make(fake))).at(-1)).toMatchObject({ type: 'finish', reason: 'length' });
  });

  it('gives tool calls ids unique across turns, and parses string arguments', async () => {
    const fake = createFakeOllama({
      chat: [
        { lines: chatLines.toolCall('distance_by_year', { from: '2024-01-01' }) },
        { lines: chatLines.toolCall('distance_by_year', '{"from":"2023-01-01"}') },
      ],
    });
    const provider = make(fake);
    const calls = [...(await collect(provider)), ...(await collect(provider))].flatMap((e) =>
      e.type === 'tool-call' ? [e.call] : [],
    );
    expect(calls).toEqual([
      { id: 'call-1-1', name: 'distance_by_year', arguments: { from: '2024-01-01' } },
      { id: 'call-2-1', name: 'distance_by_year', arguments: { from: '2023-01-01' } },
    ]);
  });

  it('passes arguments that are not JSON on, for the tool to reject', async () => {
    const fake = createFakeOllama({
      chat: [{ lines: chatLines.toolCall('distance_by_year', 'from 2024') }],
    });
    const events = await collect(make(fake));
    expect(events[0]).toMatchObject({ type: 'tool-call', call: { arguments: 'from 2024' } });
  });

  it('fails on a tool call without a name', async () => {
    const fake = createFakeOllama({
      chat: [
        { lines: [{ message: { tool_calls: [{ function: { arguments: {} } }] }, done: false }] },
      ],
    });
    expect(await failureOf(collect(make(fake)))).toMatchObject({ kind: 'invalid-response' });
  });

  it('fails when the answer ends before Ollama says it is done', async () => {
    const fake = createFakeOllama({ chat: [{ lines: chatLines.text('Half').slice(0, 1) }] });
    expect(await failureOf(collect(make(fake)))).toMatchObject({ kind: 'invalid-response' });
  });

  it('is unavailable when the connection drops mid-answer', async () => {
    const fake = createFakeOllama({
      chat: [{ lines: chatLines.text('Half').slice(0, 1), breakAfterLines: true }],
    });
    expect(await failureOf(collect(make(fake)))).toMatchObject({ kind: 'unavailable' });
  });

  it('maps HTTP 500 to a model error and a mid-stream error to its kind', async () => {
    const fake = createFakeOllama({
      chat: [
        { status: 500, json: { error: 'out of memory' } },
        { lines: [{ error: 'qwen does not support tools' }] },
      ],
    });
    const provider = make(fake);
    expect(await failureOf(collect(provider))).toMatchObject({ kind: 'model-error' });
    expect(await failureOf(collect(provider))).toMatchObject({ kind: 'tools-unsupported' });
  });

  it('stops reading when aborted mid-answer', async () => {
    const fake = createFakeOllama({
      chat: [{ lines: chatLines.text('Part').slice(0, 1), hangAfterLines: true }],
    });
    const controller = new AbortController();
    const events: GenerateEvent[] = [];
    const pending = failureOf(
      (async () => {
        for await (const event of make(fake).generate(request(), controller.signal)) {
          events.push(event);
          controller.abort();
        }
      })(),
    );
    expect(await pending).toMatchObject({ kind: 'cancelled' });
    expect(events).toEqual([{ type: 'text', delta: 'Part' }]);
  });
});

async function drain(source: AsyncIterable<InstallProgress>) {
  const steps: InstallProgress[] = [];
  for await (const step of source) steps.push(step);
  return steps;
}

describe('BR-42 / AC-48: downloading models', () => {
  it('streams progress until Ollama confirms success', async () => {
    const fake = createFakeOllama();
    const steps = await drain(manager(make(fake)).install(' Qwen3:8B ', signal()));
    expect(fake.to('/api/pull')[0]?.body).toEqual({ model: 'qwen3:8b', stream: true });
    expect(steps).toEqual([
      { status: 'pulling manifest', completedBytes: null, totalBytes: null },
      { status: 'pulling abc', completedBytes: 50, totalBytes: 100 },
      { status: 'pulling abc', completedBytes: 100, totalBytes: 100 },
      { status: 'verifying sha256 digest', completedBytes: null, totalBytes: null },
      { status: 'writing manifest', completedBytes: null, totalBytes: null },
    ]);
  });

  it('fails a download that ends without success (interrupted)', async () => {
    const fake = createFakeOllama({ pull: () => ({ lines: [{ status: 'pulling manifest' }] }) });
    expect(await failureOf(drain(manager(make(fake)).install('qwen3:8b', signal())))).toMatchObject(
      {
        kind: 'invalid-response',
      },
    );
  });

  it('reports an unknown model, and other download errors', async () => {
    const fake = createFakeOllama({
      pull: () => ({
        lines: [
          { status: 'pulling manifest' },
          { error: 'pull model manifest: file does not exist' },
        ],
      }),
    });
    expect(await failureOf(drain(manager(make(fake)).install('nope:1b', signal())))).toMatchObject({
      kind: 'model-unavailable',
    });
    fake.set({ pull: () => ({ lines: [{ error: 'no space left on device' }] }) });
    expect(await failureOf(drain(manager(make(fake)).install('qwen3:8b', signal())))).toMatchObject(
      {
        kind: 'model-error',
      },
    );
  });

  it('is cancelled when aborted, which ends the request to Ollama', async () => {
    const fake = createFakeOllama({
      pull: () => ({ lines: [{ status: 'pulling manifest' }], hangAfterLines: true }),
    });
    const controller = new AbortController();
    const steps: InstallProgress[] = [];
    const pending = failureOf(
      (async () => {
        for await (const step of manager(make(fake)).install('qwen3:8b', controller.signal)) {
          steps.push(step);
          controller.abort();
        }
      })(),
    );
    expect(await pending).toMatchObject({ kind: 'cancelled' });
    expect(steps).toHaveLength(1);
  });

  it('fails a download without progress for too long (OD-37: 120 s; shortened here)', async () => {
    const fake = createFakeOllama({
      pull: () => ({ lines: [{ status: 'pulling manifest' }], hangAfterLines: true }),
    });
    const provider = make(fake, { pullIdleMs: 30 });
    expect(await failureOf(drain(manager(provider).install('qwen3:8b', signal())))).toMatchObject({
      kind: 'timeout',
    });
  });
});

describe('BR-42 / AC-49: removing models', () => {
  it('deletes an installed model', async () => {
    const fake = createFakeOllama();
    await manager(make(fake)).remove('qwen3:8b', signal());
    expect(fake.to('/api/delete')[0]).toMatchObject({
      method: 'DELETE',
      body: { model: 'qwen3:8b' },
    });
  });

  it('reports a model that is not installed', async () => {
    const fake = createFakeOllama({ models: [] });
    expect(await failureOf(manager(make(fake)).remove('qwen3:8b', signal()))).toMatchObject({
      kind: 'model-unavailable',
    });
  });
});

describe('BR-40: the registry offers Ollama, local only', () => {
  it('creates Ollama with its default local address', () => {
    const registry = createProviderRegistry(DEFAULT_PROVIDER_FACTORIES);
    expect(registry.list()).toEqual([expect.objectContaining({ id: 'ollama', location: 'local' })]);
    expect(registry.list()[0]?.settings[0]).toMatchObject({
      key: 'serverUrl',
      kind: 'local-url',
      defaultValue: 'http://127.0.0.1:11434',
    });
    expect(registry.create('ollama')?.descriptor.id).toBe('ollama');
  });
});

describe('BR-43 / AC-50: the model evaluation through the Ollama adapter', () => {
  /** A mocked Ollama model that behaves well: it calls the right tool, then quotes the result. */
  const wellBehaved = (body: unknown): FakeResponse => {
    const messages = (body as { messages: { role: string; content: string; tool_name?: string }[] })
      .messages;
    const last = messages.at(-1);
    if (last?.role === 'tool' && last.tool_name) {
      return { lines: chatLines.text(answerFrom(last.tool_name, last.content)) };
    }
    const next = callFor(last?.content ?? '');
    return next
      ? { lines: chatLines.toolCall(next.name, next.arguments) }
      : { lines: chatLines.text("I can't answer that from your rides.") };
  };

  it('passes a model that uses the tools correctly, and fails one that answers from memory', async () => {
    const fake = createFakeOllama({ chat: wellBehaved });
    const passed = await evaluateModel({
      provider: make(fake),
      model: 'qwen3:8b',
      signal: signal(),
    });
    expect(passed).toMatchObject({
      ok: true,
      evaluation: { passed: true, revision: 'sha256:qwen3-8b-digest' },
    });

    fake.set({ chat: () => ({ lines: chatLines.text('You rode about 480 km in March.') }) });
    const failed = await evaluateModel({
      provider: make(fake),
      model: 'qwen3:8b',
      signal: signal(),
    });
    expect(failed).toMatchObject({ ok: true, evaluation: { passed: false } });
  });

  it('cannot evaluate a model without tool calling, and sends it nothing', async () => {
    const fake = createFakeOllama({ models: [{ name: 'gemma:2b', capabilities: ['completion'] }] });
    expect(
      await evaluateModel({ provider: make(fake), model: 'gemma:2b', signal: signal() }),
    ).toEqual({
      ok: false,
      code: 'model-no-tools',
    });
    expect(fake.to('/api/chat')).toEqual([]);
  });
});
