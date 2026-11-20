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
