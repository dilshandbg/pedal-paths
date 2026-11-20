/*
 * What the local assistant (BRD v2.4, ADR-0014) reports to the browser. Provider-neutral: the
 * chat screen never sees which provider or model format produced an answer.
 */

/** Why a question could not be answered. Each has a plain message (NFR-12). */
export type AssistantErrorCode =
  | 'no-model-selected'
  | 'provider-unavailable'
  | 'not-local'
  | 'model-not-installed'
  | 'model-remote'
  | 'model-no-tools'
  | 'model-not-evaluated'
  | 'model-failed-evaluation'
  | 'timeout'
  | 'busy'
  | 'context-too-long'
  | 'invalid-response'
  | 'model-error'
  | 'round-limit'
  | 'conversation-not-found'
  | 'conversation-busy'
  | 'model-test-running'
  | 'internal';

/** One analytics call behind an answer ("Used: distance by month, 2024-01-01 – 2024-12-31"). */
export interface AssistantToolUse {
  readonly name: string;
  /** E.g. `distance by month`. */
  readonly label: string;
  /** The model's arguments as the user would read them, e.g. `2024-01-01 – 2024-12-31`. */
  readonly summary: string;
  readonly arguments: unknown;
  /** False when the arguments were invalid or the tool is unknown. */
  readonly ok: boolean;
}

export type AssistantDoneReason = 'stop' | 'length' | 'cancelled';

/** The stream of one answer: text and tool uses in order, then `done` or `error`. */
export type AssistantEvent =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'tool'; readonly use: AssistantToolUse }
  /**
   * Numbers in the answer that cannot be traced to the question or an analytics result (RULE-25,
   * AC-55). Sent once, just before `done`, only when there are any; the screen shows a warning.
   */
  | { readonly type: 'unverified-numbers'; readonly numbers: readonly number[] }
  | { readonly type: 'done'; readonly reason: AssistantDoneReason }
  | { readonly type: 'error'; readonly code: AssistantErrorCode; readonly message: string };

/** The outcome of one model evaluation case (BR-43). */
export interface ModelEvaluationCase {
  readonly id: string;
  readonly title: string;
  readonly passed: boolean;
  /** What went wrong, in plain words; empty when passed. */
  readonly problems: readonly string[];
}

export interface ModelEvaluation {
  readonly model: string;
  /** The model revision (e.g. digest) the result belongs to. */
  readonly revision: string | null;
  /** The evaluation suite version; a result of another version no longer counts (OD-38). */
  readonly suiteVersion: number;
  /** True only when every required case passed: only then is the model suitable. */
  readonly passed: boolean;
  /** ISO 8601. */
  readonly evaluatedAt: string;
  readonly cases: readonly ModelEvaluationCase[];
}

export type ModelSuitability = 'suitable' | 'unsuitable' | 'untested';

export type DownloadStatus = 'downloading' | 'completed' | 'cancelled' | 'failed';

export interface ModelDownload {
  readonly model: string;
  readonly status: DownloadStatus;
  /** The provider's latest status text, e.g. `pulling manifest`. */
  readonly detail: string | null;
  readonly completedBytes: number | null;
  readonly totalBytes: number | null;
  readonly error: AssistantErrorCode | null;
  /** ISO 8601. */
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/** The assistant settings (BR-41, BR-42). The model is only ever changed by the user (RULE-26). */
export interface AssistantSettings {
  readonly provider: string;
  /** The provider's server on this computer, e.g. `http://127.0.0.1:11434`. */
  readonly serverUrl: string;
  readonly model: string | null;
}

/** A setting a provider needs, as the settings screen shows it. */
export interface AssistantProviderSetting {
  readonly key: string;
  readonly label: string;
  readonly kind: 'local-url';
  readonly defaultValue: string;
  readonly help: string;
}

export interface AssistantProviderInfo {
  readonly id: string;
  readonly displayName: string;
  readonly settings: readonly AssistantProviderSetting[];
}

/** Whether a question can be asked now (RULE-26), and if not, why. */
export interface AssistantStatus {
  readonly provider: AssistantProviderInfo;
  readonly serverUrl: string;
  readonly reachable: boolean;
  readonly version: string | null;
  readonly model: string | null;
  readonly ready: boolean;
  /** Why no question can be asked; null when ready. */
  readonly problem: AssistantErrorCode | null;
  readonly message: string | null;
}

export interface ConnectionTestResult {
  readonly reachable: boolean;
  readonly version: string | null;
  readonly problem: AssistantErrorCode | null;
  readonly message: string | null;
}

/** An installed model as the settings list shows it (AC-47, AC-50, AC-51). */
export interface AssistantModel {
  readonly id: string;
  readonly sizeBytes: number | null;
  readonly parameterSize: string | null;
  readonly quantization: string | null;
  /** In tokens. */
  readonly contextWindow: number | null;
  readonly toolCalling: boolean | 'unknown';
  readonly streaming: boolean | 'unknown';
  readonly structuredOutput: boolean | 'unknown';
  readonly otherCapabilities: readonly string[];
  /** False for a cloud model: listed as not used, and never selected or tested (RULE-27). */
  readonly local: boolean;
  readonly selected: boolean;
  readonly suitability: ModelSuitability;
  /** The latest valid test result (this digest and test suite), or null. */
  readonly evaluation: ModelEvaluation | null;
  readonly testing: boolean;
}

/** The result of removing a model (AC-49). */
export interface ModelRemoval {
  readonly model: string;
  /** True when the removed model was selected: the selection is cleared and the user told. */
  readonly selectionCleared: boolean;
}
