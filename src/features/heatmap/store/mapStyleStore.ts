import { create } from 'zustand';
import { browserStorage, loadBaseMapId, saveBaseMapId } from '@/features/heatmap/utils/baseMap';

export interface MapStyleState {
  /** The chosen base map ID, or null for the default. Resolved against the options when used. */
  readonly baseMapId: string | null;
  setBaseMap: (id: string) => void;
}

/**
 * The user's base map choice (BR-32), remembered in this browser only. The heat map colours follow
 * the chosen map's theme; nothing else is stored.
 */
// Implements: BR-32
export const useMapStyleStore = create<MapStyleState>()((set) => ({
  baseMapId: loadBaseMapId(browserStorage()),
  setBaseMap: (id) => {
    saveBaseMapId(browserStorage(), id);
    set({ baseMapId: id });
  },
}));
