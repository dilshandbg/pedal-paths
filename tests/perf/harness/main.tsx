import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MapView } from '@/components/map/MapView';
import { importStravaArchive } from '@/features/activities/services/importStravaArchive';
import { aggregateHeatMap } from '@/features/heatmap/services/aggregateHeatMap';
import { buildHeatMapGeometry } from '@/features/heatmap/services/buildHeatMapGeometry';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import type { ActivityId, CyclingActivity, HeatMapData, SegmentIndex } from '@/types';
import { buildScenario, type ScenarioName } from './scenarios';

/**
 * NFR-02 benchmark page (ADR-0006), driven by `tests/perf/run.mjs`. It runs the app's real heat map
 * pipeline — aggregation, deck.gl layers, MapLibre map — and times each filter change from the
 * change to the next drawn frame. The base map is a blank local style: no network.
 */

export interface StepResult {
  readonly name: string;
  readonly rides: number;
  readonly aggregateMs: number;
  readonly frameMs: number;
}

export interface BenchmarkResult {
  readonly label: string;
  readonly rides: number;
  readonly segments: number;
  readonly prepareMs: number;
  readonly renderer: string;
  readonly steps: readonly StepResult[];
}

const BLANK_STYLE = URL.createObjectURL(
  new Blob(
    [
      JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef' } }],
      }),
    ],
    { type: 'application/json' },
  ),
);

const root = createRoot(document.getElementById('root') as HTMLElement);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Filter selections like a user's: whole years, one month across years, one ride left out. */
function selections(activities: readonly CyclingActivity[]): [string, ActivityId[]][] {
  const ids = (list: readonly CyclingActivity[]) => list.map((activity) => activity.activityId);
  const years = [...new Set(activities.map((activity) => activity.year))].sort((a, b) => b - a);
  const latest = years[0];
  const recent = new Set(years.slice(0, Math.max(1, Math.ceil(years.length / 2))));
  const monthCounts = new Map<number, number>();
  for (const activity of activities) {
    monthCounts.set(activity.month, (monthCounts.get(activity.month) ?? 0) + 1);
  }
  const busiestMonth = [...monthCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const all = ids(activities);

  return [
    ['latest year', ids(activities.filter((activity) => activity.year === latest))],
    ['all rides', all],
    ['one month, all years', ids(activities.filter((activity) => activity.month === busiestMonth))],
    ['half of the years', ids(activities.filter((activity) => recent.has(activity.year)))],
    ['one ride deselected', all.slice(1)],
    ['all rides again', all],
  ];
}

function webGlRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

async function measure(label: string, activities: CyclingActivity[]): Promise<BenchmarkResult> {
  let started = performance.now();
  const index: SegmentIndex = buildSegmentIndex(activities);
  const geometry = buildHeatMapGeometry(index);
  const prepareMs = performance.now() - started;

  const bounds = computeBounds(activities);
  const show = (data: HeatMapData) =>
    flushSync(() => root.render(<MapView styleUrl={BLANK_STYLE} data={data} fitBounds={bounds} />));

  const steps = selections(activities);
  const all = activities.map((activity) => activity.activityId);
  show(aggregateHeatMap(index, geometry, all));
  await wait(2000); // map, style and the fit-to-rides animation

  // Warm-up: the first change compiles shaders; it is not what a user feels on every click.
  show(aggregateHeatMap(index, geometry, steps[0]?.[1] ?? all));
  await nextFrame();
  show(aggregateHeatMap(index, geometry, all));
  await nextFrame();
  await wait(300);

  const results: StepResult[] = [];
  for (const [name, ids] of steps) {
    started = performance.now();
    const data = aggregateHeatMap(index, geometry, ids);
    const aggregated = performance.now();
    show(data);
    await nextFrame();
    await nextFrame();
    results.push({
      name,
      rides: data.activityIds.length,
      aggregateMs: Math.round(aggregated - started),
      frameMs: Math.round(performance.now() - started),
    });
    await wait(300);
  }

  return {
    label,
    rides: activities.length,
    segments: geometry.segmentCount,
    prepareMs: Math.round(prepareMs),
    renderer: webGlRenderer(),
    steps: results,
  };
}

async function synthetic(name: ScenarioName, rides: number): Promise<BenchmarkResult> {
  return measure(name, buildScenario(name, rides));
}

/** Imports a local Strava export through the app's own importer (served by the runner). */
async function zip(url: string): Promise<BenchmarkResult> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not read the export (${response.status})`);
  }
  const result = await importStravaArchive(response.body);
  if (!result.ok) {
    throw new Error(`The export could not be imported: ${result.reason}`);
  }
  return measure('your export', [...result.activities]);
}

(window as unknown as { benchmark: object }).benchmark = { synthetic, zip };
document.title = 'ready';
