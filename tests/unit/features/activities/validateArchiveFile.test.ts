import { describe, expect, it } from 'vitest';
import {
  MAX_ARCHIVE_BYTES,
  validateArchiveFile,
} from '@/features/activities/utils/validateArchiveFile';

const file = (name: string, size = 1024, type = '') => ({ name, size, type });

describe('BR-17 / AC-17: archive file validation', () => {
  it('accepts a .zip file, whatever the browser reports as its type', () => {
    expect(validateArchiveFile(file('export_12345.zip'))).toBeNull();
    expect(validateArchiveFile(file('EXPORT.ZIP', 1, 'application/octet-stream'))).toBeNull();
  });

  it('accepts a file with a ZIP media type but no .zip name', () => {
    expect(validateArchiveFile(file('download', 1, 'application/zip'))).toBeNull();
    expect(validateArchiveFile(file('download', 1, 'application/x-zip-compressed'))).toBeNull();
  });

  it('rejects other file types as not a ZIP', () => {
    expect(validateArchiveFile(file('activities.csv', 1, 'text/csv'))).toBe('not-a-zip');
    expect(validateArchiveFile(file('ride.gpx'))).toBe('not-a-zip');
    expect(validateArchiveFile(file('archive.zip.txt', 1, 'text/plain'))).toBe('not-a-zip');
  });

  it('accepts exactly the maximum size and rejects anything larger', () => {
    expect(validateArchiveFile(file('a.zip', MAX_ARCHIVE_BYTES))).toBeNull();
    expect(validateArchiveFile(file('a.zip', MAX_ARCHIVE_BYTES + 1))).toBe('too-large');
  });

  it('reports the type problem first for a large non-ZIP file', () => {
    expect(validateArchiveFile(file('movie.mp4', MAX_ARCHIVE_BYTES * 2))).toBe('not-a-zip');
  });

  it('accepts an empty .zip here; its content is checked when it is opened', () => {
    expect(validateArchiveFile(file('empty.zip', 0))).toBeNull();
  });
});
