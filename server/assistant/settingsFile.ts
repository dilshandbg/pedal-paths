import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/*
 * The assistant settings file (ADR-0014 §7), `data/assistant-settings.json` by default and
 * git-ignored. One instance is shared by everything that keeps a section in it (settings, model
 * evaluations), so a write never drops another section. It holds no secrets and no ride data.
 */

/** The assistant settings file, relative to the project root. Git-ignored (`data/`). */
export const DEFAULT_ASSISTANT_SETTINGS_PATH = 'data/assistant-settings.json';

export interface SettingsFile {
  /** The sections as loaded and last written. */
  read(): Readonly<Record<string, unknown>>;
  /** Replaces the given sections and writes the file; false when it could not be written. */
  update(sections: Readonly<Record<string, unknown>>): boolean;
}

/** Writes atomically: the file always holds the old or the new settings, never part of them. */
function writeAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, 'utf8');
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Opens the settings file at `path`, or keeps settings in memory only when `path` is null (tests).
 * A missing file is empty. A file that is not a JSON object is left as it is and never written:
 * settings then last until the app stops, and `log` says so.
 */
export function openSettingsFile(
  path: string | null,
  log: (message: string) => void = (message) => console.warn(message),
): SettingsFile {
  let sections: Record<string, unknown> = {};
  let writable = path !== null;

  if (path !== null && existsSync(path)) {
    let problem: string | null = null;
    try {
      const json: unknown = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        sections = json as Record<string, unknown>;
      } else {
        problem = 'it is not a JSON object';
      }
    } catch {
      problem = 'it is not valid JSON';
    }
    if (problem) {
      writable = false;
      log(
        `Assistant: ${path} was not loaded because ${problem}; settings and model test results are kept in memory only and the file is not changed.`,
      );
    }
  }

  return {
    read: () => sections,
    update(patch) {
      sections = { ...sections, ...patch };
      if (!writable || path === null) return path === null;
      try {
        writeAtomically(path, `${JSON.stringify(sections, null, 2)}\n`);
        return true;
      } catch (error) {
        log(`Assistant: settings could not be saved to ${path} (${(error as Error).message}).`);
        return false;
      }
    },
  };
}
