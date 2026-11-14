import { FileDropZone } from '@/components/common/FileDropZone';
import { Panel } from '@/components/common/Panel';
import { ImportStatusView } from '@/features/activities/components/ImportStatusView';
import { selectIsImporting, useActivitiesStore } from '@/features/activities/store/activitiesStore';

interface ArchiveUploadPanelProps {
  /** Called after a new dataset replaced the old one (e.g. to reset filters, ADR-0005). */
  onDatasetReplaced?: () => void;
}

/** Lets the user load or replace their Strava export ZIP (BR-01, BR-16, UX-01). */
// Implements: AC-01, AC-15, UX-01
export function ArchiveUploadPanel({ onDatasetReplaced }: ArchiveUploadPanelProps) {
  const status = useActivitiesStore((state) => state.status);
  const dataset = useActivitiesStore((state) => state.dataset);
  const pendingFileName = useActivitiesStore((state) => state.pendingFileName);
  const loadArchive = useActivitiesStore((state) => state.loadArchive);
  const isImporting = useActivitiesStore(selectIsImporting);

  const handleFile = async (file: File) => {
    const result = await loadArchive(file);
    if (result?.ok) {
      onDatasetReplaced?.();
    }
  };

  return (
    <Panel title="Activity data" description="Your Strava export ZIP. It never leaves this device.">
      <FileDropZone
        label={dataset ? 'Load a different ZIP' : 'Choose Strava export ZIP'}
        inputLabel="Strava export ZIP file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hint="Or drop the ZIP here. No need to extract it."
        disabled={isImporting}
        onFile={(file) => void handleFile(file)}
      />
      <ImportStatusView status={status} dataset={dataset} pendingFileName={pendingFileName} />
    </Panel>
  );
}
