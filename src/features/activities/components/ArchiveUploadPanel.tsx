import { FileDropZone } from '@/components/common/FileDropZone';
import { Panel } from '@/components/common/Panel';
import { ImportStatusView } from '@/features/activities/components/ImportStatusView';
import { selectIsImporting, useActivitiesStore } from '@/features/activities/store/activitiesStore';

/**
 * Lets the user upload Strava export ZIPs over time; each adds its rides to the stored history
 * (BR-01, BR-16, UX-01).
 */
// Implements: AC-01, AC-15, AC-35, UX-01
export function ArchiveUploadPanel() {
  const status = useActivitiesStore((state) => state.status);
  const dataset = useActivitiesStore((state) => state.dataset);
  const history = useActivitiesStore((state) => state.history);
  const uploadCount = useActivitiesStore((state) => state.uploads.length);
  const pendingFileName = useActivitiesStore((state) => state.pendingFileName);
  const lastUpload = useActivitiesStore((state) => state.lastUpload);
  const duplicateOf = useActivitiesStore((state) => state.duplicateOf);
  const loadArchive = useActivitiesStore((state) => state.loadArchive);
  const isImporting = useActivitiesStore(selectIsImporting);

  return (
    <Panel
      title="Activity data"
      description="Your Strava export ZIPs. Rides are stored only on this computer."
    >
      <FileDropZone
        label={dataset ? 'Add another export ZIP' : 'Choose Strava export ZIP'}
        inputLabel="Strava export ZIP file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hint="Or drop the ZIP here. No need to extract it. Rides already stored are not added twice."
        disabled={isImporting}
        onFile={(file) => void loadArchive(file)}
      />
      <ImportStatusView
        status={status}
        dataset={dataset}
        history={history}
        uploadCount={uploadCount}
        pendingFileName={pendingFileName}
        lastUpload={lastUpload}
        duplicateOf={duplicateOf}
      />
    </Panel>
  );
}
