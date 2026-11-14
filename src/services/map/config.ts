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
