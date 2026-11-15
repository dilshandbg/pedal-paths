import { describe, expect, it } from 'vitest';
import { decodePolyline } from '@/utils/polyline';

describe('decodePolyline', () => {
  it('decodes the reference example of the encoded polyline algorithm', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it('decodes an empty string to no points', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('rejects malformed input', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq')).toBeNull(); // truncated
    expect(decodePolyline('not a polyline \u0001')).toBeNull(); // outside the alphabet
    expect(decodePolyline('_p~iF')).toBeNull(); // latitude without longitude
  });

  it('rejects values outside valid latitude/longitude', () => {
    expect(decodePolyline('~~~~~~')).toBeNull();
  });
});
