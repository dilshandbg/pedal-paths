import { describe, expect, it } from 'vitest';
import {
  describeDownload,
  describeModel,
  describeStatus,
  describeTurn,
  describeUnverifiedNumbers,
  formatBytes,
  type ChatTurn,
} from '@/features/assistant/utils/describeAssistant';
import { modelKey } from '@/features/assistant/utils/modelKey';
import type {
  AssistantModel,
  AssistantStatus,
  ModelDownload,
  ModelEvaluation,
} from '@/types/assistant';

const model = (patch: Partial<AssistantModel> = {}): AssistantModel => ({
  id: 'qwen3:8b',
  sizeBytes: 5_225_388_164,
  parameterSize: '8.2B',
  quantization: 'Q4_K_M',
  contextWindow: 40_960,
  toolCalling: true,
  streaming: true,
  structuredOutput: true,
  otherCapabilities: ['thinking'],
  local: true,
  selected: false,
  suitability: 'untested',
  evaluation: null,
  testing: false,
  ...patch,
});

const evaluation = (passed: boolean): ModelEvaluation => ({
  model: 'qwen3:8b',
  revision: 'sha256:a',
  suiteVersion: 1,
  passed,
  evaluatedAt: '2026-11-20T10:00:00.000Z',
  cases: [
    { id: 'a', title: 'Distance per month', passed: true, problems: [] },
    {
      id: 'b',
      title: 'Visits',
      passed,
      problems: passed ? [] : ['It did not call location_visits.'],
    },
  ],
});

describe('UX-14: sizes', () => {
  it.each([
    [5_225_388_164, '5.2 GB'],
    [640_000_000, '640 MB'],
    [12_345, '12 kB'],
    [999, '999 B'],
    [0, '0 B'],
  ])('%d bytes → %s', (bytes, text) => expect(formatBytes(bytes)).toBe(text));

  it.each([null, -1, Number.NaN])('%s → no size', (bytes) => expect(formatBytes(bytes)).toBeNull());
});

