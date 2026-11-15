import type { BaseMapOption } from '@/types';

/** Free OpenStreetMap-based vector style, no API key needed (ADR-0008). */
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface MapEnv {
  readonly VITE_MAP_STYLE_URL?: string | undefined;
}

/**
 * Returns the MapLibre style URL: `VITE_MAP_STYLE_URL` if it is a valid http(s) URL, otherwise the
 * default style. `env` is injectable so the function can be unit tested.
 */
export function getMapStyleUrl(env: MapEnv = import.meta.env): string {
  const configured = env.VITE_MAP_STYLE_URL?.trim();
  if (!configured) {
    return DEFAULT_MAP_STYLE_URL;
  }

  try {
    const { protocol } = new URL(configured);
    return protocol === 'https:' || protocol === 'http:' ? configured : DEFAULT_MAP_STYLE_URL;
  } catch {
    return DEFAULT_MAP_STYLE_URL;
  }
}

/** The free OpenFreeMap styles the user can choose between (BR-32, ADR-0008). No key needed. */
export const OPENFREEMAP_BASE_MAPS: readonly BaseMapOption[] = [
  { id: 'liberty', label: 'Colourful', url: DEFAULT_MAP_STYLE_URL, theme: 'light' },
  {
    id: 'positron',
    label: 'Light grey',
    url: 'https://tiles.openfreemap.org/styles/positron',
    theme: 'light',
  },
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark', theme: 'dark' },
];

/**
 * Base maps to offer (BR-32): a valid `VITE_MAP_STYLE_URL` comes first as "Custom" (assumed light),
 * followed by the OpenFreeMap styles. The first entry is the default.
 */
export function getBaseMapOptions(env: MapEnv = import.meta.env): readonly BaseMapOption[] {
  const url = getMapStyleUrl(env);
  return url === DEFAULT_MAP_STYLE_URL
    ? OPENFREEMAP_BASE_MAPS
    : [{ id: 'custom', label: 'Custom', url, theme: 'light' }, ...OPENFREEMAP_BASE_MAPS];
}
