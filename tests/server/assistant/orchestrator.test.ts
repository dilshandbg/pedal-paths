// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AssistantEvent, ModelSuitability } from '../../../src/types/assistant';
import { createConversationStore } from '../../../server/assistant/conversations';
import { LLMError } from '../../../server/assistant/llm/errors';
import type { ChatMessage, ModelInfo } from '../../../server/assistant/llm/types';
import {
  createOrchestrator,
  DEFAULT_LIMITS,
  fitHistory,
  type OrchestratorDeps,
} from '../../../server/assistant/orchestrator';
import { createAnalyticsTools } from '../../../server/assistant/tools/analyticsTools';
import { SYNTHETIC_ANALYTICS } from '../../../server/assistant/evaluation';
import {
  analyst,
  answerFrom,
  createFakeProvider,
  fakeModel,
  type FakeProvider,
  type FakeTurn,
} from './fakeProvider';

/* The orchestrator against the fake provider and the synthetic analytics; no Ollama needed. */

const tools = createAnalyticsTools(SYNTHETIC_ANALYTICS, { timeZone: 'UTC' });

function setup(
  options: {
    provider?: FakeProvider;
    suitability?: ModelSuitability;
    model?: string | null;
    limits?: OrchestratorDeps['limits'];
  } = {},
) {
  const provider = options.provider ?? createFakeProvider({ respond: analyst() });
  const conversations = createConversationStore();
  const orchestrator = createOrchestrator({
    tools,
    conversations,
    target: () =>
      options.model === null ? null : { provider, model: options.model ?? 'qwen3:8b' },
    suitability: () => options.suitability ?? 'suitable',
    history: () => ({ rideCount: 62, firstRideDate: '2018-01-06', lastRideDate: '2019-06-29' }),
    timeZone: 'UTC',
    clock: () => new Date('2020-01-15T12:00:00Z'),
    ...(options.limits ? { limits: options.limits } : {}),
    log: () => {},
  });
  return { provider, conversations, orchestrator, id: orchestrator.startConversation() };
}

async function ask(
  orchestrator: ReturnType<typeof setup>['orchestrator'],
  id: string,
  question: string,
  signal = new AbortController().signal,
) {
  const events: AssistantEvent[] = [];
  for await (const event of orchestrator.ask(id, question, signal)) events.push(event);
  const text = events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('');
  const tools = events.flatMap((e) => (e.type === 'tool' ? [e.use] : []));
  return { events, text, tools, last: events.at(-1) };
}

describe('AC-43: a ride question is answered from the analytics', () => {
  it('calls the tool, runs it locally, and answers with its numbers', async () => {
    const { orchestrator, id, provider } = setup();
    const result = await ask(orchestrator, id, 'How far did I ride in each month of 2019?');

    expect(result.tools).toEqual([
      expect.objectContaining({
        name: 'distance_by_month',
        label: 'distance by month',
        summary: '2019-01-01 – 2019-12-31',
        ok: true,
      }),
    ]);
    expect(result.text).toBe('2019-03: 487.3 km; 2019-04: 312.8 km; 2019-06: 655.1 km');
    expect(result.last).toEqual({ type: 'done', reason: 'stop' });

    // Round 2 sent the tool result back to the model, with the same tools.
    expect(provider.requests).toHaveLength(2);
    const toolMessage = provider.requests[1]?.messages.at(-1);
    expect(toolMessage).toMatchObject({ role: 'tool', name: 'distance_by_month', isError: false });
    expect(provider.requests[1]?.tools.map((t) => t.name)).toContain('distance_by_month');
    // Ride questions keep the model's own sampling; only the model test fixes the temperature.
    expect(provider.requests.map((r) => r.temperature)).toEqual([undefined, undefined]);
  });

  it('instructs the model to use only tool results, with today and the history', async () => {
    const { orchestrator, id, provider } = setup();
    await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    const system = provider.requests[0]?.system ?? '';
    expect(system).toContain('Never calculate, estimate, guess or invent ride statistics');
    expect(system).toContain('Today is 2020-01-15');
    expect(system).toContain('62 rides are stored, from 2018-01-06 to 2019-06-29');
  });

  it('streams text in the order the model writes it', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({ respond: [{ text: ['I cannot ', 'see heart rate.'] }] }),
    });
    const result = await ask(orchestrator, id, 'What was my heart rate?');
    expect(result.events.slice(0, 2)).toEqual([
      { type: 'text', delta: 'I cannot ' },
      { type: 'text', delta: 'see heart rate.' },
    ]);
  });

  it('keeps the conversation for follow-up questions', async () => {
    const { orchestrator, id, provider, conversations } = setup();
    await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    await ask(orchestrator, id, 'Compare my total distance in 2018 with 2019.');
    expect(conversations.messages(id)?.filter((m) => m.role === 'user')).toHaveLength(2);
    expect(provider.requests.at(-1)?.messages[0]).toEqual({
      role: 'user',
      text: 'How far did I ride in each month of 2019?',
    });
  });
});

