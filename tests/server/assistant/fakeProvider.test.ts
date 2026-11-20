// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LLMError } from '../../../server/assistant/llm/errors';
import { analyst, createFakeProvider, fakeModel, type FakeTurn } from './fakeProvider';
import { describeProviderContract, type ContractScenario } from './providerContract';

/* The permanent fake provider passes the same contract as every real adapter (AC-45). */

describeProviderContract('the fake provider', () => {
  const provider = createFakeProvider({ models: [fakeModel('qwen3:8b')] });
  const turns: Record<ContractScenario['kind'], (s: ContractScenario) => FakeTurn> = {
    text: (s) => ({ text: s.kind === 'text' ? s.parts : [] }),
    'tool-call': (s) =>
      s.kind === 'tool-call' ? { toolCalls: [{ name: s.name, arguments: s.arguments }] } : {},
    error: (s) => (s.kind === 'error' ? { error: new LLMError(s.error) } : {}),
    slow: () => ({ hang: true }),
  };
  return {
    provider,
    model: 'qwen3:8b',
    errorKinds: [
      'unavailable',
      'timeout',
      'model-unavailable',
      'tools-unsupported',
      'busy',
      'invalid-response',
      'model-error',
    ],
    prepare: (scenario) => provider.respondWith([turns[scenario.kind](scenario)]),
  };
});

describe('NFR-05: the fake provider as a test implementation', () => {
  it('records every request it receives', async () => {
    const provider = createFakeProvider();
    for await (const _ of provider.generate(
      {
        model: 'qwen3:8b',
        system: 's',
        messages: [{ role: 'user', text: 'Hi' }],
        tools: [],
        contextTokens: 1,
        maxOutputTokens: 1,
      },
      new AbortController().signal,
    ));
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.messages).toEqual([{ role: 'user', text: 'Hi' }]);
  });

  it('refuses a model it does not have and fails when unreachable', async () => {
    const provider = createFakeProvider();
    const run = async (model: string) => {
      for await (const _ of provider.generate(
        { model, system: '', messages: [], tools: [], contextTokens: 1, maxOutputTokens: 1 },
        new AbortController().signal,
      ));
    };
    await expect(run('other:1b')).rejects.toMatchObject({ kind: 'model-unavailable' });
    provider.setReachable(false);
    await expect(provider.checkConnection(new AbortController().signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('installs a model, which then appears in the list, and removes it', async () => {
    const provider = createFakeProvider({ models: [] });
    const steps = [];
    for await (const step of provider.models.install('llama3.2:3b', new AbortController().signal))
      steps.push(step);
    expect(steps.at(-1)).toMatchObject({ completedBytes: 100, totalBytes: 100 });
    expect((await provider.listModels(new AbortController().signal)).map((m) => m.id)).toEqual([
      'llama3.2:3b',
    ]);
    await provider.models.remove('llama3.2:3b', new AbortController().signal);
    expect(await provider.listModels(new AbortController().signal)).toEqual([]);
  });

  it('analyst: calls the matching tool, then answers from its result', () => {
    const respond = analyst();
    const first = respond(
      {
        model: 'm',
        system: '',
        messages: [{ role: 'user', text: 'How far did I ride in each month of 2019?' }],
        tools: [],
        contextTokens: 1,
        maxOutputTokens: 1,
      },
      0,
    );
    expect(first.toolCalls).toEqual([
      { name: 'distance_by_month', arguments: { from: '2019-01-01', to: '2019-12-31' } },
    ]);
    const second = respond(
      {
        model: 'm',
        system: '',
        messages: [
          { role: 'user', text: 'How far did I ride in each month of 2019?' },
          { role: 'assistant', text: '', toolCalls: [] },
          {
            role: 'tool',
            callId: 'c',
            name: 'distance_by_month',
            content: '{"months":[{"year":2019,"month":3,"distanceKm":487.3,"rides":7}]}',
            isError: false,
          },
        ],
        tools: [],
        contextTokens: 1,
        maxOutputTokens: 1,
      },
      1,
    );
    expect(second.text).toBe('2019-03: 487.3 km');
  });
});
