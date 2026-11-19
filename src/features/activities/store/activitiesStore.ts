import { create } from 'zustand';
import {
  rideHistoryServices,
  type RideHistoryServices,
} from '@/features/activities/store/rideHistoryServices';
import { validateArchiveFile } from '@/features/activities/utils/validateArchiveFile';
import { RideHistoryApiError } from '@/services/ride-history-api/rideHistoryClient';
import type {
  ArchiveUploadResult,
  CyclingActivity,
  ImportStatus,
  RestoredHistory,
  SegmentIndex,
  UploadFailureReason,
  UploadRecord,
  UploadSummary,
} from '@/types';

/** The stored ride history, as shown: every ride of every upload, once (BR-18, BR-33). */
export interface LoadedDataset {
  readonly activities: readonly CyclingActivity[];
  /** Precomputed heat map road segments for these activities (ADR-0006). */
  readonly segmentIndex: SegmentIndex;
}

/** Whether the stored ride history could be loaded from the local backend. */
export type HistoryAvailability = 'loading' | 'ready' | 'unavailable';

export type UploadOutcome =
  | { readonly ok: true; readonly upload: UploadRecord }
  | { readonly ok: false; readonly reason: UploadFailureReason };

export interface ActivitiesState {
  /** The ride history, or null while it is empty or not loaded. */
  readonly dataset: LoadedDataset | null;
  /** The upload registry, newest first (BR-34). */
  readonly uploads: readonly UploadRecord[];
  readonly history: HistoryAvailability;
  readonly status: ImportStatus;
  /** Name of the file being imported, or of the last file that failed. */
  readonly pendingFileName: string | null;
  /** The latest successful upload of this session and its skipped rides (UX-03, UX-04). */
  readonly lastUpload: UploadSummary | null;
  /** When the last file was refused as already imported: its earlier upload (BR-37, AC-41). */
  readonly duplicateOf: UploadRecord | null;
  /** Loads the stored ride history, as the app does when it starts (BR-33, AC-34). */
  loadHistory: (services?: RideHistoryServices) => Promise<void>;
  /**
   * Imports a Strava export ZIP and adds its rides to the stored history (BR-01, BR-16). Resolves
   * with the outcome, or null when superseded by a newer import. Stored rides are never replaced
   * or removed; a failure stores and changes nothing (ADR-0004, BRD §10).
   */
  loadArchive: (file: File, services?: RideHistoryServices) => Promise<UploadOutcome | null>;
}

let latestUpload = 0;
let latestHistoryLoad = 0;

function failureReason(error: unknown): UploadFailureReason {
  if (error instanceof RideHistoryApiError) {
    if (error.code === 'duplicate-file') return 'duplicate-file';
    if (error.code === 'storage-unavailable') return 'history-unavailable';
  }
  return 'save-failed';
}

export const useActivitiesStore = create<ActivitiesState>()((set) => {
  /**
   * Reads the registry and every stored ride, and indexes them (ADR-0013 §4). The backend is the
   * source of truth: after any change the whole history is read again, so the screen always
   * matches what is stored. Returns false when a newer load started meanwhile; a failure marks the
   * history unavailable (unless a newer load started) and is rethrown.
   */
  const refresh = async (
    services: RideHistoryServices,
    onStatus: (status: ImportStatus) => void,
  ): Promise<boolean> => {
    const load = ++latestHistoryLoad;
    let restored: RestoredHistory;
    let uploads: UploadRecord[];
    try {
      const [registry, rides] = await Promise.all([
        services.client.listUploads(),
        services.client.fetchRides(),
      ]);
      uploads = registry;
      restored = await services.restoreHistory(rides, onStatus);
    } catch (error) {
      if (load === latestHistoryLoad) set({ history: 'unavailable' });
      throw error;
    }
    if (load !== latestHistoryLoad) return false;
    set({
      uploads,
      history: 'ready',
      dataset:
        restored.activities.length > 0
          ? { activities: restored.activities, segmentIndex: restored.segmentIndex }
          : null,
    });
    return true;
  };

  return {
    dataset: null,
    uploads: [],
    history: 'loading',
    status: { stage: 'idle' },
    pendingFileName: null,
    lastUpload: null,
    duplicateOf: null,

    // Implements: BR-33, AC-34
    // Uploads stay possible meanwhile: an upload reloads the history itself when it is stored, and
    // a slower startup load never overwrites that newer result.
    loadHistory: async (services = rideHistoryServices) => {
      set({ history: 'loading' });
      try {
        await refresh(services, () => {});
      } catch {
        // `refresh` marked the history unavailable; the panel says so (BRD §10).
      }
    },

    // Implements: BR-01, BR-16, BR-18, BR-37, UX-02, AC-15, AC-35, AC-41
    loadArchive: (file, services = rideHistoryServices) => importAndStore(file, services),
  };

  async function importAndStore(
    file: File,
    services: RideHistoryServices,
  ): Promise<UploadOutcome | null> {
    const uploadId = ++latestUpload;
    const isCurrent = () => uploadId === latestUpload;
    const fail = (reason: UploadFailureReason, duplicateOf: UploadRecord | null = null) => {
      if (isCurrent()) set({ status: { stage: 'failed', reason }, duplicateOf });
      return { ok: false as const, reason };
    };
    const onStatus = (status: ImportStatus) => {
      if (isCurrent()) set({ status });
    };

    // Reject wrong or oversized files before any work starts (BR-17, AC-17).
    const rejected = validateArchiveFile(file);
    set({
      pendingFileName: file.name,
      duplicateOf: null,
      status: rejected ? { stage: 'failed', reason: rejected } : { stage: 'reading-archive' },
    });
    if (rejected) return { ok: false, reason: rejected };
    let prepared: ArchiveUploadResult;
    try {
      prepared = await services.importArchive(file, onStatus);
    } catch {
      prepared = { ok: false, reason: 'corrupt-archive' };
    }
    if (!isCurrent()) return null; // superseded by a newer import
    if (!prepared.ok) return fail(prepared.reason);

    // Store first; nothing is shown that was not stored (BRD §10: no in-memory fallback).
    onStatus({ stage: 'saving' });
    let upload: UploadRecord;
    try {
      upload = await services.client.createUpload(prepared.bundle);
    } catch (error) {
      return fail(
        failureReason(error),
        error instanceof RideHistoryApiError ? error.existingUpload : null,
      );
    }

    onStatus({ stage: 'loading-history' });
    try {
      await refresh(services, onStatus);
    } catch {
      return fail('history-unavailable');
    }
    if (!isCurrent()) return null;
    set({
      status: { stage: 'done' },
      pendingFileName: null,
      lastUpload: { upload, issues: prepared.issues },
    });
    return { ok: true, upload };
  }
});

/** Whether an upload is being processed or stored. */
export const selectIsImporting = (state: ActivitiesState): boolean =>
  state.status.stage === 'reading-archive' ||
  state.status.stage === 'parsing-activities' ||
  state.status.stage === 'saving' ||
  state.status.stage === 'loading-history' ||
  state.status.stage === 'indexing';
