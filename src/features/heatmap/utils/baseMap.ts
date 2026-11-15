/** localStorage key of the chosen base map (BR-32). Holds only the style ID, never ride data. */
export const BASE_MAP_STORAGE_KEY = 'strava-heatmap:base-map';
/** localStorage key of the chosen heat map colours (OD-27). Holds only the palette ID. */
export const HEAT_PALETTE_STORAGE_KEY = 'strava-heatmap:heat-palette';

/** Minimal storage interface, so the browser's localStorage can be replaced in tests. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The chosen option (a base map, BR-32, or heat palette, OD-27): the one with `id`, or the first
 * (default) option when `id` is unknown, e.g. saved by an earlier version or no longer offered.
 */
export function resolveChoice<T extends { readonly id: string }>(
  options: readonly T[],
  id: string | null,
): T | null {
  return options.find((option) => option.id === id) ?? options[0] ?? null;
}

/** The saved value under `key`, or null when none is saved or storage is unavailable. */
export function loadPreference(storage: PreferenceStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null; // e.g. storage blocked in a private window
  }
}

/** Saves a choice; a storage failure only means it is not remembered. */
export function savePreference(storage: PreferenceStorage | null, key: string, id: string): void {
  try {
    storage?.setItem(key, id);
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
