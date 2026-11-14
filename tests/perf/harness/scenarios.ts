import type { CyclingActivity, GPSPoint, Month } from '@/types';

/**
 * SYNTHETIC ride datasets for the NFR-02 benchmark (ADR-0006). Seeded, so every run draws the same
 * rides. Nothing here is real activity data.
 */
export type ScenarioName = 'random' | 'explorer' | 'commuter';

export const SCENARIOS: Readonly<Record<ScenarioName, string>> = {
  random: 'Random walks: almost no repeated roads (worst case)',
  explorer: 'Explorer: dense 150 m street grid, 20 home bases',
  commuter: 'Commuter: 400 m street grid, 5 home bases (repeated routes)',
};

const POINTS_PER_RIDE = 3600; // one hour at 1 point per second
const METRES_PER_DEGREE = 111_195;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function ride(index: number, gpsTrack: GPSPoint[]): CyclingActivity {
  return {
    activityId: `synthetic-${index}`,
    activityName: `Synthetic ride ${index}`,
    activityDate: '2024-01-01T08:00:00.000Z',
    year: 2016 + (index % 8), // 8 years, so "one year" selects ~1/8 of the rides
    month: ((index % 12) + 1) as Month,
    distanceKm: null,
    elevationGainM: null,
    gpsTrack,
  };
}

const point = (latitude: number, longitude: number): GPSPoint => ({
  latitude,
  longitude,
  elevation: null,
  timestamp: null,
});

function randomWalks(count: number): CyclingActivity[] {
  const random = seededRandom(7);
  return Array.from({ length: count }, (_, index) => {
    let latitude = 51.5 + (random() - 0.5) * 0.2;
    let longitude = -0.1 + (random() - 0.5) * 0.3;
    let heading = random() * 2 * Math.PI;
    const track: GPSPoint[] = [];
    for (let k = 0; k < POINTS_PER_RIDE; k += 1) {
      heading += (random() - 0.5) * 0.3;
      latitude += Math.cos(heading) * 0.00005;
      longitude += Math.sin(heading) * 0.00008;
      track.push(point(latitude, longitude));
    }
    return ride(index, track);
  });
}

/** Rides along a street grid from a few home bases, ~7 m/s with ±3 m GPS scatter. */
function streetGrid(count: number, blockM: number, bases: number, turnChance: number) {
  const random = seededRandom(11);
  const homes = Array.from({ length: bases }, () => [
    Math.floor((random() * 40_000) / blockM) * blockM,
    Math.floor((random() * 40_000) / blockM) * blockM,
  ]);
  const cosLat = Math.cos((51.4 * Math.PI) / 180);
  const step = 7;

  return Array.from({ length: count }, (_, index) => {
    const home = homes[index % homes.length] ?? [0, 0];
    let x = home[0] ?? 0;
    let y = home[1] ?? 0;
    let direction = Math.floor(random() * 4);
    const track: GPSPoint[] = [];
    for (let k = 0; k < POINTS_PER_RIDE; k += 1) {
      const atJunction = x % blockM < step && y % blockM < step;
      if (atJunction && random() < turnChance) {
        direction = (direction + (random() < 0.5 ? 1 : 3)) % 4;
      }
      if (direction === 0) x += step;
      else if (direction === 1) y += step;
      else if (direction === 2) x -= step;
      else y -= step;
      // Stay on the street being ridden.
      if (direction % 2 === 1) x = Math.round(x / blockM) * blockM;
      else y = Math.round(y / blockM) * blockM;
      const scatter = () => (random() - 0.5) * 6;
      track.push(
        point(
          51.4 + (y + scatter()) / METRES_PER_DEGREE,
          -0.3 + (x + scatter()) / METRES_PER_DEGREE / cosLat,
        ),
      );
    }
    return ride(index, track);
  });
}

export function buildScenario(name: ScenarioName, rides: number): CyclingActivity[] {
  switch (name) {
    case 'random':
      return randomWalks(rides);
    case 'explorer':
      return streetGrid(rides, 150, 20, 0.3);
    case 'commuter':
      return streetGrid(rides, 400, 5, 0.35);
  }
}
