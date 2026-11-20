/*
 * Model names (BR-42, RULE-27). In `llm/` so that adapters may use them too; `modelRules.ts`
 * re-exports them for the rest of the assistant.
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
