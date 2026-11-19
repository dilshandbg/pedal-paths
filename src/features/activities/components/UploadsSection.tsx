import { useMemo, useState } from 'react';
import { ConfirmAction } from '@/components/common/ConfirmAction';
import { Panel } from '@/components/common/Panel';
import { UploadList, type UploadListItem } from '@/components/uploads/UploadList';
import {
  selectIsDeleting,
  selectIsImporting,
  useActivitiesStore,
} from '@/features/activities/store/activitiesStore';
import {
  DELETION_FAILURE_MESSAGES,
  describeDeletionQuestion,
  describeDeletionResult,
  describeUpload,
} from '@/features/activities/utils/describeUpload';
import { HISTORY_UNAVAILABLE_MESSAGE, pluralize } from '@/features/activities/utils/importMessages';

/**
 * The Uploads screen: every uploaded export with its registry details; delete one, several or all
 * of them after confirming (BR-34, BR-35, BR-36, NFR-09).
 */
// Implements: BR-35, AC-36, AC-37, AC-38, AC-39
export function UploadsSection() {
  const uploads = useActivitiesStore((state) => state.uploads);
  const history = useActivitiesStore((state) => state.history);
  const deletion = useActivitiesStore((state) => state.deletion);
  const deleteUploads = useActivitiesStore((state) => state.deleteUploads);
  const deleteAllUploads = useActivitiesStore((state) => state.deleteAllUploads);
  const isBusy = useActivitiesStore((state) => selectIsDeleting(state) || selectIsImporting(state));
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo<UploadListItem[]>(
    () =>
      uploads.map((upload) => ({
        ...describeUpload(upload),
        deleteQuestion: describeDeletionQuestion([upload.fileName]),
      })),
    [uploads],
  );
  // Only uploads that still exist count as selected (others may have just been deleted).
  const selectedIds = useMemo(
    () => new Set(uploads.map((u) => u.uploadId).filter((id) => chosen.has(id))),
    [uploads, chosen],
  );
  const selectedNames = uploads
    .filter((upload) => selectedIds.has(upload.uploadId))
    .map((upload) => upload.fileName);

  const remove = async (uploadIds: readonly string[]) => {
    if (await deleteUploads(uploadIds)) {
      setChosen((current) => new Set([...current].filter((id) => !uploadIds.includes(id))));
    }
  };

  return (
    <Panel
      title="Uploads"
      description="The Strava exports you uploaded. Deleting an upload removes the rides that only it contained."
    >
      {history === 'unavailable' ? (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {HISTORY_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}

      {deletion.stage === 'deleting' ? (
        <p role="status" className="text-sm text-slate-600">
          Deleting…
        </p>
      ) : deletion.stage === 'done' ? (
        <p role="status" className="text-sm text-slate-600">
          {describeDeletionResult(deletion)}
        </p>
      ) : deletion.stage === 'failed' ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {DELETION_FAILURE_MESSAGES[deletion.reason]}
        </p>
      ) : null}

      {uploads.length === 0 ? (
        history === 'loading' ? (
          <p role="status" className="text-sm text-slate-500">
            Loading your uploads…
          </p>
        ) : (
          <p className="text-sm text-slate-500">No uploads yet.</p>
        )
      ) : (
        <>
          <UploadList
            items={items}
            selectedIds={selectedIds}
            disabled={isBusy}
            onSelect={(uploadId, selected) =>
              setChosen((current) => {
                const next = new Set(current);
                if (selected) next.add(uploadId);
                else next.delete(uploadId);
                return next;
              })
            }
            onSelectAll={(selected) =>
              setChosen(selected ? new Set(uploads.map((u) => u.uploadId)) : new Set())
            }
            onDelete={(uploadId) => void remove([uploadId])}
          />
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <ConfirmAction
              label={`Delete selected (${selectedIds.size.toLocaleString('en-US')})`}
              question={describeDeletionQuestion(selectedNames)}
              confirmLabel="Delete selected"
              disabled={isBusy || selectedIds.size === 0}
              onConfirm={() => void remove([...selectedIds])}
            />
            <ConfirmAction
              label="Delete all uploads"
              question={`Delete all ${pluralize(uploads.length, 'upload')} and every stored ride from this device? This cannot be undone.`}
              confirmLabel="Delete all"
              disabled={isBusy}
              onConfirm={() => void deleteAllUploads()}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
