import { useEffect, useMemo } from 'react';
import { useSegmentsStore } from '@/features/segments/store/segmentsStore';
import { buildSegmentOverlay, segmentBounds } from '@/features/segments/utils/segmentOverlay';
import type { GeoBounds, SegmentOverlayData } from '@/types';

export interface SegmentMapState {
  /** Routes to draw, or null when segments are hidden or none are stored. */
  readonly overlay: SegmentOverlayData | null;
  /** Bounds of the selected segment, to bring it into view; null when nothing is selected. */
  readonly focusBounds: GeoBounds | null;
  readonly selectSegment: (segmentId: string) => void;
}

/**
 * Loads the stored segments on start-up and derives the map's segment overlay from them and the
 * selection (BR-26). Only segment state is read: heat map filters never change it (RULE-18,
 * AC-27).
 */
// Implements: BR-26, AC-23, AC-27
export function useSegmentOverlay(): SegmentMapState {
  // Stored segments are loaded once at start-up, so their routes show without opening the tab.
  useEffect(() => {
    const { storage, loadSegments } = useSegmentsStore.getState();
    if (storage === 'idle') void loadSegments();
  }, []);

  const segments = useSegmentsStore((state) => state.segments);
  const showOnMap = useSegmentsStore((state) => state.showOnMap);
  const selectedSegmentId = useSegmentsStore((state) => state.selectedSegmentId);
  const selectSegment = useSegmentsStore((state) => state.selectSegment);

  const overlay = useMemo(
    () =>
      showOnMap && segments.length > 0 ? buildSegmentOverlay(segments, selectedSegmentId) : null,
    [segments, showOnMap, selectedSegmentId],
  );
  const selected = useMemo(
    () => segments.find((segment) => segment.segmentId === selectedSegmentId) ?? null,
    [segments, selectedSegmentId],
  );
  const focusBounds = useMemo(() => (selected ? segmentBounds(selected) : null), [selected]);

  return {
    overlay,
    focusBounds,
    selectSegment: (segmentId) => void selectSegment(segmentId),
  };
}