describe('AC-44: invalid tool use', () => {
  it('returns invalid arguments to the model as problems, and lets it correct them', async () => {
    const turns: FakeTurn[] = [
      { toolCalls: [{ name: 'distance_by_month', arguments: { from: '2019-13-01' } }] },
      {
        toolCalls: [
          { name: 'distance_by_month', arguments: { from: '2019-01-01', to: '2019-12-31' } },
        ],
      },
      { text: 'March: 487.3 km.' },
    ];
    const { orchestrator, id, provider } = setup({
      provider: createFakeProvider({ respond: turns }),
    });
    const result = await ask(orchestrator, id, 'Months of 2019?');
    expect(result.tools.map((t) => t.ok)).toEqual([false, true]);
    const problem = provider.requests[1]?.messages.at(-1) as Extract<ChatMessage, { role: 'tool' }>;
    expect(problem.isError).toBe(true);
    expect(JSON.parse(problem.content)).toMatchObject({ error: 'invalid-arguments' });
    expect(result.last).toEqual({ type: 'done', reason: 'stop' });
  });

  it('reports an unknown tool to the model with the tools it may use', async () => {
    const turns: FakeTurn[] = [
      { toolCalls: [{ name: 'heart_rate', arguments: {} }] },
      { text: 'I cannot see heart rate.' },
    ];
    const { orchestrator, id, provider } = setup({
      provider: createFakeProvider({ respond: turns }),
    });
    const result = await ask(orchestrator, id, 'Heart rate?');
    expect(result.tools).toEqual([
      expect.objectContaining({ name: 'heart_rate', ok: false, summary: 'unknown tool' }),
    ]);
    const reply = provider.requests[1]?.messages.at(-1) as Extract<ChatMessage, { role: 'tool' }>;
    expect(JSON.parse(reply.content).availableTools).toContain('distance_by_month');
  });

  it('turns a failing analytics function into a tool error, not a crash', async () => {
    const broken = createAnalyticsTools({
      ...SYNTHETIC_ANALYTICS,
      distanceByYear: () => {
        throw new Error('disk');
      },
    });
    const provider = createFakeProvider({
      respond: [
        { toolCalls: [{ name: 'distance_by_year', arguments: {} }] },
        { text: 'The analytics failed.' },
      ],
    });
    const conversations = createConversationStore();
    const orchestrator = createOrchestrator({
      tools: broken,
      conversations,
      target: () => ({ provider, model: 'qwen3:8b' }),
      suitability: () => 'suitable',
      history: () => ({ rideCount: 0, firstRideDate: null, lastRideDate: null }),
      timeZone: 'UTC',
      log: () => {},
    });
    const result = await ask(orchestrator, orchestrator.startConversation(), 'Years?');
    expect(result.tools[0]?.ok).toBe(false);
    expect(result.last).toEqual({ type: 'done', reason: 'stop' });
  });

  it('stops a model that keeps calling tools after the round limit', async () => {
    const loop: FakeTurn = { toolCalls: [{ name: 'distance_by_year', arguments: {} }] };
    const { orchestrator, id, provider } = setup({
      provider: createFakeProvider({ respond: [loop] }),
    });
    const result = await ask(orchestrator, id, 'Years?');
    expect(provider.requests).toHaveLength(DEFAULT_LIMITS.maxRounds);
    expect(result.last).toMatchObject({ type: 'error', code: 'round-limit' });
  });

  it('treats an empty answer as an invalid response', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({ respond: [{ text: '  ' }] }),
    });
    expect((await ask(orchestrator, id, 'Hi')).last).toMatchObject({
      type: 'error',
      code: 'invalid-response',
    });
  });
});

