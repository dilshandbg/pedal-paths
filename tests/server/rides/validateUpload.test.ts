// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { encodeRideBundle } from '../../../src/services/ride-history/rideBundle';
import { encodeTrack } from '../../../src/services/ride-history/trackCodec';
import { UPLOAD_LIMITS, validateUploadBundle } from '../../../server/rides/validateUpload';
import { details, newUpload, ride, track, upload, uploadBody } from '../rideFixtures';

const problemsOf = (bytes: Uint8Array) => {
  const result = validateUploadBundle(bytes);
  return result.ok ? [] : result.problems;
};

const withUpload = (patch: Record<string, unknown>) =>
  encodeRideBundle({ upload: { ...newUpload(1), ...patch } }, [
    { details: details('1'), track: encodeTrack(track()) },
  ]);

const withDetails = (patch: Record<string, unknown>) =>
  encodeRideBundle({ upload: newUpload(1) }, [
    { details: { ...details('1'), ...patch } as never, track: encodeTrack(track()) },
  ]);

describe('NFR-08: upload validation', () => {
  it('accepts a valid upload and decodes its tracks', () => {
    const input = upload(1, [ride('1'), ride('2', { distanceKm: null, movingTimeS: null })]);

    const result = validateUploadBundle(uploadBody(input));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.upload).toEqual(input.upload);
    expect(result.value.rides.map((r) => r.details)).toEqual(input.rides.map((r) => r.details));
    expect(result.value.rides[0]?.points).toEqual(input.rides[0]?.points);
  });

  it('normalizes the start date to UTC', () => {
    const result = validateUploadBundle(withDetails({ activityDate: '2024-03-10T09:00:00+02:00' }));

    expect(result.ok && result.value.rides[0]?.details.activityDate).toBe(
      '2024-03-10T07:00:00.000Z',
    );
  });

  it('rejects a body that is not a ride bundle', () => {
    expect(problemsOf(new TextEncoder().encode('{"upload":{}}'))).toEqual(['Not a ride bundle.']);
  });

  it('rejects missing or invalid registry details', () => {
    expect(problemsOf(encodeRideBundle({}, []))).toEqual([
      'meta.upload is missing.',
      'An upload needs at least one ride.',
    ]);
    expect(problemsOf(withUpload({ fileHash: 'ABC' }))).toEqual([
      'upload.fileHash must be a lowercase hex SHA-256.',
    ]);
    expect(problemsOf(withUpload({ fileName: '' }))).toHaveLength(1);
    expect(problemsOf(withUpload({ fileName: 'a\u0000.zip' }))).toHaveLength(1);
    expect(problemsOf(withUpload({ fileName: 'x'.repeat(256) }))).toHaveLength(1);
    expect(problemsOf(withUpload({ fileSizeBytes: -1 }))).toHaveLength(1);
    expect(problemsOf(withUpload({ skippedCount: 1.5 }))).toHaveLength(1);
    expect(problemsOf(withUpload({ excludedNonRideCount: '2' }))).toHaveLength(1);
  });

  it('rejects invalid ride details, naming the ride', () => {
    expect(problemsOf(withDetails({ activityId: '' }))).toEqual([
      'rides[0].activityId must be 1–64 printable characters.',
    ]);
    expect(problemsOf(withDetails({ activityDate: '10/03/2024' }))).toEqual([
      'rides[0].activityDate must be an ISO 8601 date-time.',
    ]);
    expect(problemsOf(withDetails({ distanceKm: -1 }))).toEqual([
      'rides[0].distanceKm must be null or a number ≥ 0.',
    ]);
    expect(problemsOf(withDetails({ movingTimeS: 'long' }))).toHaveLength(1);
    expect(problemsOf(withDetails({ elevationGainM: undefined }))).toHaveLength(1);
    expect(problemsOf(withDetails({ activityName: 42 }))).toHaveLength(1);
  });

  it('rejects tracks that do not decode or have fewer than 2 points', () => {
    const body = encodeRideBundle({ upload: newUpload(1) }, [
      { details: details('1'), track: new Uint8Array([1, 2, 3]) },
      { details: details('2'), track: encodeTrack(track(10, 20, 1)) },
    ]);

    expect(problemsOf(body)).toEqual([
      'rides[0] track: Track is too short.',
      'rides[1] track needs at least 2 points.',
    ]);
  });

  it(`reports at most ${UPLOAD_LIMITS.reportedProblems} problems`, () => {
    const rides = Array.from({ length: 150 }, (_, i) => ({
      details: details(String(i), { distanceKm: -1 }),
      track: encodeTrack(track()),
    }));

    expect(problemsOf(encodeRideBundle({ upload: newUpload(1) }, rides))).toHaveLength(
      UPLOAD_LIMITS.reportedProblems,
    );
  });
});
