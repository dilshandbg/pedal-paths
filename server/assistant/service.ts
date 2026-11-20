import type {
  AssistantErrorCode,
  AssistantEvent,
  AssistantModel,
  AssistantProviderInfo,
  AssistantSettings,
  AssistantStatus,
  ConnectionTestResult,
  ModelEvaluation,
  ModelRemoval,
} from '../../src/types/assistant';
import type { RideAnalytics } from '../analytics/rideAnalytics';
import { createConversationStore } from './conversations';
import { createDownloadManager, type DownloadManager } from './downloads';
import { evaluateModel } from './evaluation';
import { createEvaluationStore } from './evaluationStore';
import { cancelled, isLLMError } from './llm/errors';
import type { ProviderRegistry } from './llm/registry';
import type { LLMProvider, ModelInfo } from './llm/types';
import { ASSISTANT_MESSAGES, codeForLLMError } from './messages';
import { checkModelName, isLocalModel, modelKey } from './modelRules';
import {
  checkModel,
  createOrchestrator,
  DEFAULT_LIMITS,
  type AssistantLimits,
} from './orchestrator';
import { createSettingsStore, type SettingsPatch, type SettingsUpdate } from './settings';
import type { SettingsFile } from './settingsFile';
import type { HistorySummary } from './systemPrompt';
import { createAnalyticsTools } from './tools/analyticsTools';

/*
 * The assistant as the local API uses it (BR-39 – BR-45, ADR-0014 §7): settings, connection,
 * models, downloads, the model test and conversations, assembled from the provider-neutral core.
 * It talks to the provider only through `LLMProvider`.
 */

/** A request the assistant cannot carry out; `code` has a plain message (NFR-12). */
export class AssistantFailure extends Error {
  constructor(readonly code: AssistantErrorCode) {
    super(code);
    this.name = 'AssistantFailure';
  }
}

export interface AssistantServiceDeps {
  readonly registry: ProviderRegistry;
  readonly file: SettingsFile;
  readonly analytics: () => RideAnalytics;
  readonly history: () => HistorySummary;
  readonly timeZone: string;
  readonly clock?: () => Date;
  readonly limits?: Partial<AssistantLimits>;
  readonly log?: (message: string) => void;
}

export interface AssistantService {
  providers(): readonly AssistantProviderInfo[];
  settings(): AssistantSettings;
  updateSettings(patch: SettingsPatch): SettingsUpdate;
  status(signal: AbortSignal): Promise<AssistantStatus>;
  /** Checks a server address (already validated as local), or the saved one. */
  testConnection(serverUrl: string | null, signal: AbortSignal): Promise<ConnectionTestResult>;
  listModels(signal: AbortSignal): Promise<readonly AssistantModel[]>;
  readonly downloads: DownloadManager;
  removeModel(name: string, signal: AbortSignal): Promise<ModelRemoval>;
  testModel(name: string, signal: AbortSignal): Promise<ModelEvaluation>;
  startConversation(): string;
  endConversation(id: string): void;
  ask(id: string, question: string, signal: AbortSignal): AsyncGenerator<AssistantEvent>;
  /** Cancels running downloads, model tests and answers (the server is stopping). */
  close(): void;
}

const failureFor = (error: unknown): AssistantFailure => {
  if (error instanceof AssistantFailure) return error;
  if (isLLMError(error)) {
    return new AssistantFailure(
      error.kind === 'timeout' ? 'provider-unavailable' : codeForLLMError(error.kind),
    );
  }
  return new AssistantFailure('internal');
};

