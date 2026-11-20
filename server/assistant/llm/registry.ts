import type { LLMProvider, ProviderDescriptor } from './types';

/*
 * The providers the assistant can use (BR-40, ADR-0014). This is the only module that may import
 * `llm/providers/*` (enforced by ESLint): adding a provider means one adapter and one entry here.
 */

export interface ProviderFactory {
  readonly descriptor: ProviderDescriptor;
  /** Creates the provider from its settings (keys of `descriptor.settings`). */
  create(settings: Readonly<Record<string, string>>): LLMProvider;
}

export interface ProviderRegistry {
  list(): readonly ProviderDescriptor[];
  /** The provider with its settings; missing settings take their defaults. */
  create(id: string, settings?: Readonly<Record<string, string>>): LLMProvider | null;
}

export function createProviderRegistry(factories: readonly ProviderFactory[]): ProviderRegistry {
  const byId = new Map<string, ProviderFactory>();
  for (const factory of factories) {
    if (byId.has(factory.descriptor.id)) {
      throw new Error(`Provider "${factory.descriptor.id}" is registered twice.`);
    }
    byId.set(factory.descriptor.id, factory);
  }
  return {
    list: () => factories.map((factory) => factory.descriptor),
    create(id, settings = {}) {
      const factory = byId.get(id);
      if (!factory) return null;
      const withDefaults: Record<string, string> = {};
      for (const setting of factory.descriptor.settings) {
        withDefaults[setting.key] = settings[setting.key] ?? setting.defaultValue;
      }
      return factory.create(withDefaults);
    },
  };
}

/** The application's providers. The Ollama adapter is added in phase 2 (implementation plan v2.4). */
export const DEFAULT_PROVIDER_FACTORIES: readonly ProviderFactory[] = [];
