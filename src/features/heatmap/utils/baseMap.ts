import type { BaseMapOption } from '@/types';

/** localStorage key of the chosen base map (BR-32). Holds only the style ID, never ride data. */
export const BASE_MAP_STORAGE_KEY = 'strava-heatmap:base-map';

/** Minimal storage interface, so the browser's localStorage can be replaced in tests. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The base map to show (BR-32): the option with `id`, or the first (default) option when `id` is
 * unknown, for example a style saved by an earlier version or a removed custom style.
 */
export function resolveBaseMap(
  options: readonly BaseMapOption[],
  id: string | null,
): BaseMapOption | null {
  return options.find((option) => option.id === id) ?? options[0] ?? null;
}

/** The saved base map ID, or null when none is saved or storage is unavailable. */
export function loadBaseMapId(storage: PreferenceStorage | null): string | null {
  try {
    return storage?.getItem(BASE_MAP_STORAGE_KEY) ?? null;
  } catch {
    return null; // e.g. storage blocked in a private window
  }
}

/** Saves the chosen base map ID; a storage failure only means it is not remembered. */
export function saveBaseMapId(storage: PreferenceStorage | null, id: string): void {
  try {
    storage?.setItem(BASE_MAP_STORAGE_KEY, id);
  } catch {
    // Not remembered; the choice still applies for this visit.
  }
}

/** The browser's localStorage, or null where it is unavailable. */
export function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
