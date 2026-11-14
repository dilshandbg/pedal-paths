import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_KM,
  haversineDistanceKm,
  isValidLatitude,
  isValidLongitude,
} from '@/utils/geo';

const ONE_DEGREE_KM = (Math.PI * EARTH_RADIUS_KM) / 180; // ≈ 111.195 km

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    const point = { latitude: 51.5074, longitude: -0.1278 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it('measures one degree of latitude along a meridian', () => {
    const distance = haversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    );
    expect(distance).toBeCloseTo(ONE_DEGREE_KM, 6);
    expect(distance).toBeCloseTo(111.195, 2);
  });

  it('takes the short way across the antimeridian', () => {
    const distance = haversineDistanceKm(
      { latitude: 0, longitude: 179.5 },
      { latitude: 0, longitude: -179.5 },
    );
    expect(distance).toBeCloseTo(ONE_DEGREE_KM, 6);
  });

  it('matches the known London → Paris great-circle distance (~343.5 km)', () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const distance = haversineDistanceKm(london, paris);
    expect(distance).toBeGreaterThan(343);
    expect(distance).toBeLessThan(344.5);
  });

  it('is symmetric', () => {
    const a = { latitude: 6.9271, longitude: 79.8612 };
    const b = { latitude: 7.2906, longitude: 80.6337 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });

  it('returns half the Earth circumference for antipodal points', () => {
    const distance = haversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 },
    );
    expect(distance).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 6);
  });
});

describe('coordinate validation', () => {
  it.each([-90, 0, 45.5, 90])('accepts latitude %s', (value) => {
    expect(isValidLatitude(value)).toBe(true);
  });

  it.each([-90.0001, 90.0001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects latitude %s',
    (value) => {
      expect(isValidLatitude(value)).toBe(false);
    },
  );

  it.each([-180, 0, 179.9999, 180])('accepts longitude %s', (value) => {
    expect(isValidLongitude(value)).toBe(true);
  });

  it.each([-180.0001, 180.0001, Number.NaN, Number.NEGATIVE_INFINITY])(
    'rejects longitude %s',
    (value) => {
      expect(isValidLongitude(value)).toBe(false);
    },
  );
});
