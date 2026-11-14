/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional MapLibre style URL; defaults to OpenFreeMap (ADR-0008). */
  readonly VITE_MAP_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
