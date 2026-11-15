import { useEffect, useMemo, useState } from 'react';
import { ConfirmAction } from '@/components/common/ConfirmAction';
import { FileDropZone } from '@/components/common/FileDropZone';
import { Panel } from '@/components/common/Panel';
import { SegmentBrowser } from '@/components/segments/SegmentBrowser';
import { SegmentDetails } from '@/components/segments/SegmentDetails';
import { SegmentImportProblems } from '@/components/segments/SegmentImportProblems';
import { SegmentImportReview } from '@/components/segments/SegmentImportReview';
import { selectIsImportBusy, useSegmentsStore } from '@/features/segments/store/segmentsStore';
import {
  browseSegments,
  parseDistanceInput,
  SEGMENT_SORT_LABELS,
  SEGMENT_SORTS,
  type SegmentSort,
} from '@/features/segments/utils/browseSegments';
import {
  describeImportReview,
  describeSegmentDetail,
  describeSegmentListItem,
} from '@/features/segments/utils/describeSegment';
import {
  describeImportPlan,
  describeImportResult,
  describeSegmentApiError,
  SEGMENT_FILE_ACCEPT,
} from '@/features/segments/utils/segmentMessages';

const SORT_OPTIONS = SEGMENT_SORTS.map((value) => ({ value, label: SEGMENT_SORT_LABELS[value] }));

/**
 * The Segments section (BR-20 – BR-27): import a segment file with validation and review, browse
 * the stored segments, inspect one, show them on the map and remove them. Segment data never
 * touches the ride heat map or statistics (RULE-18).
 */
// Implements: BR-20, BR-22, BR-25, BR-27, AC-20, AC-22, AC-25, AC-26, AC-28
export function SegmentsSection() {
  const segments = useSegmentsStore((state) => state.segments);
  const storage = useSegmentsStore((state) => state.storage);
  const importState = useSegmentsStore((state) => state.importState);
  const isBusy = useSegmentsStore(selectIsImportBusy);
  const selectedSegmentId = useSegmentsStore((state) => state.selectedSegmentId);
  const detail = useSegmentsStore((state) => state.detail);
  const detailStatus = useSegmentsStore((state) => state.detailStatus);
  const showOnMap = useSegmentsStore((state) => state.showOnMap);
  const actionError = useSegmentsStore((state) => state.actionError);
  const {
    loadSegments,
    chooseFile,
    confirmImport,
    cancelImport,
    selectSegment,
    removeSegment,
    removeAllSegments,
    setShowOnMap,
  } = useSegmentsStore.getState();

  const [query, setQuery] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [sort, setSort] = useState<SegmentSort>('name');

  useEffect(() => {
    if (useSegmentsStore.getState().storage === 'idle') {
      void loadSegments();
    }
  }, [loadSegments]);

  const items = useMemo(
    () =>
      browseSegments(segments, {
        query,
        minDistanceKm: parseDistanceInput(minText),
        maxDistanceKm: parseDistanceInput(maxText),
        sort,
      }).map(describeSegmentListItem),
    [segments, query, minText, maxText, sort],
  );
  const detailView = useMemo(() => (detail ? describeSegmentDetail(detail) : null), [detail]);

  const unavailable = storage === 'unavailable';

  return (
    <Panel
      title="Segments"
      description="Segment details from a JSON, GeoJSON or CSV file you prepared. Stored only on this device."
    >
      {unavailable ? (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {describeSegmentApiError('storage-unavailable')}
        </p>
      ) : null}

      <FileDropZone
        label="Choose segment file"
        inputLabel="Segment file (JSON, GeoJSON or CSV)"
        accept={SEGMENT_FILE_ACCEPT}
        hint="Or drop the file here. You review it before anything is stored."
        disabled={isBusy || unavailable || importState.stage === 'review'}
        onFile={(file) => void chooseFile(file)}
      />

      {importState.stage === 'reading' ? (
        <p role="status" className="text-sm text-slate-600">
          Checking {importState.fileName}…
        </p>
      ) : importState.stage === 'invalid' ? (
        <SegmentImportProblems
          fileName={importState.fileName}
          problems={importState.problems}
          onDismiss={cancelImport}
        />
      ) : importState.stage === 'review' || importState.stage === 'saving' ? (
        <SegmentImportReview
          fileName={importState.fileName}
          summary={describeImportPlan(importState.plan)}
          rows={describeImportReview(importState.plan)}
          saving={importState.stage === 'saving'}
          onConfirm={() => void confirmImport()}
          onCancel={cancelImport}
        />
      ) : importState.stage === 'done' ? (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          <span>
            {importState.fileName}: {describeImportResult(importState.plan)}
          </span>
          <button type="button" onClick={cancelImport} className="text-xs underline">
            Dismiss
          </button>
        </div>
      ) : importState.stage === 'failed' ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          <span>
            {importState.fileName} was not imported. {importState.message}
          </span>
          <button type="button" onClick={cancelImport} className="text-xs underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {segments.length > 0 ? (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-4 accent-sky-600"
            checked={showOnMap}
            onChange={(event) => setShowOnMap(event.target.checked)}
          />
          Show segments on the map
        </label>
      ) : null}

      {selectedSegmentId !== null ? (
        <SegmentDetails
          view={detailView}
          status={detailStatus === 'idle' ? 'loading' : detailStatus}
          onBack={() => void selectSegment(null)}
          onRemove={(segmentId) => void removeSegment(segmentId)}
        />
      ) : segments.length > 0 ? (
        <>
          <SegmentBrowser
            query={query}
            minDistanceKm={minText}
            maxDistanceKm={maxText}
            sort={sort}
            sortOptions={SORT_OPTIONS}
            items={items}
            totalCount={segments.length}
            onQueryChange={setQuery}
            onMinDistanceChange={setMinText}
            onMaxDistanceChange={setMaxText}
            onSortChange={setSort}
            onSelect={(segmentId) => void selectSegment(segmentId)}
          />
          <ConfirmAction
            label="Remove all segment data"
            question={`Remove all ${segments.length.toLocaleString('en-US')} segments and their efforts from this device?`}
            confirmLabel="Remove all"
            onConfirm={() => void removeAllSegments()}
          />
        </>
      ) : storage === 'ready' ? (
        <p className="text-sm text-slate-500">No segments imported yet.</p>
      ) : storage === 'loading' ? (
        <p role="status" className="text-sm text-slate-500">
          Loading segments…
        </p>
      ) : null}
    </Panel>
  );
}
