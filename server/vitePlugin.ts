import { resolve } from 'node:path';
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { openDatabase } from './db/database';
import { createSegmentsApi } from './http/segmentsApi';
import { createSegmentRepository, type SegmentRepository } from './segments/segmentRepository';

/** Default database file, relative to the project root. Git-ignored (`data/`). */
export const DEFAULT_DB_PATH = 'data/segments.sqlite';

/**
 * Mounts the local segment API on the Vite dev and preview servers (ADR-0009). The database is
 * opened on the first API request, at `SEGMENTS_DB_PATH` (environment or `.env.local`) or
 * `data/segments.sqlite`.
 */
export function segmentsApiPlugin(): Plugin {
  let dbPath = DEFAULT_DB_PATH;
  let repository: SegmentRepository | null = null;

  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(
      createSegmentsApi(() => {
        repository ??= createSegmentRepository(openDatabase(dbPath));
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
      const configured = process.env.SEGMENTS_DB_PATH ?? env.SEGMENTS_DB_PATH;
      dbPath =
        configured === ':memory:'
          ? configured
          : resolve(config.root, configured?.trim() || DEFAULT_DB_PATH);
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