// Implements: BR-39, BR-41, BR-42, BR-43, RULE-26, AC-46, AC-47, AC-49, AC-50
export function createAssistantService(deps: AssistantServiceDeps): AssistantService {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const log = deps.log ?? ((message: string) => console.warn(message));
  const settings = createSettingsStore({ registry: deps.registry, file: deps.file, log });
  const evaluations = createEvaluationStore({ file: deps.file });
  const running = new Set<AbortController>();
  const testing = new Set<string>();

  /** One provider instance per provider and address, so its caches survive between requests. */
  let cached: { key: string; provider: LLMProvider } | null = null;
  const providerFor = (serverUrl: string): LLMProvider => {
    const { provider: id } = settings.get();
    const key = `${id} ${serverUrl}`;
    if (cached?.key !== key) {
      const provider = deps.registry.create(id, { serverUrl });
      if (!provider) throw new AssistantFailure('internal');
      cached = { key, provider };
    }
    return cached.provider;
  };
  const provider = () => providerFor(settings.get().serverUrl);

  const downloads = createDownloadManager({
    manager: () => provider().models ?? null,
    log,
    ...(deps.clock ? { clock: deps.clock } : {}),
  });

  const orchestrator = createOrchestrator({
    tools: createAnalyticsTools(
      {
        // The analytics are opened on first use, like the other APIs.
        distanceByMonth: (range) => deps.analytics().distanceByMonth(range),
        distanceByYear: (range) => deps.analytics().distanceByYear(range),
        locationVisits: (query) => deps.analytics().locationVisits(query),
        routeFrequency: (query) => deps.analytics().routeFrequency(query),
        comparePeriods: (query) => deps.analytics().comparePeriods(query),
      },
      { timeZone: deps.timeZone },
    ),
    conversations: createConversationStore(),
    target: () => {
      const { model } = settings.get();
      return model ? { provider: provider(), model } : null;
    },
    suitability: (providerId, model) => evaluations.suitability(providerId, model),
    history: deps.history,
    timeZone: deps.timeZone,
    limits,
    log,
    ...(deps.clock ? { clock: deps.clock } : {}),
  });

  /** Runs a provider request bounded by the connection-check limit (OD-37). */
  const quick = async <T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>) => {
    const timeout = AbortSignal.timeout(limits.connectionCheckMs);
    try {
      return await run(AbortSignal.any([signal, timeout]));
    } catch (error) {
      if (signal.aborted) throw cancelled();
      if (timeout.aborted) throw new AssistantFailure('provider-unavailable');
      throw failureFor(error);
    }
  };

  /** Tracks a long request so `close` can cancel it. */
  const tracked = async <T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController();
    running.add(controller);
    try {
      return await run(AbortSignal.any([signal, controller.signal]));
    } finally {
      running.delete(controller);
    }
  };

  const describe = (model: ModelInfo): AssistantModel => {
    const providerId = settings.get().provider;
    const selected = settings.get().model;
    return {
      id: model.id,
      sizeBytes: model.sizeBytes,
      parameterSize: model.parameterSize,
      quantization: model.quantization,
      contextWindow: model.contextWindow,
      toolCalling: model.capabilities.toolCalling,
      streaming: model.capabilities.streaming,
      structuredOutput: model.capabilities.structuredOutput,
      otherCapabilities: model.capabilities.other,
      local: isLocalModel(model),
      selected: selected !== null && modelKey(selected) === modelKey(model.id),
      suitability: evaluations.suitability(providerId, model),
      evaluation: evaluations.get(providerId, model.id),
      testing: testing.has(modelKey(model.id)),
    };
  };

  return {
    providers: () =>
      deps.registry.list().map((d) => ({
        id: d.id,
        displayName: d.displayName,
        settings: d.settings,
        modelLibrary: d.modelLibrary ?? null,
      })),
    settings: () => settings.get(),
    updateSettings: (patch) => settings.update(patch),

    async status(signal) {
      const current = settings.get();
      const info = deps.registry.list().find((d) => d.id === current.provider);
      const base = {
        provider: {
          id: current.provider,
          displayName: info?.displayName ?? current.provider,
          settings: info?.settings ?? [],
          modelLibrary: info?.modelLibrary ?? null,
        },
        serverUrl: current.serverUrl,
        model: current.model,
      };
      const notReady = (code: AssistantErrorCode, reachable: boolean, version: string | null) => ({
        ...base,
        reachable,
        version,
        ready: false,
        problem: code,
        message: ASSISTANT_MESSAGES[code],
      });
      let version: string | null;
      try {
        version = (await quick(signal, (s) => provider().checkConnection(s))).version;
      } catch (error) {
        if (signal.aborted) throw error;
        return notReady(failureFor(error).code, false, null);
      }
      if (!current.model) return notReady('no-model-selected', true, version);
      const check = await checkModel(provider(), current.model, limits, signal);
      if (!check.ok) return notReady(check.code, true, version);
      const suitability = evaluations.suitability(current.provider, check.model);
      if (suitability !== 'suitable') {
        return notReady(
          suitability === 'untested' ? 'model-not-evaluated' : 'model-failed-evaluation',
          true,
          version,
        );
      }
      return { ...base, reachable: true, version, ready: true, problem: null, message: null };
    },

    async testConnection(serverUrl, signal) {
      try {
        const target = serverUrl === null ? provider() : providerFor(serverUrl);
        const { version } = await quick(signal, (s) => target.checkConnection(s));
        return { reachable: true, version, problem: null, message: null };
      } catch (error) {
        if (signal.aborted) throw error;
        const { code } = failureFor(error);
        return {
          reachable: false,
          version: null,
          problem: code,
          message: ASSISTANT_MESSAGES[code],
        };
      }
    },

    async listModels(signal) {
      try {
        return (await provider().listModels(signal)).map(describe);
      } catch (error) {
        if (signal.aborted) throw cancelled();
        throw failureFor(error);
      }
    },

    downloads,

    async removeModel(name, signal) {
      const checked = checkModelName(name);
      if (!checked.ok) throw new AssistantFailure('model-not-installed');
      const manager = provider().models;
      if (!manager) throw new AssistantFailure('internal');
      try {
        await manager.remove(checked.name, signal);
      } catch (error) {
        if (signal.aborted) throw cancelled();
        throw failureFor(error);
      }
      const selected = settings.get().model;
      const selectionCleared = selected !== null && modelKey(selected) === modelKey(checked.name);
      // The user removed the model; the app tells them the selection is gone (AC-49).
      if (selectionCleared) settings.update({ model: null });
      return { model: checked.name, selectionCleared };
    },

    async testModel(name, signal) {
      const checked = checkModelName(name);
      if (!checked.ok) throw new AssistantFailure('model-not-installed');
      const key = modelKey(checked.name);
      if (testing.has(key)) throw new AssistantFailure('model-test-running');
      testing.add(key);
      try {
        const outcome = await tracked(signal, (s) =>
          evaluateModel({
            provider: provider(),
            model: checked.name,
            signal: s,
            limits,
            ...(deps.clock ? { clock: deps.clock } : {}),
          }),
        );
        if (!outcome.ok) {
          if (outcome.code === 'cancelled') throw cancelled();
          throw new AssistantFailure(outcome.code);
        }
        evaluations.record(settings.get().provider, outcome.evaluation);
        return outcome.evaluation;
      } finally {
        testing.delete(key);
      }
    },

    startConversation: () => orchestrator.startConversation(),
    endConversation: (id) => orchestrator.endConversation(id),
    async *ask(id, question, signal) {
      const controller = new AbortController();
      running.add(controller);
      try {
        yield* orchestrator.ask(id, question, AbortSignal.any([signal, controller.signal]));
      } finally {
        running.delete(controller);
      }
    },

    close() {
      for (const download of downloads.list()) downloads.cancel(download.model);
      for (const controller of running) controller.abort();
    },
  };
}