describe('RULE-26 / AC-47 / AC-50: checks before a question is sent', () => {
  it.each<[string, Parameters<typeof setup>[0], string]>([
    ['no model selected', { model: null }, 'no-model-selected'],
    [
      'the provider is not reachable',
      { provider: createFakeProvider({ reachable: false }) },
      'provider-unavailable',
    ],
    ['the model is not installed', { model: 'llama3.2:3b' }, 'model-not-installed'],
    [
      'the model is a cloud model',
      { provider: createFakeProvider({ models: [fakeModel('qwen3:8b', { location: 'remote' })] }) },
      'model-remote',
    ],
    [
      'the model has a cloud name',
      {
        model: 'gpt-oss:120b-cloud',
        provider: createFakeProvider({ models: [fakeModel('gpt-oss:120b-cloud')] }),
      },
      'model-remote',
    ],
    [
      'the model has no tool calling',
      {
        provider: createFakeProvider({
          models: [
            fakeModel('qwen3:8b', {
              capabilities: {
                toolCalling: false,
                streaming: true,
                structuredOutput: false,
                other: [],
              },
            }),
          ],
        }),
      },
      'model-no-tools',
    ],
    ['the model was not tested', { suitability: 'untested' }, 'model-not-evaluated'],
    ['the model failed the test', { suitability: 'unsuitable' }, 'model-failed-evaluation'],
    [
      'the address is not local',
      { provider: createFakeProvider({ connectionError: new LLMError('not-local') }) },
      'not-local',
    ],
  ])('%s: nothing is sent to the model', async (_, options, code) => {
    const { orchestrator, id, provider } = setup(options);
    const result = await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    expect(result.events).toEqual([
      expect.objectContaining({ type: 'error', code, message: expect.any(String) }),
    ]);
    expect(provider.requests).toHaveLength(0);
  });

  it('accepts a model named without its tag', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({ models: [fakeModel('qwen3:latest')], respond: analyst() }),
      model: 'qwen3',
    });
    expect((await ask(orchestrator, id, 'How far did I ride in each month of 2019?')).last).toEqual(
      { type: 'done', reason: 'stop' },
    );
  });

  it('never switches to another model when the selected one is gone', async () => {
    const provider = createFakeProvider({ models: [fakeModel('llama3.2:3b')], respond: analyst() });
    const { orchestrator, id } = setup({ provider, model: 'qwen3:8b' });
    await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    expect(provider.requests).toHaveLength(0);
  });
});

