// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ModelEvaluation } from '../../../src/types/assistant';
import {
  EVALUATION_CASES,
  EVALUATION_SUITE_VERSION,
  evaluateModel,
} from '../../../server/assistant/evaluation';
import {
  answerFrom,
  analyst,
  callFor,
  createFakeProvider,
  fakeModel,
  type AnalystBehaviour,
} from './fakeProvider';

/*
 * BR-43, AC-50: the model evaluation on the fake provider. A well-behaved scripted model passes;
 * each kind of misbehaviour fails with a specific problem.
 */

const evaluate = (
  behaviour: AnalystBehaviour = {},
  options: Parameters<typeof createFakeProvider>[0] = {},
) =>
  evaluateModel({
    provider: createFakeProvider({ respond: analyst(behaviour), ...options }),
    model: 'qwen3:8b',
    signal: new AbortController().signal,
    clock: () => new Date('2026-11-20T10:00:00Z'),
  });

const passedEvaluation = async (behaviour: AnalystBehaviour = {}) => {
  const outcome = await evaluate(behaviour);
  if (!outcome.ok) throw new Error(`evaluation could not run: ${outcome.code}`);
  return outcome.evaluation;
};
const caseResult = (evaluation: ModelEvaluation, id: string) =>
  evaluation.cases.find((c) => c.id === id);

