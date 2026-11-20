import type { ModelDownload } from '../../src/types/assistant';
import { isLLMError } from './llm/errors';
import type { ModelManager } from './llm/types';
import { codeForLLMError } from './messages';
import { checkModelName, modelKey } from './modelRules';

/*
 * Model downloads (BR-42, AC-48). Provider-neutral: works with any `ModelManager`.
 *
 * - Progress and status are kept per model and can be watched while the download runs.
 * - A model that is already downloading is never downloaded a second time; asking again joins
 *   the running download.
 * - Cancel aborts the request. A download that ends without the provider confirming it
 *   completed (connection lost, provider stopped) is reported as failed, and can be started again.
 */

export type DownloadListener = (download: ModelDownload) => void;

export type StartResult =
  | { readonly ok: true; readonly started: boolean; readonly download: ModelDownload }
  | { readonly ok: false; readonly problem: string };

export interface DownloadManager {
  /** Starts a download, or returns the running one for the same model (`started: false`). */
  start(name: string): StartResult;
  cancel(name: string): boolean;
  get(name: string): ModelDownload | null;
  list(): readonly ModelDownload[];
  /** Calls `listener` on every change of that model's download (started earlier) until unsubscribed. */
  watch(name: string, listener: DownloadListener): () => void;
  /** Resolves when the model's current download has finished (whatever the outcome). */
  settled(name: string): Promise<ModelDownload | null>;
}

export interface DownloadManagerDeps {
  /** The current provider's model manager, or null when it can't install models. */
  readonly manager: () => ModelManager | null;
  readonly clock?: () => Date;
  readonly log?: (message: string) => void;
}

interface Running {
  download: ModelDownload;
  readonly controller: AbortController;
  done: Promise<void>;
  readonly listeners: Set<DownloadListener>;
}

// Implements: BR-42, AC-48
export function createDownloadManager(deps: DownloadManagerDeps): DownloadManager {
  const clock = deps.clock ?? (() => new Date());
  const downloads = new Map<string, Running>();

  const update = (entry: Running, patch: Partial<ModelDownload>) => {
    entry.download = { ...entry.download, ...patch };
    for (const listener of entry.listeners) listener(entry.download);
  };

  async function run(entry: Running, manager: ModelManager, name: string, signal: AbortSignal) {
    let completed = false;
    try {
      for await (const progress of manager.install(name, signal)) {
        update(entry, {
          detail: progress.status,
          completedBytes: progress.completedBytes,
          totalBytes: progress.totalBytes,
        });
      }
      completed = true;
    } catch (failure) {
      if (signal.aborted) {
        update(entry, { status: 'cancelled', finishedAt: clock().toISOString() });
        return;
      }
      deps.log?.(`Assistant: download of ${name} failed (${(failure as Error).message}).`);
      update(entry, {
        status: 'failed',
        error: isLLMError(failure) ? codeForLLMError(failure.kind) : 'internal',
        finishedAt: clock().toISOString(),
      });
      return;
    }
    if (completed) update(entry, { status: 'completed', finishedAt: clock().toISOString() });
  }

  return {
    start(raw) {
      const checked = checkModelName(raw);
      if (!checked.ok) return checked;
      const key = modelKey(checked.name);
      const existing = downloads.get(key);
      if (existing?.download.status === 'downloading') {
        return { ok: true, started: false, download: existing.download };
      }
      const manager = deps.manager();
      if (!manager) return { ok: false, problem: 'This provider cannot download models.' };
      const controller = new AbortController();
      const entry: Running = {
        download: {
          model: checked.name,
          status: 'downloading',
          detail: null,
          completedBytes: null,
          totalBytes: null,
          error: null,
          startedAt: clock().toISOString(),
          finishedAt: null,
        },
        controller,
        // Whoever watched the previous download of this model keeps watching.
        listeners: existing?.listeners ?? new Set(),
        done: Promise.resolve(),
      };
      downloads.set(key, entry);
      entry.done = run(entry, manager, checked.name, controller.signal);
      return { ok: true, started: true, download: entry.download };
    },
    cancel(name) {
      const entry = downloads.get(modelKey(name));
      if (!entry || entry.download.status !== 'downloading') return false;
      entry.controller.abort();
      return true;
    },
    get: (name) => downloads.get(modelKey(name))?.download ?? null,
    list: () => [...downloads.values()].map((entry) => entry.download),
    watch(name, listener) {
      const entry = downloads.get(modelKey(name));
      if (!entry) return () => {};
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    async settled(name) {
      const entry = downloads.get(modelKey(name));
      if (!entry) return null;
      await entry.done;
      return entry.download;
    },
  };
}
