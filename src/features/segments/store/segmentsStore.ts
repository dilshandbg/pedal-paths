import { create } from 'zustand';
import {
  runSegmentParseInWorker,
  type SegmentFileParser,
} from '@/features/segments/workers/runSegmentParseInWorker';
import {
  checkSegmentFile,
  describeSegmentApiError,
} from '@/features/segments/utils/segmentMessages';
import {
  SegmentApiError,
  segmentsClient,
  type SegmentsClient,
} from '@/services/segments-api/segmentsClient';
import type {
  SegmentDetail,
  SegmentImportPayload,
  SegmentImportPlan,
  SegmentImportProblem,
  StoredSegment,
} from '@/types';

/** Progress of the current segment import (BR-20 – BR-22). */
export type SegmentImportState =
  | { readonly stage: 'idle' }
  | { readonly stage: 'reading'; readonly fileName: string }
  | {
      readonly stage: 'invalid';
      readonly fileName: string;
      readonly problems: readonly SegmentImportProblem[];
    }
  | {
      readonly stage: 'review' | 'saving';
      readonly fileName: string;
      readonly payload: SegmentImportPayload;
      readonly plan: SegmentImportPlan;
    }
  | { readonly stage: 'done'; readonly fileName: string; readonly plan: SegmentImportPlan }
  | { readonly stage: 'failed'; readonly fileName: string; readonly message: string };

export type SegmentStorageStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface SegmentsState {
  /** Stored segments as last loaded from the local backend. */
  readonly segments: readonly StoredSegment[];
  readonly storage: SegmentStorageStatus;
  readonly importState: SegmentImportState;
  readonly selectedSegmentId: string | null;
  /** Details of the selected segment, once loaded. */
  readonly detail: SegmentDetail | null;
  readonly detailStatus: 'idle' | 'loading' | 'ready' | 'failed';
  /** Whether segment routes are drawn on the map (BR-26). */
  readonly showOnMap: boolean;
  /** Message for a failed removal, or null. */
  readonly actionError: string | null;

  loadSegments: (client?: SegmentsClient) => Promise<void>;
  /** Reads, validates and previews a file; stores nothing (BR-21, BR-22). */
  chooseFile: (file: File, parser?: SegmentFileParser, client?: SegmentsClient) => Promise<void>;
  /** Stores the reviewed import (BR-23, BR-24). */
  confirmImport: (client?: SegmentsClient) => Promise<void>;
  /** Discards the reviewed import, the problem list or the result message. */
  cancelImport: () => void;
  selectSegment: (segmentId: string | null, client?: SegmentsClient) => Promise<void>;
  removeSegment: (segmentId: string, client?: SegmentsClient) => Promise<void>;
  removeAllSegments: (client?: SegmentsClient) => Promise<void>;
  setShowOnMap: (show: boolean) => void;
}

const messageOf = (error: unknown) =>
  describeSegmentApiError(error instanceof SegmentApiError ? error.code : 'storage-error');

let latestFile = 0;
let latestDetail = 0;

