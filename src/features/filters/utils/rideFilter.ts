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