describe('BR-43: model evaluation', () => {
  it('passes a model that selects the right tools, with the right arguments, and quotes the results', async () => {
    const evaluation = await passedEvaluation();
    expect(evaluation.cases.map((c) => [c.id, c.passed, c.problems])).toEqual(
      EVALUATION_CASES.map((c) => [c.id, true, []]),
    );
    expect(evaluation).toMatchObject({
      model: 'qwen3:8b',
      revision: 'sha256:qwen3:8b',
      suiteVersion: EVALUATION_SUITE_VERSION,
      passed: true,
      evaluatedAt: '2026-11-20T10:00:00.000Z',
    });
  });

  it('accepts a different but correct tool choice (yearly totals for a year comparison)', async () => {
    const evaluation = await passedEvaluation({
      call: (q) =>
        /compare/i.test(q)
          ? { name: 'distance_by_year', arguments: { from: '2018-01-01', to: '2019-12-31' } }
          : callFor(q),
    });
    expect(caseResult(evaluation, 'compare-years')?.passed).toBe(true);
  });

  it('fails a model that does not call a tool and answers from memory', async () => {
    const evaluation = await passedEvaluation({
      call: () => null,
      noTool: () => 'You rode about 480 km in March 2019.',
    });
    expect(evaluation.passed).toBe(false);
    expect(caseResult(evaluation, 'monthly-distance')?.problems).toEqual(
      expect.arrayContaining([
        'It did not call distance_by_month with valid arguments.',
        'The answer contains numbers that are not in any tool result: 480.',
      ]),
    );
  });

  it('fails a model that generates wrong arguments', async () => {
    const evaluation = await passedEvaluation({
      call: (q) =>
        /each month/i.test(q)
          ? { name: 'distance_by_month', arguments: { from: '2018-01-01', to: '2018-12-31' } }
          : callFor(q),
    });
    expect(caseResult(evaluation, 'monthly-distance')?.problems).toContain(
      'It did not ask for 2019-01-01 to 2019-12-31.',
    );
  });

  it('fails a model that swaps latitude and longitude', async () => {
    const evaluation = await passedEvaluation({
      call: (q) =>
        /within/i.test(q)
          ? { name: 'location_visits', arguments: { lat: 13.0591, lng: 52.4009, radiusM: 200 } }
          : callFor(q),
    });
    expect(caseResult(evaluation, 'location-visits')?.passed).toBe(false);
  });

  it('accepts an extra, valid call to another analytics tool next to the expected one', async () => {
    const evaluation = await passedEvaluation({
      extraCall: (q) =>
        /each month/i.test(q)
          ? { name: 'distance_by_year', arguments: { from: '2019-01-01', to: '2019-12-31' } }
          : null,
    });
    expect(caseResult(evaluation, 'monthly-distance')).toMatchObject({
      passed: true,
      problems: [],
    });
  });

  it('fails a model that calls an unrelated tool instead of the expected one', async () => {
    const evaluation = await passedEvaluation({
      call: (q) =>
        /each month/i.test(q)
          ? {
              name: 'route_frequency',
              arguments: { south: 52.4, west: 13.05, north: 52.41, east: 13.06 },
            }
          : callFor(q),
    });
    expect(caseResult(evaluation, 'monthly-distance')?.problems).toEqual([
      'It did not call distance_by_month with valid arguments.',
      'The answer does not give the monthly distances from the tool result.',
    ]);
  });

  it('accepts a rejected extra call (unknown tool) when the model also makes the expected call', async () => {
    const evaluation = await passedEvaluation({
      extraCall: (q) => (/each month/i.test(q) ? { name: 'heart_rate', arguments: {} } : null),
    });
    expect(caseResult(evaluation, 'monthly-distance')).toMatchObject({
      passed: true,
      problems: [],
    });
  });

  it('accepts a rejected extra call (invalid arguments) when the model also makes the expected call', async () => {
    const evaluation = await passedEvaluation({
      extraCall: (q) =>
        /each month/i.test(q)
          ? { name: 'distance_by_year', arguments: { from: 'last year' } }
          : null,
    });
    expect(caseResult(evaluation, 'monthly-distance')).toMatchObject({
      passed: true,
      problems: [],
    });
  });

  it('recovers when a rejected call comes first and the expected call follows in the next round', async () => {
    const evaluation = await passedEvaluation({
      // First round: a call the tool rejects; after the error, the expected call.
      call: (q) =>
        /each month/i.test(q)
          ? { name: 'distance_by_year', arguments: { from: '2018-01-06', year: '2019' } }
          : callFor(q),
      retry: (q) => callFor(q),
    });
    expect(caseResult(evaluation, 'monthly-distance')).toMatchObject({
      passed: true,
      problems: [],
    });
  });

  it('fails a model whose rejected call is not followed by the expected call', async () => {
    const evaluation = await passedEvaluation({
      call: (q) =>
        /each month/i.test(q)
          ? { name: 'distance_by_year', arguments: { from: 'last year' } }
          : callFor(q),
    });
    expect(caseResult(evaluation, 'monthly-distance')?.problems).toEqual([
      'It used tools incorrectly (unknown tool or invalid arguments): distance_by_year.',
      'It did not call distance_by_month with valid arguments.',
      'The answer does not give the monthly distances from the tool result.',
    ]);
  });

  it('fails a model that ignores the tool result', async () => {
    const evaluation = await passedEvaluation({ answer: () => 'I looked that up for you.' });
    expect(caseResult(evaluation, 'monthly-distance')?.problems).toContain(
      'The answer does not give the monthly distances from the tool result.',
    );
    expect(caseResult(evaluation, 'location-visits')?.passed).toBe(false);
  });

  it('fails a model that invents results next to the real ones', async () => {
    const evaluation = await passedEvaluation({
      answer: (name, content) =>
        `${answerFrom(name, content)} That is 37% more than your friends ride.`,
    });
    expect(caseResult(evaluation, 'location-visits')?.problems).toContain(
      'The answer contains numbers that are not in any tool result: 37.',
    );
  });

  it('fails a model that invents an answer the analytics cannot give', async () => {
    const evaluation = await passedEvaluation({
      noTool: () => 'Your average heart rate in 2019 was 142 bpm.',
    });
    expect(caseResult(evaluation, 'unanswerable')?.problems).toEqual([
      'The answer contains numbers that are not in any tool result: 142.',
    ]);
  });

  it('asks the model for temperature 0 in every request, so a test gives the same result each time', async () => {
    const provider = createFakeProvider({ respond: analyst() });
    const outcome = await evaluateModel({
      provider,
      model: 'qwen3:8b',
      signal: new AbortController().signal,
    });
    expect(outcome.ok).toBe(true);
    expect(provider.requests.length).toBeGreaterThan(0);
    expect(provider.requests.map((r) => r.temperature)).toEqual(provider.requests.map(() => 0));
  });

  it('fails a model whose answers fail', async () => {
    const evaluation = await passedEvaluation({ answer: () => '' });
    expect(caseResult(evaluation, 'monthly-distance')?.problems[0]).toMatch(/^It failed:/);
  });

  it('cannot evaluate a model that is missing, remote or without tool calling', async () => {
    expect(await evaluate({}, { models: [] })).toEqual({ ok: false, code: 'model-not-installed' });
    expect(await evaluate({}, { models: [fakeModel('qwen3:8b', { location: 'remote' })] })).toEqual(
      { ok: false, code: 'model-remote' },
    );
    expect(
      await evaluate(
        {},
        {
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
        },
      ),
    ).toEqual({ ok: false, code: 'model-no-tools' });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const pending = evaluateModel({
      provider: createFakeProvider({ respond: [{ hang: true }] }),
      model: 'qwen3:8b',
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
  });
});
