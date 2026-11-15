import { resolve } from 'node:path';
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { openCatalogRepository } from './catalog/catalogRepository';
import { migrateLegacyDatabase } from './catalog/migrateLegacyDatabase';
import { createSegmentsApi } from './http/segmentsApi';
import type { SegmentRepository } from './segments/repository';

/** Default segment catalog file, relative to the project root. Git-ignored (`data/`). */
export const DEFAULT_CATALOG_PATH = 'data/segment-catalog.json';
/** Default location of the earlier SQLite database, migrated once into the catalog (BR-30). */
export const DEFAULT_DB_PATH = 'data/segments.sqlite';

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
          repository = openCatalogRepository(catalogPath);
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
      const path = (name: string, fallback: string) => {
        const configured = (process.env[name] ?? env[name])?.trim();
        return configured === ':memory:'
          ? configured
          : resolve(config.root, configured || fallback);
      };
      catalogPath = path('SEGMENT_CATALOG_PATH', DEFAULT_CATALOG_PATH);
      databasePath = path('SEGMENTS_DB_PATH', DEFAULT_DB_PATH);
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
