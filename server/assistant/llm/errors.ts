/*
 * Provider-neutral failures (BR-40, NFR-12). Adapters map every provider status, error line and
 * network failure to one of these kinds; nothing outside an adapter sees a provider's own error.
 */

export const LLM_ERROR_KINDS = [
  'unavailable',
  /** The address is not, or does not resolve only to, this machine; or it redirected (RULE-27). */
  'not-local',
  'timeout',
  'cancelled',
  'model-unavailable',
  'tools-unsupported',
  'busy',
  'context-too-long',
  'invalid-response',
  'model-error',
  'bad-request',
] as const;

export type LLMErrorKind = (typeof LLM_ERROR_KINDS)[number];

export class LLMError extends Error {
  readonly kind: LLMErrorKind;

  /** `detail` is for the local server log only; it is never shown to the user as is. */
  constructor(kind: LLMErrorKind, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'LLMError';
    this.kind = kind;
  }
}

export const isLLMError = (error: unknown): error is LLMError => error instanceof LLMError;

/** The error a provider throws when its request was aborted by the caller. */
export const cancelled = () => new LLMError('cancelled');
