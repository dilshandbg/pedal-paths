import { describe, expect, it } from 'vitest';
import {
  runImportInWorker,
  runRestoreInWorker,
} from '@/features/activities/workers/runImportInWorker';

// jsdom has no Web Workers: exactly the case of a browser that cannot start one.
describe('workers that cannot start', () => {
  it('BR-33: restoring rejects instead of throwing, so callers handle it like any failure', async () => {
    let result: Promise<unknown> | null = null;

    expect(() => {
      result = runRestoreInWorker(() => {});
    }).not.toThrow();
    await expect(result).rejects.toThrow();
  });

  it('BR-01: importing rejects instead of throwing', async () => {
    let result: Promise<unknown> | null = null;

    expect(() => {
      result = runImportInWorker(new File(['PK'], 'export.zip'), () => {});
    }).not.toThrow();
    await expect(result).rejects.toThrow();
  });
});
