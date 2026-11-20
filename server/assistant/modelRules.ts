import type { ModelInfo } from './llm/types';

/*
 * Which models the assistant may download and use (BR-42, BR-43, BR-44, RULE-26, RULE-27).
 */

/** `name[:tag]`, optionally with namespace segments (`library/qwen3:8b`). */
const MODEL_NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*(:[a-z0-9][a-z0-9._-]*)?$/;
const MAX_MODEL_NAME_LENGTH = 128;

/** A name of a model that runs in a cloud service, not on this machine (RULE-27). */
export function hasCloudSuffix(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(':cloud') || lower.endsWith('-cloud');
}

export type ModelNameCheck =
  { readonly ok: true; readonly name: string } | { readonly ok: false; readonly problem: string };

/** Checks a model name typed by the user before it is downloaded. */
export function checkModelName(raw: string): ModelNameCheck {
  const name = raw.trim().toLowerCase();
  if (name === '') return { ok: false, problem: 'Enter a model name, e.g. qwen3:8b.' };
  if (name.length > MAX_MODEL_NAME_LENGTH || !MODEL_NAME.test(name)) {
    return { ok: false, problem: 'That is not a valid model name, e.g. qwen3:8b.' };
  }
  if (hasCloudSuffix(name)) {
    return { ok: false, problem: 'Cloud models run outside this computer and are not used.' };
  }
  return { ok: true, name };
}

/** The key two names of the same model share: `qwen3` and `qwen3:latest` are one model. */
export function modelKey(name: string): string {
  const lower = name.trim().toLowerCase();
  const lastSegment = lower.slice(lower.lastIndexOf('/') + 1);
  return lastSegment.includes(':') ? lower : `${lower}:latest`;
}

/** Whether a listed model is local: not reported as remote and without a cloud name (RULE-27). */
export const isLocalModel = (model: ModelInfo): boolean =>
  model.location === 'local' && !hasCloudSuffix(model.id);

/** Finds a listed model by name, treating an omitted tag as `latest`. */
export function findModel(models: readonly ModelInfo[], name: string): ModelInfo | undefined {
  const key = modelKey(name);
  return models.find((model) => modelKey(model.id) === key);
}
