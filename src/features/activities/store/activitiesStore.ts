import { create } from 'zustand';
import {
  runImportInWorker,
  type ArchiveImporter,
} from '@/features/activities/workers/runImportInWorker';
import { validateArchiveFile } from '@/features/activities/utils/validateArchiveFile';
import type {
  CyclingActivity,
  ImportIssue,
  ImportResult,
  ImportStatus,
  SegmentIndex,
} from '@/types';

/** The currently loaded Strava export. Only one dataset is loaded at a time (BR-16). */
export interface LoadedDataset {
  readonly fileName: string;
  readonly activities: readonly CyclingActivity[];
  readonly issues: readonly ImportIssue[];
  readonly excludedNonRideCount: number;
  /** Precomputed heat map road segments for these activities (ADR-0006). */
  readonly segmentIndex: SegmentIndex;
}

export interface ActivitiesState {
  readonly dataset: LoadedDataset | null;
  readonly status: ImportStatus;
  /** Name of the file being imported, or of the last file that failed. */
  readonly pendingFileName: string | null;
  /**
   * Imports a Strava export ZIP (BR-01). Resolves with the import result. A successful import
   * replaces the dataset (BR-16, AC-15). A failed one keeps the previous dataset (ADR-0004).
   * Starting a new import supersedes one that is still running.
   */
  loadArchive: (file: File, importer?: ArchiveImporter) => Promise<ImportResult | null>;
}

let latestImport = 0;

export const useActivitiesStore = create<ActivitiesState>()((set) => ({
  dataset: null,
  status: { stage: 'idle' },
  pendingFileName: null,

  // Implements: BR-01, BR-16, UX-02
  loadArchive: async (file, importer = runImportInWorker) => {
    const importId = ++latestImport;
    const isCurrent = () => importId === latestImport;

    // Reject wrong or oversized files before any work starts (BR-17, AC-17).
    const rejected = validateArchiveFile(file);
    if (rejected) {
      set({ status: { stage: 'failed', reason: rejected }, pendingFileName: file.name });
      return { ok: false, reason: rejected };
    }

    set({ status: { stage: 'reading-archive' }, pendingFileName: file.name });

    let result: ImportResult;
    try {
      result = await importer(file, (status) => {
        if (isCurrent()) {
          set({ status });
        }
      });
    } catch {
      result = { ok: false, reason: 'corrupt-archive' };
    }

    if (!isCurrent()) {
      return null; // superseded by a newer import
    }

    if (result.ok) {
      set({
        dataset: {
          fileName: file.name,
          activities: result.activities,
          issues: result.issues,
          excludedNonRideCount: result.excludedNonRideCount,
          segmentIndex: result.segmentIndex,
        },
        status: { stage: 'done' },
        pendingFileName: null,
      });
    } else {
      set({ status: { stage: 'failed', reason: result.reason } });
    }
    return result;
  },
}));

/** Whether an import is currently running. */
export const selectIsImporting = (state: ActivitiesState): boolean =>
  state.status.stage === 'reading-archive' ||
  state.status.stage === 'parsing-activities' ||
  state.status.stage === 'indexing';
