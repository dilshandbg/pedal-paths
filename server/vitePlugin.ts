import { resolve } from 'node:path';
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { openCatalogRepository } from './catalog/catalogRepository';
import { migrateLegacyDatabase } from './catalog/migrateLegacyDatabase';
import { createRideAnalytics, type RideAnalytics } from './analytics/rideAnalytics';
import { createAssistantService, type AssistantService } from './assistant/service';
import { DEFAULT_ASSISTANT_SETTINGS_PATH, openSettingsFile } from './assistant/settingsFile';
import { createProviderRegistry, DEFAULT_PROVIDER_FACTORIES } from './assistant/llm/registry';
import { summarizeHistory } from './assistant/systemPrompt';
import { createAnalyticsApi } from './http/analyticsApi';
import { createAssistantApi } from './http/assistantApi';
import { createRidesApi } from './http/ridesApi';
import { createSegmentsApi } from './http/segmentsApi';
import { openRideRepository, type RideRepository } from './rides/rideRepository';
import type { SegmentRepository } from './segments/repository';

/** Default segment catalog file, relative to the project root. Git-ignored (`data/`). */
export const DEFAULT_CATALOG_PATH = 'data/segment-catalog.json';
/** Default location of the earlier SQLite database, migrated once into the catalog (BR-30). */
export const DEFAULT_DB_PATH = 'data/segments.sqlite';
/** Default ride history database (BR-33, ADR-0013), relative to the project root. Git-ignored. */
export const DEFAULT_RIDES_DB_PATH = 'data/rides.sqlite';

/** Resolves a storage path setting from the environment or `.env.local`; `:memory:` stays as is. */
function storagePath(env: Record<string, string>, root: string, name: string, fallback: string) {
  const configured = (process.env[name] ?? env[name])?.trim();
  return configured === ':memory:' ? configured : resolve(root, configured || fallback);
}

/**
 * Mounts the local segment API on the Vite dev and preview servers (ADR-0009, ADR-0011). The
 * catalog is loaded on the first API request, which the app makes when it starts, from
 * `SEGMENT_CATALOG_PATH` (environment or `.env.local`) or `data/segment-catalog.json`. If that file
 * does not exist yet, segments in the SQLite database at `SEGMENTS_DB_PATH` (or
 * `data/segments.sqlite`) are migrated into it first.
 */
export function segmentsApiPlugin(): Plugin {
  let catalogPath = DEFAULT_CATALOG_PATH;
  let databasePath = DEFAULT_DB_PATH;
  let repository: SegmentRepository | null = null;

  const mount = (server: ViteDevServer | PreviewServer) => {
    const { logger } = server.config;
    server.middlewares.use(
      createSegmentsApi(() => {
        if (!repository) {
          const migration = migrateLegacyDatabase(databasePath, catalogPath);
          if (migration) {
            logger.info(
              `Migrated ${migration.segments} segments and ${migration.efforts} efforts into ${catalogPath}` +
                (migration.backupPath ? `; the old database is now ${migration.backupPath}.` : '.'),
            );
          }
          repository = openCatalogRepository(catalogPath, (message) => logger.warn(message));
        }
        return repository;
      }),
    );
    server.httpServer?.once('close', () => {
      repository?.close();
      repository = null;
    });
  };

  return {
    name: 'segments-api',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || config.root, '');
      catalogPath = storagePath(env, config.root, 'SEGMENT_CATALOG_PATH', DEFAULT_CATALOG_PATH);
      databasePath = storagePath(env, config.root, 'SEGMENTS_DB_PATH', DEFAULT_DB_PATH);
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

/**
 * Mounts the local ride history, analytics and assistant APIs on the Vite dev and preview servers
 * (BR-33, BR-38, BR-39, ADR-0013, ADR-0014). The database at `RIDES_DB_PATH` (environment or
 * `.env.local`), or `data/rides.sqlite`, is opened on the first request, which the app makes when
 * it starts. The assistant keeps its settings in `ASSISTANT_SETTINGS_PATH`, or
 * `data/assistant-settings.json`, and talks only to the local Ollama server set there.
 */
export function ridesApiPlugin(): Plugin {
  let databasePath = DEFAULT_RIDES_DB_PATH;
  let settingsPath = DEFAULT_ASSISTANT_SETTINGS_PATH;
  let repository: RideRepository | null = null;
  let analytics: RideAnalytics | null = null;
  let assistant: AssistantService | null = null;

  const open = () => {
    repository ??= openRideRepository(databasePath);
    return repository;
  };

  const openAnalytics = () => {
    analytics ??= createRideAnalytics(open());
    return analytics;
  };

  const mount = (server: ViteDevServer | PreviewServer) => {
    const { logger } = server.config;
    server.middlewares.use(createRidesApi(open));
    // Analytics over the same stored history (BR-38, ADR-0013 §7).
    server.middlewares.use(createAnalyticsApi(openAnalytics));
    // The local assistant answers through the same analytics (BR-39, ADR-0014).
    server.middlewares.use(
      createAssistantApi(() => {
        assistant ??= createAssistantService({
          registry: createProviderRegistry(DEFAULT_PROVIDER_FACTORIES),
          file: openSettingsFile(settingsPath === ':memory:' ? null : settingsPath, (message) =>
            logger.warn(message),
          ),
          analytics: openAnalytics,
          history: () => summarizeHistory(open().listRideDetails()),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          log: (message) => logger.warn(message),
        });
        return assistant;
      }),
    );
    server.httpServer?.once('close', () => {
      assistant?.close();
      assistant = null;
      repository?.close();
      repository = null;
      analytics = null;
    });
  };

  return {
    name: 'rides-api',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || config.root, '');
      databasePath = storagePath(env, config.root, 'RIDES_DB_PATH', DEFAULT_RIDES_DB_PATH);
      settingsPath = storagePath(
        env,
        config.root,
        'ASSISTANT_SETTINGS_PATH',
        DEFAULT_ASSISTANT_SETTINGS_PATH,
      );
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
