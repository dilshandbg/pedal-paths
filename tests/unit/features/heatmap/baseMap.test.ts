import { describe, expect, it } from 'vitest';
import {
  BASE_MAP_STORAGE_KEY,
  HEAT_PALETTE_STORAGE_KEY,
  loadPreference,
  type PreferenceStorage,
  resolveChoice,
  savePreference,
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

describe('BR-32: resolveChoice', () => {
  const options = getBaseMapOptions({});

  it('finds the chosen style, or falls back to the default for an unknown or missing ID', () => {
    expect(resolveChoice(options, 'dark')?.id).toBe('dark');
    expect(resolveChoice(options, 'custom')?.id).toBe('liberty');
    expect(resolveChoice(options, null)?.id).toBe('liberty');
    expect(resolveChoice([], 'dark')).toBeNull();
  });
});

describe('BR-32: remembering the choices', () => {
  it('saves and loads only the style and palette IDs', () => {
    const storage = memoryStorage();
    expect(loadPreference(storage, BASE_MAP_STORAGE_KEY)).toBeNull();
    savePreference(storage, BASE_MAP_STORAGE_KEY, 'positron');
    savePreference(storage, HEAT_PALETTE_STORAGE_KEY, 'fire');
    expect(loadPreference(storage, BASE_MAP_STORAGE_KEY)).toBe('positron');
    expect(loadPreference(storage, HEAT_PALETTE_STORAGE_KEY)).toBe('fire');
    expect([...storage.data]).toEqual([
      [BASE_MAP_STORAGE_KEY, 'positron'],
      [HEAT_PALETTE_STORAGE_KEY, 'fire'],
    ]);
  });

  it('works without storage, or when storage is blocked', () => {
    expect(loadPreference(null, BASE_MAP_STORAGE_KEY)).toBeNull();
    expect(loadPreference(failingStorage, BASE_MAP_STORAGE_KEY)).toBeNull();
    expect(() => savePreference(failingStorage, BASE_MAP_STORAGE_KEY, 'dark')).not.toThrow();
    expect(() => savePreference(null, BASE_MAP_STORAGE_KEY, 'dark')).not.toThrow();
  });
});
