import type {
  AssistantModel,
  AssistantStatus,
  AssistantToolUse,
  ModelDownload,
  ModelEvaluation,
} from '@/types/assistant';

/*
 * Turns assistant API data into the text the screens show (UX-13, UX-14). Pure functions: the
 * components only render what these return.
 */

/** `5.2 GB`, `640 MB`; null without a size. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`;
  return `${bytes} B`;
}

const yesNo = (value: boolean | 'unknown', yes: string, no: string, unknown: string) =>
  value === 'unknown' ? unknown : value ? yes : no;

/** One model as the model list shows it. */
export interface ModelListItem {
  readonly id: string;
  /** E.g. `8.2B · Q4_K_M · 5.2 GB · 40,960-token context`. */
  readonly details: string;
  /** E.g. `Tool calling · Streaming · Structured output · thinking`. */
  readonly capabilities: string;
  /** Why the model can't be used, in words (never colour alone); null when it can. */
  readonly limitation: string | null;
  /** E.g. `Passed the test (Nov 20, 2026)`, `Not tested`. */
  readonly testLabel: string;
  readonly testTone: 'ok' | 'warning' | 'error' | 'neutral';
  readonly cases: readonly {
    readonly title: string;
    readonly passed: boolean;
    readonly problems: readonly string[];
  }[];
  readonly selected: boolean;
  readonly canSelect: boolean;
  readonly canTest: boolean;
  readonly testing: boolean;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

function testState(model: AssistantModel, evaluation: ModelEvaluation | null) {
  if (model.testing) return { testLabel: 'Testing…', testTone: 'neutral' as const };
  if (model.suitability === 'suitable' && evaluation) {
    return {
      testLabel: `Passed the test (${dateLabel(evaluation.evaluatedAt)})`,
      testTone: 'ok' as const,
    };
  }
  if (model.suitability === 'unsuitable' && evaluation) {
    return {
      testLabel: `Failed the test (${dateLabel(evaluation.evaluatedAt)}): not used for ride questions`,
      testTone: 'error' as const,
    };
  }
  return { testLabel: 'Not tested: test it before asking', testTone: 'warning' as const };
}

// Implements: UX-14, AC-47, AC-50, AC-51
export function describeModel(model: AssistantModel): ModelListItem {
  const details = [
    model.parameterSize,
    model.quantization,
    formatBytes(model.sizeBytes),
    model.contextWindow ? `${model.contextWindow.toLocaleString('en-US')}-token context` : null,
  ].filter((part): part is string => part !== null);
  const capabilities = [
    yesNo(model.toolCalling, 'Tool calling', 'No tool calling', 'Tool calling unknown'),
    yesNo(model.streaming, 'Streaming', 'No streaming', 'Streaming unknown'),
    yesNo(
      model.structuredOutput,
      'Structured output',
      'No structured output',
      'Structured output unknown',
    ),
    ...model.otherCapabilities,
  ];
  const limitation = !model.local
    ? 'Cloud model: it runs outside this computer, so it is not used.'
    : model.toolCalling === false
      ? "No tool calling: it can't use the ride analytics, so it can't answer ride questions."
      : null;
  return {
    id: model.id,
    details: details.join(' · ') || 'No details reported',
    capabilities: capabilities.join(' · '),
    limitation,
    ...testState(model, model.evaluation),
    cases:
      model.evaluation?.cases.map((c) => ({
        title: c.title,
        passed: c.passed,
        problems: c.problems,
      })) ?? [],
    selected: model.selected,
    canSelect: model.local && !model.selected,
    canTest: model.local && model.toolCalling !== false && !model.testing,
    testing: model.testing,
  };
}

/** One download as the settings show it (AC-48). */
export interface DownloadItem {
  readonly model: string;
  readonly running: boolean;
  /** 0–100, or null while the size is unknown. */
  readonly percent: number | null;
  /** E.g. `Downloading: 2.6 GB of 5.2 GB (50%)`, `Cancelled`. */
  readonly label: string;
  readonly tone: 'neutral' | 'ok' | 'warning' | 'error';
}

// Implements: AC-48
export function describeDownload(
  download: ModelDownload,
  errorMessage: (code: string) => string,
): DownloadItem {
  const { completedBytes: done, totalBytes: total } = download;
  const percent =
    done !== null && total !== null && total > 0
      ? Math.min(100, Math.floor((done / total) * 100))
      : null;
  switch (download.status) {
    case 'downloading': {
      const amount =
        percent !== null ? `: ${formatBytes(done)} of ${formatBytes(total)} (${percent}%)` : '';
      return {
        model: download.model,
        running: true,
        percent,
        label: `${download.detail ? capitalize(download.detail) : 'Starting'}${amount}`,
        tone: 'neutral',
      };
    }
    case 'completed':
      return {
        model: download.model,
        running: false,
        percent: 100,
        label: 'Downloaded. Test it before asking.',
        tone: 'ok',
      };
    case 'cancelled':
      return {
        model: download.model,
        running: false,
        percent,
        label: 'Cancelled. You can start it again.',
        tone: 'warning',
      };
    case 'failed':
      return {
        model: download.model,
        running: false,
        percent,
        label: `Failed: ${errorMessage(download.error ?? 'internal')} You can start it again.`,
        tone: 'error',
      };
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `Used: distance by month, 2019-01-01 – 2019-12-31` items for an answer (AC-43). */
export function describeToolUse(use: AssistantToolUse): string {
  const what = use.summary ? `${use.label}, ${use.summary}` : use.label;
  return use.ok ? what : `${what} (invalid request, not used)`;
}

/** The warning for numbers the analytics did not produce (RULE-25, AC-55). */
export function describeUnverifiedNumbers(numbers: readonly number[]): string | null {
  if (numbers.length === 0) return null;
  const list = numbers.map((n) => n.toLocaleString('en-US')).join(', ');
  return `Check this answer: ${numbers.length === 1 ? 'the number' : 'the numbers'} ${list} did not come from your ride analytics.`;
}

export type ChatTurnState = 'answering' | 'done' | 'cut' | 'stopped' | 'failed';

/** One question and its answer, as streamed. */
export interface ChatTurn {
  readonly id: number;
  readonly question: string;
  readonly answer: string;
  readonly tools: readonly AssistantToolUse[];
  /** Numbers that did not come from the analytics (AC-55). */
  readonly unverifiedNumbers: readonly number[];
  readonly state: ChatTurnState;
  readonly error: string | null;
}

/** One turn as the chat shows it. */
export interface ChatTurnView {
  readonly id: number;
  readonly question: string;
  readonly answer: string;
  readonly answering: boolean;
  /** `distance by month, 2019-01-01 – 2019-12-31`, … */
  readonly toolsUsed: readonly string[];
  readonly warning: string | null;
  /** E.g. `Stopped.`; null for a complete answer. */
  readonly note: string | null;
  readonly error: string | null;
}

// Implements: UX-13, AC-43, AC-52, AC-53, AC-55
export function describeTurn(turn: ChatTurn): ChatTurnView {
  const note =
    turn.state === 'stopped'
      ? 'Stopped.'
      : turn.state === 'cut'
        ? 'The answer was cut off at the length limit.'
        : null;
  return {
    id: turn.id,
    question: turn.question,
    answer: turn.answer,
    answering: turn.state === 'answering',
    toolsUsed: turn.tools.map(describeToolUse),
    warning: describeUnverifiedNumbers(turn.unverifiedNumbers),
    note,
    error: turn.error,
  };
}

/** The assistant's state in one line, with a tone (always with words, never colour alone). */
export interface StatusLine {
  readonly text: string;
  readonly tone: 'ok' | 'warning' | 'error' | 'neutral';
}

// Implements: UX-14, AC-46, RULE-26
export function describeStatus(
  status: AssistantStatus | null,
  state: 'idle' | 'loading' | 'ready' | 'failed',
): StatusLine {
  if (state === 'failed') {
    return { text: 'The app could not reach its local assistant service.', tone: 'error' };
  }
  if (!status) return { text: 'Checking the assistant…', tone: 'neutral' };
  if (status.ready) {
    return {
      text: `Ready: ${status.model ?? ''} on ${status.provider.displayName}${status.version ? ` ${status.version}` : ''}.`,
      tone: 'ok',
    };
  }
  const connected = status.reachable
    ? `Connected to ${status.provider.displayName}${status.version ? ` ${status.version}` : ''}. `
    : '';
  return {
    text: `${connected}${status.message ?? 'The assistant is not ready.'}`,
    tone: status.reachable ? 'warning' : 'error',
  };
}