describe('UX-14 / AC-47 / AC-50 / AC-51: models in the list', () => {
  it('shows details and capabilities in words', () => {
    expect(describeModel(model())).toMatchObject({
      details: '8.2B · Q4_K_M · 5.2 GB · 40,960-token context',
      capabilities: 'Tool calling · Streaming · Structured output · thinking',
      limitation: null,
      testLabel: 'Not tested: test it before asking',
      testTone: 'warning',
      canSelect: true,
      canTest: true,
    });
  });

  it('shows a passed and a failed test with each case', () => {
    expect(
      describeModel(model({ suitability: 'suitable', evaluation: evaluation(true) })),
    ).toMatchObject({
      testLabel: 'Passed the test (Nov 20, 2026)',
      testTone: 'ok',
    });
    const failed = describeModel(
      model({ suitability: 'unsuitable', evaluation: evaluation(false) }),
    );
    expect(failed.testLabel).toBe('Failed the test (Nov 20, 2026): not used for ride questions');
    expect(failed.cases[1]).toEqual({
      title: 'Visits',
      passed: false,
      problems: ['It did not call location_visits.'],
    });
  });

  it('marks a model without tool calling: it can be selected but not tested', () => {
    const item = describeModel(model({ toolCalling: false }));
    expect(item.capabilities).toMatch(/^No tool calling/);
    expect(item.limitation).toMatch(/can't use the ride analytics/);
    expect(item).toMatchObject({ canSelect: true, canTest: false });
  });

  it('marks a cloud model as not used: it can be neither selected nor tested', () => {
    const item = describeModel(model({ id: 'gpt-oss:120b-cloud', local: false }));
    expect(item.limitation).toMatch(/^Cloud model/);
    expect(item).toMatchObject({ canSelect: false, canTest: false });
  });

  it('shows unknown values as unknown, and a model being tested', () => {
    const item = describeModel(
      model({
        sizeBytes: null,
        parameterSize: null,
        quantization: null,
        contextWindow: null,
        toolCalling: 'unknown',
        otherCapabilities: [],
        testing: true,
      }),
    );
    expect(item.details).toBe('No details reported');
    expect(item.capabilities).toMatch(/^Tool calling unknown/);
    expect(item).toMatchObject({ testLabel: 'Testing…', canTest: false });
  });

  it('does not offer to select the selected model again', () => {
    expect(describeModel(model({ selected: true })).canSelect).toBe(false);
  });
});

const download = (patch: Partial<ModelDownload>): ModelDownload => ({
  model: 'qwen3:8b',
  status: 'downloading',
  detail: 'pulling abc',
  completedBytes: null,
  totalBytes: null,
  error: null,
  startedAt: '2026-11-20T10:00:00.000Z',
  finishedAt: null,
  ...patch,
});

describe('AC-48: downloads', () => {
  const message = (code: string) => `[${code}]`;

  it('shows progress with sizes and percent', () => {
    expect(
      describeDownload(
        download({ completedBytes: 2_600_000_000, totalBytes: 5_200_000_000 }),
        message,
      ),
    ).toEqual({
      model: 'qwen3:8b',
      running: true,
      percent: 50,
      label: 'Pulling abc: 2.6 GB of 5.2 GB (50%)',
      tone: 'neutral',
    });
    expect(describeDownload(download({ detail: null }), message)).toMatchObject({
      percent: null,
      label: 'Starting',
    });
  });

  it('says how it ended, and that it can be started again', () => {
    expect(describeDownload(download({ status: 'completed' }), message).label).toBe(
      'Downloaded. Test it before asking.',
    );
    expect(describeDownload(download({ status: 'cancelled' }), message).label).toBe(
      'Cancelled. You can start it again.',
    );
    expect(
      describeDownload(download({ status: 'failed', error: 'timeout' }), message),
    ).toMatchObject({
      label: 'Failed: [timeout] You can start it again.',
      tone: 'error',
    });
  });
});

const turn = (patch: Partial<ChatTurn> = {}): ChatTurn => ({
  id: 1,
  question: 'How far in 2019?',
  answer: '1,455.2 km.',
  tools: [],
  unverifiedNumbers: [],
  state: 'done',
  error: null,
  ...patch,
});

describe('UX-13 / AC-43 / AC-52 / AC-55: answers in the chat', () => {
  it('lists the analytics used, and marks invalid requests', () => {
    const view = describeTurn(
      turn({
        tools: [
          {
            name: 'distance_by_year',
            label: 'distance by year',
            summary: '2019-01-01 – 2019-12-31',
            arguments: {},
            ok: true,
          },
          { name: 'x', label: 'unknown_tool', summary: '', arguments: {}, ok: false },
        ],
      }),
    );
    expect(view.toolsUsed).toEqual([
      'distance by year, 2019-01-01 – 2019-12-31',
      'unknown_tool (invalid request, not used)',
    ]);
  });

  it('warns about numbers that did not come from the analytics', () => {
    expect(describeUnverifiedNumbers([])).toBeNull();
    expect(describeUnverifiedNumbers([37])).toBe(
      'Check this answer: the number 37 did not come from your ride analytics.',
    );
    expect(describeTurn(turn({ unverifiedNumbers: [1234.5, 900] })).warning).toBe(
      'Check this answer: the numbers 1,234.5, 900 did not come from your ride analytics.',
    );
  });

  it('notes a stopped or cut answer, and passes an error on', () => {
    expect(describeTurn(turn({ state: 'stopped' })).note).toBe('Stopped.');
    expect(describeTurn(turn({ state: 'cut' })).note).toMatch(/cut off/);
    expect(describeTurn(turn({ state: 'answering' }))).toMatchObject({
      answering: true,
      note: null,
    });
    expect(describeTurn(turn({ state: 'failed', error: 'Too slow.' })).error).toBe('Too slow.');
  });
});

const status = (patch: Partial<AssistantStatus> = {}): AssistantStatus => ({
  provider: {
    id: 'ollama',
    displayName: 'Ollama (on this computer)',
    settings: [],
    modelLibrary: null,
  },
  serverUrl: 'http://127.0.0.1:11434',
  reachable: true,
  version: '0.12.6',
  model: 'qwen3:8b',
  ready: true,
  problem: null,
  message: null,
  ...patch,
});

describe('UX-14 / AC-46 / RULE-26: the assistant status', () => {
  it('is ready with the model and the provider', () => {
    expect(describeStatus(status(), 'ready')).toEqual({
      text: 'Ready: qwen3:8b on Ollama (on this computer) 0.12.6.',
      tone: 'ok',
    });
  });

  it('says what stops a question, connected or not', () => {
    expect(
      describeStatus(
        status({ ready: false, problem: 'model-not-evaluated', message: 'Test it.' }),
        'ready',
      ),
    ).toEqual({ text: 'Connected to Ollama (on this computer) 0.12.6. Test it.', tone: 'warning' });
    expect(
      describeStatus(
        status({
          ready: false,
          reachable: false,
          version: null,
          problem: 'provider-unavailable',
          message: 'Start it.',
        }),
        'ready',
      ),
    ).toEqual({ text: 'Start it.', tone: 'error' });
  });

  it('reports a backend that cannot be reached, and a first check', () => {
    expect(describeStatus(null, 'failed').tone).toBe('error');
    expect(describeStatus(null, 'loading').text).toBe('Checking the assistant…');
  });
});

describe('BR-42: one key per model', () => {
  it.each([
    ['qwen3', 'qwen3:latest'],
    ['Qwen3:8B', 'qwen3:8b'],
    ['library/qwen3', 'library/qwen3:latest'],
    ['hf.co/user/model:q4', 'hf.co/user/model:q4'],
  ])('%s → %s', (name, key) => expect(modelKey(name)).toBe(key));
});
