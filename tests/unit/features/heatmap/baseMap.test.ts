import { describe, expect, it } from 'vitest';
import {
  BASE_MAP_STORAGE_KEY,
  loadBaseMapId,
  type PreferenceStorage,
  resolveBaseMap,
  saveBaseMapId,
} from '@/features/heatmap/utils/baseMap';
import { getBaseMapOptions, OPENFREEMAP_BASE_MAPS } from '@/services/map';

const memoryStorage = (): PreferenceStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
};
const failingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('BR-32: base map options', () => {
  it('offers the colourful, light grey and dark OpenFreeMap styles, colourful first', () => {
    expect(getBaseMapOptions({}).map((o) => [o.id, o.label, o.theme])).toEqual([
      ['liberty', 'Colourful', 'light'],
      ['positron', 'Light grey', 'light'],
      ['dark', 'Dark', 'dark'],
    ]);
    for (const option of OPENFREEMAP_BASE_MAPS) {
      expect(option.url).toMatch(/^https:\/\/tiles\.openfreemap\.org\/styles\//);
    }
  });

  it('puts a configured custom style first, as the default', () => {
    const options = getBaseMapOptions({ VITE_MAP_STYLE_URL: 'https://example.org/style.json' });
    expect(options[0]).toEqual({
      id: 'custom',
      label: 'Custom',
      url: 'https://example.org/style.json',
      theme: 'light',
    });
    expect(options).toHaveLength(4);
  });
});

describe('BR-32: resolveBaseMap', () => {
  const options = getBaseMapOptions({});

  it('finds the chosen style, or falls back to the default for an unknown or missing ID', () => {
    expect(resolveBaseMap(options, 'dark')?.id).toBe('dark');
    expect(resolveBaseMap(options, 'custom')?.id).toBe('liberty');
    expect(resolveBaseMap(options, null)?.id).toBe('liberty');
    expect(resolveBaseMap([], 'dark')).toBeNull();
  });
});

describe('BR-32: remembering the base map', () => {
  it('saves and loads only the style ID', () => {
    const storage = memoryStorage();
    expect(loadBaseMapId(storage)).toBeNull();
    saveBaseMapId(storage, 'positron');
    expect(loadBaseMapId(storage)).toBe('positron');
    expect([...storage.data]).toEqual([[BASE_MAP_STORAGE_KEY, 'positron']]);
  });

  it('works without storage, or when storage is blocked', () => {
    expect(loadBaseMapId(null)).toBeNull();
    expect(loadBaseMapId(failingStorage)).toBeNull();
    expect(() => saveBaseMapId(failingStorage, 'dark')).not.toThrow();
    expect(() => saveBaseMapId(null, 'dark')).not.toThrow();
  });
});