describe('AC-52 / AC-53: streaming, stop, time limits and failures', () => {
  it('Stop ends the answer and cancels the model request', async () => {
    const provider = createFakeProvider({ respond: [{ hang: true }] });
    const { orchestrator, id, conversations } = setup({ provider });
    const controller = new AbortController();
    const pending = ask(orchestrator, id, 'Hi', controller.signal);
    setTimeout(() => controller.abort(), 20);
    const result = await pending;
    expect(result.last).toEqual({ type: 'done', reason: 'cancelled' });
    expect(conversations.messages(id)).toEqual([]); // an unfinished turn is not kept
  });

  it('stops even when the provider ignores the abort signal', async () => {
    const provider = createFakeProvider({
      respond: [{ delayMs: 30, ignoreAbort: true, text: ['a', 'b'] }],
    });
    const { orchestrator, id } = setup({ provider });
    const controller = new AbortController();
    const pending = ask(orchestrator, id, 'Hi', controller.signal);
    setTimeout(() => controller.abort(), 5);
    expect((await pending).last).toEqual({ type: 'done', reason: 'cancelled' });
  });

  it('fails with a timeout when the model does not start answering in time', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({ respond: [{ hang: true }] }),
      limits: { firstResponseMs: 20 },
    });
    expect((await ask(orchestrator, id, 'Hi')).last).toMatchObject({
      type: 'error',
      code: 'timeout',
    });
  });

  it.each([
    ['model-error', 'model-error'],
    ['busy', 'busy'],
    ['invalid-response', 'invalid-response'],
    ['context-too-long', 'context-too-long'],
    ['tools-unsupported', 'model-no-tools'],
    ['unavailable', 'provider-unavailable'],
  ] as const)('a provider %s becomes a plain %s message', async (kind, code) => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({
        respond: [{ error: new LLMError(kind, 'raw provider text') }],
      }),
    });
    const result = await ask(orchestrator, id, 'Hi');
    expect(result.last).toMatchObject({ type: 'error', code });
    expect(JSON.stringify(result.last)).not.toContain('raw provider text');
  });

  it('a failure part-way through keeps nothing of the turn', async () => {
    const provider = createFakeProvider({
      respond: [{ text: 'Half', errorAfterText: new LLMError('model-error') }],
    });
    const { orchestrator, id, conversations } = setup({ provider });
    await ask(orchestrator, id, 'Hi');
    expect(conversations.messages(id)).toEqual([]);
  });

  it('answers one question at a time per conversation', async () => {
    const provider = createFakeProvider({ respond: [{ delayMs: 30, text: 'Done.' }] });
    const { orchestrator, id } = setup({ provider });
    const first = ask(orchestrator, id, 'One');
    const second = await ask(orchestrator, id, 'Two');
    expect(second.events).toEqual([
      expect.objectContaining({ type: 'error', code: 'conversation-busy' }),
    ]);
    expect((await first).last).toEqual({ type: 'done', reason: 'stop' });
  });

  it('reports a conversation that no longer exists', async () => {
    const { orchestrator, id } = setup();
    orchestrator.endConversation(id);
    expect((await ask(orchestrator, id, 'Hi')).events).toEqual([
      expect.objectContaining({ code: 'conversation-not-found' }),
    ]);
  });

  it('refuses an empty question', async () => {
    const { orchestrator, id } = setup();
    await expect(ask(orchestrator, id, '   ')).rejects.toThrow(TypeError);
  });
});

