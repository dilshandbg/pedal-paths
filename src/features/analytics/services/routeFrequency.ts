import type { ActivityId, RoadFrequency } from '@/types';
import { cellCentre } from '../../../services/ride-history/rideCells';

/*
 * Most frequently ridden roads (BR-38): the pieces of road (0.001° grid cells of the location
 * index, ADR-0013 §5) used by the most distinct rides. Ties are broken by cell key, so the
 * ranking never depends on the order rows arrive in.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

export interface CellVisit {
  readonly cellKey: number;
  readonly activityId: ActivityId;
}

/**
 * Ranks cells by the number of distinct rides that used them. `rides`, when given, limits the
 * count to those rides (e.g. the ones in a date range).
 */
// Implements: BR-38, AC-42
export function rankRoadFrequency(
  visits: Iterable<CellVisit>,
  limit: number,
  rides: ReadonlySet<ActivityId> | null = null,
): RoadFrequency[] {
  const ridesPerCell = new Map<number, Set<ActivityId>>();
  for (const { cellKey, activityId } of visits) {
    if (rides && !rides.has(activityId)) continue;
    let set = ridesPerCell.get(cellKey);
    if (!set) {
      set = new Set();
      ridesPerCell.set(cellKey, set);
    }
    set.add(activityId);
  }
  return [...ridesPerCell.entries()]
    .map(([cellKey, set]) => ({ cellKey, rideCount: set.size }))
    .sort((a, b) => b.rideCount - a.rideCount || a.cellKey - b.cellKey)
    .slice(0, Math.max(0, limit))
    .map(({ cellKey, rideCount }) => ({ ...cellCentre(cellKey), rideCount }));
}
