import type { AssistantSettings } from '../../src/types/assistant';
import { parseLocalEndpoint } from './llm/localEndpoint';
import type { ProviderRegistry } from './llm/registry';
import { checkModelName } from './modelRules';
import type { SettingsFile } from './settingsFile';

/*
 * Assistant settings (BR-41, BR-42, RULE-26, ADR-0014 §7): the provider, its local server address
 * and the selected model. Kept in the settings file under `settings`. Every value is validated when
 * it is loaded and when it is changed; an invalid saved value falls back to its default.
 */

export interface SettingsPatch {
  readonly serverUrl?: unknown;
  /** A model name, or null to clear the selection. */
  readonly model?: unknown;
}

export type SettingsUpdate =
  | { readonly ok: true; readonly settings: AssistantSettings }
  | { readonly ok: false; readonly problems: readonly string[] };

export interface SettingsStore {
  get(): AssistantSettings;
  /** Validates and saves a change. The model is only ever changed by the user (RULE-26). */
  update(patch: SettingsPatch): SettingsUpdate;
}

export interface SettingsStoreDeps {
  readonly registry: ProviderRegistry;
  readonly file: SettingsFile;
  readonly log?: (message: string) => void;
}

const SERVER_URL_KEY = 'serverUrl';

function checkServerUrl(
  value: unknown,
): { ok: true; url: string } | { ok: false; problem: string } {
  if (typeof value !== 'string') return { ok: false, problem: 'serverUrl must be a text.' };
  const checked = parseLocalEndpoint(value);
  return checked.ok ? { ok: true, url: checked.url.origin } : checked;
}

function checkModel(
  value: unknown,
): { ok: true; model: string | null } | { ok: false; problem: string } {
  if (value === null) return { ok: true, model: null };
  if (typeof value !== 'string') return { ok: false, problem: 'model must be a text or null.' };
  const checked = checkModelName(value);
  return checked.ok ? { ok: true, model: checked.name } : checked;
}

// Implements: BR-41, BR-42, RULE-26, RULE-27
export function createSettingsStore(deps: SettingsStoreDeps): SettingsStore {
  const log = deps.log ?? ((message: string) => console.warn(message));
  const descriptors = deps.registry.list();
  const provider = descriptors[0];
  if (!provider) throw new Error('No assistant provider is registered.');
  const defaultUrl =
    provider.settings.find((setting) => setting.key === SERVER_URL_KEY)?.defaultValue ?? '';

  const load = (): AssistantSettings => {
    const saved = deps.file.read().settings;
    const stored = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
    const settings: AssistantSettings = {
      provider: provider.id,
      serverUrl: defaultUrl,
      model: null,
    };
    if (stored.provider !== undefined && stored.provider !== provider.id) {
      log(`Assistant: the saved provider is not available; using ${provider.displayName}.`);
      return settings;
    }
    const url = stored.serverUrl === undefined ? null : checkServerUrl(stored.serverUrl);
    if (url && !url.ok) log(`Assistant: the saved server address was ignored (${url.problem})`);
    const model = stored.model === undefined ? null : checkModel(stored.model);
    if (model && !model.ok) log(`Assistant: the saved model was ignored (${model.problem})`);
    return {
      ...settings,
      ...(url?.ok ? { serverUrl: url.url } : {}),
      ...(model?.ok ? { model: model.model } : {}),
    };
  };

  let current = load();

  return {
    get: () => current,
    update(patch) {
      const problems: string[] = [];
      let next = current;
      if (patch.serverUrl !== undefined) {
        const url = checkServerUrl(patch.serverUrl);
        if (url.ok) next = { ...next, serverUrl: url.url };
        else problems.push(url.problem);
      }
      if (patch.model !== undefined) {
        const model = checkModel(patch.model);
        if (model.ok) next = { ...next, model: model.model };
        else problems.push(model.problem);
      }
      if (problems.length > 0) return { ok: false, problems };
      current = next;
      deps.file.update({ settings: current });
      return { ok: true, settings: current };
    },
  };
}