describe('context management', () => {
  const user = (text: string): ChatMessage => ({ role: 'user', text });
  const answer = (text: string): ChatMessage => ({ role: 'assistant', text, toolCalls: [] });

  it('keeps the newest whole turns that fit', () => {
    const history = [
      user('a'.repeat(10)),
      answer('b'.repeat(10)),
      user('c'.repeat(10)),
      answer('d'.repeat(10)),
    ];
    expect(fitHistory(history, 25)).toEqual(history.slice(2));
    // An assistant message also counts its tool calls ("[]" here): each turn is 22 characters.
    expect(fitHistory(history, 43)).toEqual(history.slice(2));
    expect(fitHistory(history, 44)).toEqual(history);
    expect(fitHistory(history, 5)).toEqual([]);
    expect(fitHistory([], 100)).toEqual([]);
  });

  it('uses at most 16,384 tokens of context, and the model window when smaller', async () => {
    const big = createFakeProvider({
      models: [fakeModel('qwen3:8b', { contextWindow: 131_072 })],
      respond: [{ text: 'ok' }],
    });
    const small = createFakeProvider({
      models: [fakeModel('qwen3:8b', { contextWindow: 4_096 })],
      respond: [{ text: 'ok' }],
    });
    const unknown = createFakeProvider({
      models: [fakeModel('qwen3:8b', { contextWindow: null })],
      respond: [{ text: 'ok' }],
    });
    for (const [provider, expected] of [
      [big, 16_384],
      [small, 4_096],
      [unknown, 8_192],
    ] as const) {
      const { orchestrator, id } = setup({ provider });
      await ask(orchestrator, id, 'Hi');
      expect(provider.requests[0]?.contextTokens).toBe(expected);
    }
  });

  it('drops the oldest turns when the conversation outgrows the context', async () => {
    const provider = createFakeProvider({
      models: [fakeModel('qwen3:8b', { contextWindow: 2_048 })],
      respond: [{ text: 'x'.repeat(1_500) }],
    });
    const { orchestrator, id } = setup({ provider });
    for (let i = 0; i < 4; i += 1) await ask(orchestrator, id, `Question ${i}`);
    const sent = provider.requests.at(-1)?.messages ?? [];
    expect(sent.at(-1)).toEqual({ role: 'user', text: 'Question 3' });
    expect(sent.some((m) => m.role === 'user' && m.text === 'Question 0')).toBe(false);
  });
});

describe('BR-40: the orchestrator is provider-neutral', () => {
  it('works with any LLMProvider, identified only by its descriptor', async () => {
    const suitability = vi.fn(() => 'suitable' as const);
    const provider = createFakeProvider({ id: 'another', respond: analyst() });
    const conversations = createConversationStore();
    const orchestrator = createOrchestrator({
      tools,
      conversations,
      target: () => ({ provider, model: 'qwen3:8b' }),
      suitability,
      history: () => ({ rideCount: 0, firstRideDate: null, lastRideDate: null }),
      timeZone: 'UTC',
      log: () => {},
    });
    await ask(
      orchestrator,
      orchestrator.startConversation(),
      'How far did I ride in each month of 2019?',
    );
    expect(suitability).toHaveBeenCalledWith(
      'another',
      expect.objectContaining<Partial<ModelInfo>>({ id: 'qwen3:8b' }),
    );
  });
});

describe('RULE-25 / AC-55: untraceable numbers are flagged', () => {
  it('flags numbers that no tool result or question contains, just before done', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({
        respond: analyst({ answer: () => 'March: 487.3 km, about 37% more than average.' }),
      }),
    });
    const result = await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    expect(result.events.slice(-2)).toEqual([
      { type: 'unverified-numbers', numbers: [37] },
      { type: 'done', reason: 'stop' },
    ]);
  });

  it('flags nothing when every number comes from the analytics or a defined derivation', async () => {
    const { orchestrator, id } = setup({
      provider: createFakeProvider({
        respond: analyst({
          answer: (name, content) => `${answerFrom(name, content)} Together 1,455.2 km.`,
        }),
      }),
    });
    const result = await ask(orchestrator, id, 'How far did I ride in each month of 2019?');
    expect(result.events.some((e) => e.type === 'unverified-numbers')).toBe(false);
  });

  it('trusts tool results of earlier questions, but not earlier answers', async () => {
    const turns: FakeTurn[] = [
      {
        toolCalls: [
          { name: 'distance_by_month', arguments: { from: '2019-01-01', to: '2019-12-31' } },
        ],
      },
      { text: 'March: 487.3 km. Your friends rode 999 km.' },
      { text: 'Again: March was 487.3 km, friends 999 km.' },
    ];
    const { orchestrator, id } = setup({ provider: createFakeProvider({ respond: turns }) });
    const first = await ask(orchestrator, id, 'Months of 2019?');
    expect(first.events.at(-2)).toEqual({ type: 'unverified-numbers', numbers: [999] });
    const second = await ask(orchestrator, id, 'Say that again.');
    expect(second.events.at(-2)).toEqual({ type: 'unverified-numbers', numbers: [999] });
  });
});
