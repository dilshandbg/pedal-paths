import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ModelEvaluation,
  ModelEvaluationCase,
  ModelSuitability,
} from '../../src/types/assistant';
import { EVALUATION_SUITE_VERSION } from './evaluation';
import type { ModelInfo } from './llm/types';
import { modelKey } from './modelRules';

/*
 * Saved model evaluation results (BR-43, OD-38). A model is suitable only when its latest result
 * passed, for the same model digest and the current evaluation suite. Results are kept in
 * `data/assistant-settings.json` (git-ignored) under `evaluations`; other settings in the file are
 * kept as they are. No ride data is stored: the evaluation runs on synthetic data.
 */

/** The assistant settings file, relative to the project root. Git-ignored (`data/`). */
export const DEFAULT_ASSISTANT_SETTINGS_PATH = 'data/assistant-settings.json';

export interface StoredEvaluation extends ModelEvaluation {
  readonly provider: string;
}

export interface EvaluationStore {
  record(providerId: string, evaluation: ModelEvaluation): void;
  /** The latest result of the current suite version, or null. */
  get(providerId: string, model: string): ModelEvaluation | null;
  /** Suitable only when the latest result passed, for this digest and the current suite (BR-43). */
  suitability(providerId: string, model: ModelInfo): ModelSuitability;
}

export interface EvaluationStoreOptions {
  /** The settings file; omitted, results are kept in memory only (tests). */
  readonly path?: string;
  readonly suiteVersion?: number;
  readonly log?: (message: string) => void;
}

const isString = (v: unknown): v is string => typeof v === 'string';

function readCase(value: unknown): ModelEvaluationCase | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  if (!isString(c.id) || !isString(c.title) || typeof c.passed !== 'boolean') return null;
  if (!Array.isArray(c.problems) || !c.problems.every(isString)) return null;
  return { id: c.id, title: c.title, passed: c.passed, problems: c.problems };
}

/** A saved result, or null when it is not one (it is then dropped). */
export function readStoredEvaluation(value: unknown): StoredEvaluation | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as Record<string, unknown>;
  if (!isString(e.provider) || !isString(e.model) || !isString(e.evaluatedAt)) return null;
  if (!(e.revision === null || isString(e.revision))) return null;
  if (typeof e.suiteVersion !== 'number' || typeof e.passed !== 'boolean') return null;
  if (!Array.isArray(e.cases)) return null;
  const cases = e.cases.map(readCase);
  if (!cases.every((c): c is ModelEvaluationCase => c !== null)) return null;
  // A result is a pass only if every case passed, whatever the file says.
  return {
    provider: e.provider,
    model: e.model,
    revision: e.revision,
    suiteVersion: e.suiteVersion,
    passed: e.passed && cases.length > 0 && cases.every((c) => c.passed),
    evaluatedAt: e.evaluatedAt,
    cases,
  };
}

type SettingsFile =
  | { readonly ok: true; readonly settings: Record<string, unknown> }
  | { readonly ok: false; readonly problem: string };

function readSettingsFile(path: string): SettingsFile {
  if (!existsSync(path)) return { ok: true, settings: {} };
  try {
    const json: unknown = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return { ok: false, problem: 'it is not a JSON object' };
    }
    return { ok: true, settings: json as Record<string, unknown> };
  } catch {
    return { ok: false, problem: 'it is not valid JSON' };
  }
}

/** Writes atomically: the file always holds the old or the new settings, never part of them. */
function writeSettingsFile(path: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

// Implements: BR-43, RULE-26, AC-50
export function createEvaluationStore(options: EvaluationStoreOptions = {}): EvaluationStore {
  const suiteVersion = options.suiteVersion ?? EVALUATION_SUITE_VERSION;
  const log = options.log ?? ((message: string) => console.warn(message));
  const key = (providerId: string, model: string) => `${providerId}\u0000${modelKey(model)}`;
  const results = new Map<string, StoredEvaluation>();
  let settings: Record<string, unknown> = {};
  // A file that cannot be read is left as it is: nothing is saved over it.
  let writable = options.path !== undefined;

  if (options.path !== undefined) {
    const file = readSettingsFile(options.path);
    if (!file.ok) {
      writable = false;
      log(
        `Assistant: ${options.path} was not loaded because ${file.problem}; model test results are kept in memory only and the file is not changed.`,
      );
    } else {
      settings = file.settings;
      const saved = Array.isArray(settings.evaluations) ? settings.evaluations : [];
      for (const item of saved) {
        const evaluation = readStoredEvaluation(item);
        // Results of another suite version no longer count (OD-38).
        if (evaluation && evaluation.suiteVersion === suiteVersion) {
          results.set(key(evaluation.provider, evaluation.model), evaluation);
        }
      }
    }
  }

  const save = () => {
    if (!writable || options.path === undefined) return;
    settings = { ...settings, evaluations: [...results.values()] };
    try {
      writeSettingsFile(options.path, settings);
    } catch (error) {
      log(
        `Assistant: model test results could not be saved to ${options.path} (${(error as Error).message}).`,
      );
    }
  };

  const current = (providerId: string, model: string) => {
    const result = results.get(key(providerId, model));
    return result && result.suiteVersion === suiteVersion ? result : null;
  };

  return {
    record(providerId, evaluation) {
      results.set(key(providerId, evaluation.model), { ...evaluation, provider: providerId });
      save();
    },
    get(providerId, model) {
      const result = current(providerId, model);
      if (!result) return null;
      return {
        model: result.model,
        revision: result.revision,
        suiteVersion: result.suiteVersion,
        passed: result.passed,
        evaluatedAt: result.evaluatedAt,
        cases: result.cases,
      };
    },
    suitability(providerId, model) {
      const result = current(providerId, model.id);
      // Without a digest a changed model cannot be told apart, so it is never confirmed.
      if (!result || model.revision === null || result.revision !== model.revision) {
        return 'untested';
      }
      return result.passed ? 'suitable' : 'unsuitable';
    },
  };
}
