// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createProviderRegistry } from '../../../server/assistant/llm/registry';
import {
  checkModelName,
  findModel,
  hasCloudSuffix,
  isLocalModel,
  modelKey,
} from '../../../server/assistant/modelRules';
import { createFakeProvider, fakeModel } from './fakeProvider';

describe('RULE-27: cloud models are never used', () => {
  it.each(['gpt-oss:120b-cloud', 'gemma4:cloud', 'QWEN3:CLOUD'])('%s is a cloud model', (name) =>
    expect(hasCloudSuffix(name)).toBe(true),
  );
  it.each(['qwen3:8b', 'cloudy-model:1b', 'llama3.2'])('%s is not', (name) =>
    expect(hasCloudSuffix(name)).toBe(false),
  );

  it('treats a model reported as remote, or with a cloud name, as not local', () => {
    expect(isLocalModel(fakeModel('qwen3:8b'))).toBe(true);
    expect(isLocalModel(fakeModel('qwen3:8b', { location: 'remote' }))).toBe(false);
    expect(isLocalModel(fakeModel('gpt-oss:120b-cloud'))).toBe(false);
  });
});

describe('BR-42: model names', () => {
  it.each(['qwen3:8b', 'llama3.2', 'library/qwen3:8b', 'hf.co/user/model:q4_k_m', '  Qwen3:8B  '])(
    'accepts %s',
    (name) => {
      expect(checkModelName(name).ok).toBe(true);
    },
  );

  it.each(['', ' ', 'qwen3:', ':8b', 'qwen3:8b:1', 'a b', '../etc', 'qwen3;8b', 'x'.repeat(129)])(
    'rejects %j',
    (name) => {
      expect(checkModelName(name).ok).toBe(false);
    },
  );

  it('treats an omitted tag as latest', () => {
    expect(modelKey('qwen3')).toBe('qwen3:latest');
    expect(modelKey('library/qwen3')).toBe('library/qwen3:latest');
    expect(modelKey('Qwen3:8B')).toBe('qwen3:8b');
    expect(findModel([fakeModel('qwen3:latest')], 'qwen3')?.id).toBe('qwen3:latest');
    expect(findModel([fakeModel('qwen3:8b')], 'qwen3')).toBeUndefined();
  });
});

describe('BR-40: provider registry', () => {
  const factory = (id: string) => ({
    descriptor: {
      id,
      displayName: id,
      location: 'local' as const,
      settings: [
        {
          key: 'serverUrl',
          label: 'Address',
          kind: 'local-url' as const,
          defaultValue: 'http://127.0.0.1:1',
          help: '',
        },
      ],
    },
    create: (settings: Readonly<Record<string, string>>) => ({
      ...createFakeProvider({ id }),
      settings,
    }),
  });

  it('lists providers and creates them with their default settings', () => {
    const registry = createProviderRegistry([factory('a'), factory('b')]);
    expect(registry.list().map((d) => d.id)).toEqual(['a', 'b']);
    expect(registry.create('a')).toMatchObject({ settings: { serverUrl: 'http://127.0.0.1:1' } });
    expect(registry.create('a', { serverUrl: 'http://127.0.0.1:2', ignored: 'x' })).toMatchObject({
      settings: { serverUrl: 'http://127.0.0.1:2' },
    });
    expect(registry.create('missing')).toBeNull();
  });

  it('refuses two providers with the same id', () => {
    expect(() => createProviderRegistry([factory('a'), factory('a')])).toThrow(/registered twice/);
  });
});
