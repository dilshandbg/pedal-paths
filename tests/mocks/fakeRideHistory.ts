import { vi } from 'vitest';
import type { RideHistoryServices } from '@/features/activities/store/rideHistoryServices';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { RideHistoryApiError } from '@/services/ride-history-api/rideHistoryClient';
import type {
  ArchiveUploadResult,
  CyclingActivity,
  ImportFailureReason,
  ImportIssue,
  ImportStatus,
  UploadRecord,
} from '@/types';

/*
 * In-memory stand-in for the import worker and the local ride history API (jsdom has neither
 * Web Workers nor a backend). It follows the backend's rules from ADR-0013: rides are stored once
 * and shared by every upload containing them (RULE-21), a newer upload replaces details but keeps
 * the track (RULE-22), and a file with the same hash is refused (BR-37). The backend itself is
 * tested against these rules in tests/server.
 */

/** What the next processed ZIP contains, or why it fails. */
export type FakeArchive =
  | {
      readonly activities: readonly CyclingActivity[];
      readonly issues?: readonly ImportIssue[];
      readonly excludedNonRideCount?: number;
      /** Defaults to a hash of the file name: the same name counts as the same file. */
      readonly fileHash?: string;
    }
  | { readonly fail: ImportFailureReason };

interface PendingUpload {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly fileHash: string;
  readonly activities: readonly CyclingActivity[];
  readonly skippedCount: number;
  readonly excludedNonRideCount: number;
}

export interface FakeRideHistory {
  readonly services: RideHistoryServices;
  /** Queues what the next imported ZIPs contain, in order. */
  queueArchive(...archives: FakeArchive[]): void;
  /** Makes the ride storage unreachable (or reachable again). */
  setAvailable(available: boolean): void;
  /** Makes the next deletion fail with this API error code, deleting nothing (AC-40). */
  failNextDelete(code: 'not-found' | 'storage-error' | 'storage-unavailable'): void;
  /** Delays `importArchive` until the returned function is called (to see progress). */
  holdNextImport(onStatus?: ImportStatus): () => void;
  storedIds(): string[];
  uploads(): UploadRecord[];
  reset(): void;
}

