import type { Coordinate } from '@/types';

/**
 * Decodes an encoded polyline (the common algorithm, precision 5, as used for Strava `map.polyline`
 * values; see ADR-0010). Returns null for malformed input: characters outside the encoding's range,
 * a truncated value, or a result outside valid latitude/longitude.
 */
export function decodePolyline(encoded: string, precision = 5): Coordinate[] | null {
  const factor = 10 ** precision;
  const points: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
      if (shift > 30) return null;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return null;
    latitude += dLat;
    longitude += dLng;
    const point = { latitude: latitude / factor, longitude: longitude / factor };
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
    points.push(point);
  }
  return points;
}
