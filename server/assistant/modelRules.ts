import { modelKey } from '../../src/features/assistant/utils/modelKey';
import { hasCloudSuffix } from './llm/modelNames';
import type { ModelInfo } from './llm/types';

/*
 * Which models the assistant may download and use (BR-42, BR-43, BR-44, RULE-26, RULE-27).
 */

export { checkModelName, hasCloudSuffix, type ModelNameCheck } from './llm/modelNames';
/** `qwen3` and `qwen3:latest` are one model (the rule is shared with the screens). */
export { modelKey };

/** Whether a listed model is local: not reported as remote and without a cloud name (RULE-27). */
export const isLocalModel = (model: ModelInfo): boolean =>
  model.location === 'local' && !hasCloudSuffix(model.id);

/** Finds a listed model by name, treating an omitted tag as `latest`. */
export function findModel(models: readonly ModelInfo[], name: string): ModelInfo | undefined {
  const key = modelKey(name);
  return models.find((model) => modelKey(model.id) === key);
}