export function createFakeRideHistory(): FakeRideHistory {
  let rides = new Map<string, CyclingActivity>();
  let uploads: UploadRecord[] = [];
  /** Activity IDs each upload contains (RULE-21). */
  let links = new Map<string, ReadonlySet<string>>();
  let deleteFailure: 'not-found' | 'storage-error' | 'storage-unavailable' | null = null;
  let queue: FakeArchive[] = [];
  let available = true;
  let hold: { readonly status: ImportStatus | undefined; release: Promise<void> } | null = null;
  const pending = new WeakMap<Uint8Array, PendingUpload>();

  const unavailable = () => new RideHistoryApiError('storage-unavailable');

  const importArchive = vi.fn(
    async (file: File, onStatus: (status: ImportStatus) => void): Promise<ArchiveUploadResult> => {
      if (hold) {
        const current = hold;
        hold = null;
        if (current.status) onStatus(current.status);
        await current.release;
      }
      const next = queue.shift();
      if (!next) throw new Error(`No archive queued for ${file.name}`);
      if ('fail' in next) return { ok: false, reason: next.fail };
      const bundle = new Uint8Array(0); // identity only: the fake keeps the rides itself
      const issues = next.issues ?? [];
      const excludedNonRideCount = next.excludedNonRideCount ?? 0;
      const fileHash = next.fileHash ?? `hash:${file.name}`;
      pending.set(bundle, {
        fileName: file.name,
        fileSizeBytes: file.size,
        fileHash,
        activities: next.activities,
        skippedCount: issues.length,
        excludedNonRideCount,
      });
      return {
        ok: true,
        bundle,
        fileHash,
        rideCount: next.activities.length,
        issues,
        excludedNonRideCount,
      };
    },
  );

  const client = {
    listUploads: vi.fn(async () => {
      if (!available) throw unavailable();
      return [...uploads].reverse();
    }),
    fetchRides: vi.fn(async () => {
      if (!available) throw unavailable();
      return new Uint8Array(1);
    }),
    createUpload: vi.fn(async (bundle: Uint8Array) => {
      if (!available) throw unavailable();
      const upload = pending.get(bundle);
      if (!upload) throw new RideHistoryApiError('invalid-payload');
      const existing = uploads.find((u) => u.fileHash === upload.fileHash);
      if (existing) throw new RideHistoryApiError('duplicate-file', existing);

      const seen = new Set<string>();
      let newRideCount = 0;
      let totalDistanceKm = 0;
      for (const activity of upload.activities) {
        if (seen.has(activity.activityId)) continue;
        seen.add(activity.activityId);
        totalDistanceKm += activity.distanceKm ?? 0;
        const stored = rides.get(activity.activityId);
        if (stored) {
          rides.set(activity.activityId, { ...activity, gpsTrack: stored.gpsTrack });
        } else {
          rides.set(activity.activityId, activity);
          newRideCount += 1;
        }
      }
      const record: UploadRecord = {
        uploadId: `00000000-0000-4000-8000-${String(uploads.length + 1).padStart(12, '0')}`,
        fileName: upload.fileName,
        fileSizeBytes: upload.fileSizeBytes,
        fileHash: upload.fileHash,
        uploadedAt: new Date(Date.UTC(2026, 10, 19, 10, uploads.length)).toISOString(),
        status: upload.skippedCount > 0 ? 'partial' : 'complete',
        rideCount: seen.size,
        newRideCount,
        totalDistanceKm,
        skippedCount: upload.skippedCount,
        excludedNonRideCount: upload.excludedNonRideCount,
      };
      uploads = [...uploads, record];
      links = new Map(links).set(record.uploadId, seen);
      return record;
    }),
    deleteUploads: vi.fn(async (uploadIds: readonly string[]) => {
      if (!available) throw unavailable();
      const failure = deleteFailure;
      deleteFailure = null;
      if (failure) throw new RideHistoryApiError(failure);
      const ids = new Set(uploadIds);
      if ([...ids].some((id) => !links.has(id))) throw new RideHistoryApiError('not-found');

      uploads = uploads.filter((upload) => !ids.has(upload.uploadId));
      links = new Map([...links].filter(([id]) => !ids.has(id)));
      const stillContained = new Set([...links.values()].flatMap((rideIds) => [...rideIds]));
      const before = rides.size;
      rides = new Map([...rides].filter(([id]) => stillContained.has(id)));
      return { deletedUploads: ids.size, deletedRides: before - rides.size };
    }),
    deleteAll: vi.fn(async () => {
      if (!available) throw unavailable();
      const failure = deleteFailure;
      deleteFailure = null;
      if (failure) throw new RideHistoryApiError(failure);
      const result = { deletedUploads: uploads.length, deletedRides: rides.size };
      uploads = [];
      links = new Map();
      rides = new Map();
      return result;
    }),
  };

  const restoreHistory = vi.fn(
    async (_bundle: Uint8Array, onStatus: (status: ImportStatus) => void) => {
      onStatus({ stage: 'indexing' });
      const activities = [...rides.values()].sort((a, b) =>
        b.activityDate.localeCompare(a.activityDate),
      );
      return { activities, segmentIndex: buildSegmentIndex(activities), skippedCount: 0 };
    },
  );

  return {
    services: { importArchive, restoreHistory, client },
    queueArchive: (...archives) => {
      queue = [...queue, ...archives];
    },
    failNextDelete: (code) => {
      deleteFailure = code;
    },
    setAvailable: (value) => {
      available = value;
    },
    holdNextImport: (status) => {
      let release: () => void = () => {};
      hold = { status, release: new Promise<void>((resolve) => (release = resolve)) };
      return () => release();
    },
    storedIds: () => [...rides.keys()].sort(),
    uploads: () => [...uploads],
    reset: () => {
      rides = new Map();
      uploads = [];
      links = new Map();
      deleteFailure = null;
      queue = [];
      available = true;
      hold = null;
      importArchive.mockClear();
      restoreHistory.mockClear();
      client.listUploads.mockClear();
      client.fetchRides.mockClear();
      client.createUpload.mockClear();
      client.deleteUploads.mockClear();
      client.deleteAll.mockClear();
    },
  };
}

/** The shared fake used by `vi.mock('@/features/activities/store/rideHistoryServices')`. */
export const fakeRideHistory = createFakeRideHistory();
