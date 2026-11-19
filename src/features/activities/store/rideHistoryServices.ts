import {
  runImportInWorker,
  runRestoreInWorker,
  type ArchiveImporter,
  type HistoryRestorer,
} from '@/features/activities/workers/runImportInWorker';
import {
  rideHistoryClient,
  type RideHistoryClient,
} from '@/services/ride-history-api/rideHistoryClient';

/**
 * What the activities store needs to import, store and restore rides (ADR-0013 §4): the import
 * worker's two jobs and the local ride history API. Tests replace it with an in-memory fake.
 */
export interface RideHistoryServices {
  readonly importArchive: ArchiveImporter;
  readonly restoreHistory: HistoryRestorer;
  readonly client: RideHistoryClient;
}

export const rideHistoryServices: RideHistoryServices = {
  importArchive: runImportInWorker,
  restoreHistory: runRestoreInWorker,
  client: rideHistoryClient,
};