export const useSegmentsStore = create<SegmentsState>()((set, get) => {
  const refresh = async (client: SegmentsClient) => {
    try {
      const segments = await client.list();
      set({ segments, storage: 'ready' });
    } catch {
      set({ storage: 'unavailable' });
    }
  };

  const loadDetail = async (segmentId: string, client: SegmentsClient) => {
    const request = ++latestDetail;
    set({ detailStatus: 'loading' });
    try {
      const detail = await client.get(segmentId);
      if (request === latestDetail) set({ detail, detailStatus: 'ready' });
    } catch {
      if (request === latestDetail) set({ detail: null, detailStatus: 'failed' });
    }
  };

  return {
    segments: [],
    storage: 'idle',
    importState: { stage: 'idle' },
    selectedSegmentId: null,
    detail: null,
    detailStatus: 'idle',
    showOnMap: true,
    actionError: null,

    loadSegments: async (client = segmentsClient) => {
      set({ storage: 'loading' });
      await refresh(client);
    },

    // Implements: BR-20, BR-21, BR-22
    chooseFile: async (file, parser = runSegmentParseInWorker, client = segmentsClient) => {
      const request = ++latestFile;
      const isCurrent = () => request === latestFile;
      const fileName = file.name;

      const rejected = checkSegmentFile(file);
      if (rejected) {
        set({
          importState: {
            stage: 'invalid',
            fileName,
            problems: [{ location: 'file', field: null, message: rejected }],
          },
        });
        return;
      }
      set({ importState: { stage: 'reading', fileName } });

      try {
        const parsed = await parser(
          file,
          get().segments.map((segment) => segment.segmentId),
        );
        if (!isCurrent()) return;
        if (!parsed.ok) {
          set({ importState: { stage: 'invalid', fileName, problems: parsed.problems } });
          return;
        }
        const plan = await client.preview(parsed.payload);
        if (!isCurrent()) return;
        set({ importState: { stage: 'review', fileName, payload: parsed.payload, plan } });
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof SegmentApiError && error.problems.length > 0) {
          set({ importState: { stage: 'invalid', fileName, problems: error.problems } });
        } else if (error instanceof SegmentApiError) {
          set({ importState: { stage: 'failed', fileName, message: messageOf(error) } });
        } else {
          set({
            importState: { stage: 'failed', fileName, message: 'The file could not be read.' },
          });
        }
      }
    },

    // Implements: BR-23, BR-24
    confirmImport: async (client = segmentsClient) => {
      const current = get().importState;
      if (current.stage !== 'review') return;
      set({ importState: { ...current, stage: 'saving' } });
      try {
        const plan = await client.import(current.payload);
        set({ importState: { stage: 'done', fileName: current.fileName, plan } });
      } catch (error) {
        set({
          importState:
            error instanceof SegmentApiError && error.problems.length > 0
              ? { stage: 'invalid', fileName: current.fileName, problems: error.problems }
              : { stage: 'failed', fileName: current.fileName, message: messageOf(error) },
        });
        return;
      }
      await refresh(client);
      const selected = get().selectedSegmentId;
      if (selected) await loadDetail(selected, client);
    },

    cancelImport: () => {
      latestFile += 1; // a file still being read is discarded
      set({ importState: { stage: 'idle' } });
    },

    selectSegment: async (segmentId, client = segmentsClient) => {
      set({ selectedSegmentId: segmentId, detail: null, actionError: null });
      if (segmentId === null) {
        latestDetail += 1;
        set({ detailStatus: 'idle' });
        return;
      }
      await loadDetail(segmentId, client);
    },

    // Implements: BR-27
    removeSegment: async (segmentId, client = segmentsClient) => {
      set({ actionError: null });
      try {
        await client.remove(segmentId);
      } catch (error) {
        if (!(error instanceof SegmentApiError && error.code === 'not-found')) {
          set({ actionError: messageOf(error) });
          return;
        }
      }
      if (get().selectedSegmentId === segmentId) {
        latestDetail += 1;
        set({ selectedSegmentId: null, detail: null, detailStatus: 'idle' });
      }
      await refresh(client);
    },

    // Implements: BR-27, NFR-09
    removeAllSegments: async (client = segmentsClient) => {
      set({ actionError: null });
      try {
        await client.removeAll();
      } catch (error) {
        set({ actionError: messageOf(error) });
        return;
      }
      latestDetail += 1;
      set({ selectedSegmentId: null, detail: null, detailStatus: 'idle' });
      await refresh(client);
    },

    setShowOnMap: (showOnMap) => set({ showOnMap }),
  };
});

/** Whether an import is being read, previewed or stored. */
export const selectIsImportBusy = (state: SegmentsState): boolean =>
  state.importState.stage === 'reading' || state.importState.stage === 'saving';
