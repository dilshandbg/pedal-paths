import { hasCloudSuffix } from './llm/modelNames';
import type { ModelInfo } from './llm/types';

export { checkModelName, hasCloudSuffix, type ModelNameCheck } from './llm/modelNames';

/*
 * Which models the assistant may download and use (BR-42, BR-43, BR-44, RULE-26, RULE-27).
 */

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
