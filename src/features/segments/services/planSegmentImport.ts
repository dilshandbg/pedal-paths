import type {
  SegmentImportPayload,
  SegmentImportPlan,
  SegmentImportPlanItem,
  SegmentImportStatus,
  SegmentRecord,
} from '@/types';
import { changedFields, effortKey, mergeSegment } from './segmentRules';

/** What is already stored for one segment, as far as planning an import needs to know. */
export interface StoredSegmentState {
  readonly record: SegmentRecord;
  readonly effortKeys: ReadonlySet<string>;
}

/**
 * Classifies a validated import against what is stored (BR-22, BR-24, AC-22, AC-24): each segment
 * is new, an update (it changes stored fields or adds efforts) or unchanged. Efforts already stored,
 * or repeated within the file, are not counted as new. Pure: the same function decides the review
 * and the actual write.
 */
// Implements: BR-22, BR-24, RULE-16
export function planSegmentImport(
  stored: ReadonlyMap<string, StoredSegmentState>,
  payload: SegmentImportPayload,
): SegmentImportPlan {
  const newEfforts = new Map<string, Set<string>>();
  for (const effort of payload.efforts) {
    const known = stored.get(effort.segmentId)?.effortKeys;
    const key = effortKey(effort);
    if (known?.has(key)) continue;
    const keys = newEfforts.get(effort.segmentId) ?? new Set<string>();
    keys.add(key);
    newEfforts.set(effort.segmentId, keys);
  }

  const items: SegmentImportPlanItem[] = [];
  const planned = new Set<string>();
  for (const incoming of payload.segments) {
    const existing = stored.get(incoming.segmentId)?.record ?? null;
    const changed = existing ? changedFields(existing, mergeSegment(existing, incoming)) : [];
    const added = newEfforts.get(incoming.segmentId)?.size ?? 0;
    items.push(
      item(
        incoming,
        existing ? (changed.length > 0 || added > 0 ? 'update' : 'unchanged') : 'new',
        changed,
        added,
      ),
    );
    planned.add(incoming.segmentId);
  }
  // An efforts-only import (e.g. an efforts CSV) updates stored segments.
  for (const [segmentId, keys] of newEfforts) {
    const existing = stored.get(segmentId)?.record;
    if (planned.has(segmentId) || !existing) continue;
    items.push(item(existing, 'update', [], keys.size));
    planned.add(segmentId);
  }
  for (const effort of payload.efforts) {
    const existing = stored.get(effort.segmentId)?.record;
    if (planned.has(effort.segmentId) || !existing) continue;
    items.push(item(existing, 'unchanged', [], 0));
    planned.add(effort.segmentId);
  }

  const counts: Record<SegmentImportStatus, number> = { new: 0, update: 0, unchanged: 0 };
  let newEffortCount = 0;
  for (const entry of items) {
    counts[entry.status] += 1;
    newEffortCount += entry.newEffortCount;
  }
  return { items, counts, newEffortCount };
}

function item(
  segment: SegmentRecord,
  status: SegmentImportStatus,
  changed: readonly string[],
  newEffortCount: number,
): SegmentImportPlanItem {
  return {
    segmentId: segment.segmentId,
    name: segment.name,
    distanceM: segment.distanceM,
    elevationGainM: segment.elevationGainM,
    status,
    changedFields: changed,
    newEffortCount,
  };
}
