import { describe, expect, it } from 'vitest';
import { LLMError, type LLMErrorKind } from '../../../server/assistant/llm/errors';
import type {
  GenerateEvent,
  GenerateRequest,
  LLMProvider,
} from '../../../server/assistant/llm/types';

/*
 * The provider contract (BR-40, AC-45): every `LLMProvider` adapter must pass these tests. An
 * adapter's test file calls `describeProviderContract` with a harness that makes its provider
 * (for a real adapter: over mocked HTTP) behave as each scenario asks.
 */

export type ContractScenario =
  | { readonly kind: 'text'; readonly parts: readonly string[] }
  | {
      readonly kind: 'tool-call';
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    }
  | { readonly kind: 'error'; readonly error: LLMErrorKind }
  | { readonly kind: 'slow' };

export interface ContractHarness {
  readonly provider: LLMProvider;
  readonly model: string;
  /** Error kinds this provider can produce, each tested. */
  readonly errorKinds: readonly LLMErrorKind[];
  /** Makes the next `generate` call behave as the scenario says. */
  prepare(scenario: ContractScenario): void;
}

const request = (model: string): GenerateRequest => ({
  model,
  system: 'You are a test.',
  messages: [{ role: 'user', text: 'Hello' }],
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
  contextTokens: 4096,
  maxOutputTokens: 256,
});

async function collect(
  provider: LLMProvider,
  model: string,
  signal = new AbortController().signal,
) {
  const events: GenerateEvent[] = [];
  for await (const event of provider.generate(request(model), signal)) events.push(event);
  return events;
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the provider to fail.');
}

export function describeProviderContract(name: string, makeHarness: () => ContractHarness): void {
  describe(`AC-45: ${name} satisfies the provider contract`, () => {
    it('reports that it is reachable and lists its models', async () => {
      const { provider, model } = makeHarness();
      await expect(provider.checkConnection(new AbortController().signal)).resolves.toBeDefined();
      const models = await provider.listModels(new AbortController().signal);
      expect(models.map((m) => m.id)).toContain(model);
      for (const m of models) expect(['local', 'remote']).toContain(m.location);
    });

    it('streams text in parts and ends with exactly one finish', async () => {
      const harness = makeHarness();
      harness.prepare({ kind: 'text', parts: ['Twenty ', 'rides.'] });
      const events = await collect(harness.provider, harness.model);
      const text = events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('');
      expect(text).toBe('Twenty rides.');
      expect(events.filter((e) => e.type === 'finish')).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'stop' });
    });

    it('reports a tool call once, complete, with an id and parsed arguments', async () => {
      const harness = makeHarness();
      harness.prepare({
        kind: 'tool-call',
        name: 'distance_by_year',
        arguments: { from: '2024-01-01' },
      });
      const events = await collect(harness.provider, harness.model);
      const calls = events.flatMap((e) => (e.type === 'tool-call' ? [e.call] : []));
      expect(calls).toHaveLength(1);
      expect(calls[0]?.id).toMatch(/\S/);
      expect(calls[0]).toMatchObject({
        name: 'distance_by_year',
        arguments: { from: '2024-01-01' },
      });
      expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'tool-calls' });
    });

    it('turns every failure into an LLMError of the right kind', async () => {
      const harness = makeHarness();
      for (const kind of harness.errorKinds) {
        harness.prepare({ kind: 'error', error: kind });
        const error = await failure(collect(harness.provider, harness.model));
        expect(error).toBeInstanceOf(LLMError);
        expect((error as LLMError).kind).toBe(kind);
      }
    });

    it('stops promptly with a cancelled LLMError when aborted', async () => {
      const harness = makeHarness();
      harness.prepare({ kind: 'slow' });
      const controller = new AbortController();
      const pending = failure(collect(harness.provider, harness.model, controller.signal));
      setTimeout(() => controller.abort(), 10);
      const error = await pending;
      expect(error).toBeInstanceOf(LLMError);
      expect((error as LLMError).kind).toBe('cancelled');
    });
  });
}
