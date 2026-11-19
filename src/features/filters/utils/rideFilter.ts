import type { ActivityId } from '@/types';

/**
 * New exclusion list with one ride selected (`included = true`) or deselected (BR-09). Never
 * mutates the input, and returns it unchanged when the ride is already in the requested state.
 */
export function setRideIncluded(
  excludedActivityIds: readonly ActivityId[],
  activityId: ActivityId,
  included: boolean,
): readonly ActivityId[] {
  const isExcluded = excludedActivityIds.includes(activityId);
  if (included) {
    return isExcluded ? excludedActivityIds.filter((id) => id !== activityId) : excludedActivityIds;
  }
  return isExcluded ? excludedActivityIds : [...excludedActivityIds, activityId];
}

/**
 * The exclusion list without rides that no longer exist, e.g. after their upload was deleted
 * (BR-36, ADR-0013 §4). Returns the input itself when nothing was removed, so callers can skip an
 * update.
 */
export function withoutRemovedRides(
  excludedActivityIds: readonly ActivityId[],
  existingActivityIds: ReadonlySet<ActivityId>,
): readonly ActivityId[] {
  const kept = excludedActivityIds.filter((id) => existingActivityIds.has(id));
  return kept.length === excludedActivityIds.length ? excludedActivityIds : kept;
}
