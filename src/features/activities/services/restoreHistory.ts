import { decodeRideHistoryPositions } from '@/features/activities/services/rideHistoryBundle';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import type { ImportStatus, RestoredHistory } from '@/types';

/*
 * Restoring the stored ride history (BR-33, AC-34, NFR-10): the job of the history worker. It is
 * kept apart from the ZIP import so its worker does not load the archive and FIT parsers.
 */

/**
 * Decodes the stored history and indexes it for the heat map (ADR-0006). Only ride summaries,
 * the index and the bounds go back to the page: copying millions of track points to the main
 * thread would take longer than everything else together (NFR-10).
 */
// Implements: BR-33, AC-34, NFR-10
export function restoreHistory(
  bundle: Uint8Array,
  onStatus?: (status: ImportStatus) => void,
): RestoredHistory {
  const { rides, skippedCount } = decodeRideHistoryPositions(bundle);
  onStatus?.({ stage: 'indexing' });
  return {
    activities: rides.map(({ gpsTrack: _track, ...summary }) => summary),
    segmentIndex: buildSegmentIndex(rides),
    bounds: computeBounds(rides),
    skippedCount,
  };
}

/**
 * The buffers of a restored history's heat map index, which can be moved to the page instead of
 * copied (structured clone would copy hundreds of thousands of entries).
 */
export function transferablesOf(history: RestoredHistory): ArrayBuffer[] {
  const index = history.segmentIndex;
  const buffers = new Set<ArrayBuffer>();
  for (const array of [
    index.cellLngLat,
    index.segmentCells,
    index.cellSegmentOffsets,
    index.cellSegments,
    ...index.activitySegments.values(),
  ]) {
    // Each array owns its whole buffer (built with `new`/`from`), so moving it moves only it.
    if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
      buffers.add(array.buffer as ArrayBuffer);
    }
  }
  return [...buffers];
}
