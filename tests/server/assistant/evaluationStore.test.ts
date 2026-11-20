// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelEvaluation } from '../../../src/types/assistant';
import { EVALUATION_SUITE_VERSION } from '../../../server/assistant/evaluation';
import {
  createEvaluationStore,
  readStoredEvaluation,
} from '../../../server/assistant/evaluationStore';
import { fakeModel } from './fakeProvider';

const evaluation = (passed: boolean, patch: Partial<ModelEvaluation> = {}): ModelEvaluation => ({
  model: 'qwen3:8b',
  revision: 'sha256:a',
  suiteVersion: EVALUATION_SUITE_VERSION,
  passed,
  evaluatedAt: '2026-11-20T10:00:00.000Z',
  cases: [{ id: 'monthly-distance', title: 'Distance per month', passed, problems: [] }],
  ...patch,
});
const model = fakeModel('qwen3:8b', { revision: 'sha256:a' });

describe('BR-43 / OD-38: a model is suitable only after it passed, for that digest', () => {
  it('is untested, then suitable or unsuitable, and untested again after the model changed', () => {
    const store = createEvaluationStore();
    expect(store.suitability('ollama', model)).toBe('untested');
    store.record('ollama', evaluation(true));
    expect(store.suitability('ollama', model)).toBe('suitable');
    expect(store.suitability('ollama', { ...model, id: 'qwen3:8B' })).toBe('suitable');
    expect(store.suitability('ollama', { ...model, revision: 'sha256:b' })).toBe('untested');
    expect(store.suitability('other', model)).toBe('untested');
    store.record('ollama', evaluation(false));
    expect(store.suitability('ollama', model)).toBe('unsuitable');
    expect(store.get('ollama', 'qwen3:8b')?.passed).toBe(false);
  });

  it('never confirms a model without a reported digest', () => {
    const store = createEvaluationStore();
    store.record('ollama', evaluation(true, { revision: null }));
    expect(store.suitability('ollama', { ...model, revision: null })).toBe('untested');
  });

  it('does not count a result of another evaluation suite version', () => {
    const store = createEvaluationStore({ suiteVersion: 2 });
    store.record('ollama', evaluation(true, { suiteVersion: 1 }));
    expect(store.suitability('ollama', model)).toBe('untested');
    expect(store.get('ollama', 'qwen3:8b')).toBeNull();
  });
});

describe('BR-43 / AC-50: evaluation results are saved in the settings file', () => {
  let dir: string;
  let path: string;
  const logs: string[] = [];
  const log = (message: string) => void logs.push(message);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'assistant-settings-'));
    path = join(dir, 'data', 'assistant-settings.json');
    logs.length = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const file = () => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

  it('saves every field of a result and loads it after a restart', () => {
    createEvaluationStore({ path, log }).record('ollama', evaluation(true));
    expect(file()).toEqual({ evaluations: [{ provider: 'ollama', ...evaluation(true) }] });

    const restarted = createEvaluationStore({ path, log });
    expect(restarted.suitability('ollama', model)).toBe('suitable');
    expect(restarted.get('ollama', 'qwen3:8b')).toEqual(evaluation(true));
    expect(logs).toEqual([]);
  });

  it('replaces the earlier result of the same model', () => {
    const store = createEvaluationStore({ path, log });
    store.record('ollama', evaluation(true));
    store.record('ollama', evaluation(false, { evaluatedAt: '2026-11-21T10:00:00.000Z' }));
    expect(file().evaluations).toHaveLength(1);
    expect(createEvaluationStore({ path, log }).suitability('ollama', model)).toBe('unsuitable');
  });

  it('keeps the other settings in the file', () => {
    createEvaluationStore({ path, log }).record('ollama', evaluation(true)); // creates data/
    writeFileSync(path, JSON.stringify({ serverUrl: 'http://127.0.0.1:11434', model: 'x' }));
    createEvaluationStore({ path, log }).record('ollama', evaluation(true));
    expect(file()).toMatchObject({ serverUrl: 'http://127.0.0.1:11434', model: 'x' });
    expect(file().evaluations).toHaveLength(1);
  });

  it('drops results of an older suite version when loading', () => {
    createEvaluationStore({ path, suiteVersion: 1, log }).record(
      'ollama',
      evaluation(true, { suiteVersion: 1 }),
    );
    const newer = createEvaluationStore({ path, suiteVersion: 2, log });
    expect(newer.suitability('ollama', model)).toBe('untested');
    newer.record('ollama', evaluation(true, { model: 'llama3.2', suiteVersion: 2 }));
    expect((file().evaluations as unknown[]).length).toBe(1);
  });

  it('leaves a file that is not valid JSON unchanged and keeps results in memory', () => {
    createEvaluationStore({ path, log }).record('ollama', evaluation(true)); // creates data/
    writeFileSync(path, '{ not json', 'utf8');
    const store = createEvaluationStore({ path, log });
    store.record('ollama', evaluation(true));
    expect(store.suitability('ollama', model)).toBe('suitable');
    expect(readFileSync(path, 'utf8')).toBe('{ not json');
    expect(logs[0]).toMatch(/not valid JSON/);
  });
});

describe('OD-38: reading saved results', () => {
  const stored = { provider: 'ollama', ...evaluation(true) };

  it('reads a complete result', () => {
    expect(readStoredEvaluation(stored)).toEqual(stored);
  });

  it.each([
    ['no provider', { ...stored, provider: undefined }],
    ['no suite version', { ...stored, suiteVersion: '1' }],
    ['a broken case', { ...stored, cases: [{ id: 'x' }] }],
    ['not an object', 'qwen3:8b'],
  ])('drops a result with %s', (_, value) => {
    expect(readStoredEvaluation(value)).toBeNull();
  });

  it('does not trust a pass whose cases did not all pass, or that has no cases', () => {
    const failedCase = { id: 'x', title: 'x', passed: false, problems: ['wrong'] };
    expect(readStoredEvaluation({ ...stored, cases: [failedCase] })?.passed).toBe(false);
    expect(readStoredEvaluation({ ...stored, cases: [] })?.passed).toBe(false);
  });
});
