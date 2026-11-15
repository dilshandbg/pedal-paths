import { create } from 'zustand';
import {
  BASE_MAP_STORAGE_KEY,
  browserStorage,
  HEAT_PALETTE_STORAGE_KEY,
  loadPreference,
  savePreference,
} from '@/features/heatmap/utils/baseMap';

export interface MapStyleState {
  /** The chosen base map ID, or null for the default. Resolved against the options when used. */
  readonly baseMapId: string | null;
  /** The chosen heat map palette ID, or null for the default (OD-27). */
  readonly heatPaletteId: string | null;
  setBaseMap: (id: string) => void;
  setHeatPalette: (id: string) => void;
}

/**
 * The user's map style choices (BR-32, OD-27): base map and heat map colours, remembered in this
 * browser only (their IDs, nothing else).
 */
// Implements: BR-32
export const useMapStyleStore = create<MapStyleState>()((set) => ({
  baseMapId: loadPreference(browserStorage(), BASE_MAP_STORAGE_KEY),
  heatPaletteId: loadPreference(browserStorage(), HEAT_PALETTE_STORAGE_KEY),
  setBaseMap: (id) => {
    savePreference(browserStorage(), BASE_MAP_STORAGE_KEY, id);
    set({ baseMapId: id });
  },
  setHeatPalette: (id) => {
    savePreference(browserStorage(), HEAT_PALETTE_STORAGE_KEY, id);
    set({ heatPaletteId: id });
  },
}));
