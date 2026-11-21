import { comparePeriods } from '../../src/features/analytics/services/comparePeriods';
import type { ModelEvaluation, ModelEvaluationCase } from '../../src/types/assistant';
import type { DateRange, MonthTotals, YearTotals } from '../../src/types/analytics';
import type { RideAnalytics } from '../analytics/rideAnalytics';
import type { LLMProvider } from './llm/types';
import { inventedNumbers, mentions } from './numberCheck';
import {
  checkModel,
  DEFAULT_LIMITS,
  runTurn,
  type AssistantLimits,
  type ModelCheck,
} from './orchestrator';
import { buildSystemPrompt } from './systemPrompt';
import { createAnalyticsTools, type AssistantTool } from './tools/analyticsTools';

/*
 * Model evaluation (BR-43, OD-38). A model is suitable for the assistant only if it passes every
 * case. Each case asks a fixed question about a SYNTHETIC history through the real tools and the
 * real turn loop, then checks:
 *
 * - tool selection: the expected analytics were called; an extra call to another tool is accepted
 *   only when it is valid (a known tool with valid arguments);
 * - argument generation: the arguments match the question and pass validation;
 * - use of results: the answer contains the tool results the question asked for;
 * - invented results: the answer contains no number that is not in the question or a tool result.
 *
 * Everything runs locally on the user's model; the synthetic data is not the user's.
 */

/**
 * The version of the evaluation suite. Raise it whenever a case, its checks or the number rules
 * change: saved results of another version no longer count (OD-38).
 */
// 2: runs at temperature 0. 3: valid extra tool calls are accepted.
export const EVALUATION_SUITE_VERSION = 3;

/**
 * The test asks for temperature 0 (greedy sampling), so testing the same model version again gives
 * the same result instead of passing or failing by chance. Ride questions keep the model's default.
 */
export const EVALUATION_TEMPERATURE = 0;

// --- The synthetic history -----------------------------------------------------------------------

const H = 3600;
const month = (m: MonthTotals['month'], rides: number, km: number, gain: number, hours: number) =>
  ({
    year: 2019,
    month: m,
    rideCount: rides,
    distanceKm: km,
    elevationGainM: gain,
    movingTimeS: hours * H,
    ridesWithoutDistance: 0,
  }) satisfies MonthTotals;
const year = (y: number, rides: number, km: number, gain: number, hours: number) =>
  ({
    year: y,
    rideCount: rides,
    distanceKm: km,
    elevationGainM: gain,
    movingTimeS: hours * H,
    ridesWithoutDistance: 0,
  }) satisfies YearTotals;

/** 2019 by month; the months add up to the 2019 year total. Values chosen to be unguessable. */
const MONTHS = [
  month(3, 7, 487.3, 3120, 21.6),
  month(4, 5, 312.8, 1985, 13.9),
  month(6, 9, 655.1, 4410, 28.7),
];
const YEARS = [year(2018, 41, 2104.6, 15230, 92.4), year(2019, 21, 1455.2, 9515, 64.2)];
const PLACE = { latitude: 52.4009, longitude: 13.0591 };
const VISITS = 17;

const overlaps = (start: string, end: string, range: DateRange) =>
  (range.to === null || start <= range.to) && (range.from === null || end >= range.from);
const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = (m: MonthTotals) => `${m.year}-${pad(m.month)}-01`;
const monthEnd = (m: MonthTotals) =>
  `${m.year}-${pad(m.month)}-${m.month === 4 || m.month === 6 ? 30 : 31}`;
/** Whole years inside a range: the synthetic history is only known per year outside 2019. */
const yearsWithin = (range: DateRange) =>
  YEARS.filter(
    (y) =>
      (range.from === null || range.from <= `${y.year}-01-01`) &&
      (range.to === null || range.to >= `${y.year}-12-31`),
  );
const nearPlace = (latitude: number, longitude: number) =>
  Math.abs(latitude - PLACE.latitude) < 0.002 && Math.abs(longitude - PLACE.longitude) < 0.003;

/** A fixed, synthetic `RideAnalytics` the evaluation questions are about. */
export const SYNTHETIC_ANALYTICS: RideAnalytics = {
  distanceByMonth: (range) => MONTHS.filter((m) => overlaps(monthStart(m), monthEnd(m), range)),
  distanceByYear: (range) =>
    YEARS.filter((y) => overlaps(`${y.year}-01-01`, `${y.year}-12-31`, range)),
  locationVisits: (query) => {
    const rides = nearPlace(query.latitude, query.longitude)
      ? Array.from({ length: VISITS }, (_, i) => ({
          activityId: `synthetic-${i + 1}`,
          activityName: `Evening loop ${i + 1}`,
          activityDate: `2019-${pad(3 + Math.floor(i / 6))}-${pad(1 + (i % 6) * 4)}T17:00:00.000Z`,
          closestM: 20 + i,
        }))
      : [];
    return {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusM: query.radiusM,
      visitCount: rides.length,
      rides,
    };
  },
  routeFrequency: ({ bounds }) =>
    bounds.south <= PLACE.latitude &&
    bounds.north >= PLACE.latitude &&
    bounds.west <= PLACE.longitude &&
    bounds.east >= PLACE.longitude
      ? [
          { latitude: 52.4005, longitude: 13.0595, rideCount: 23 },
          { latitude: 52.4015, longitude: 13.0585, rideCount: 19 },
          { latitude: 52.4025, longitude: 13.0575, rideCount: 11 },
        ]
      : [],
  comparePeriods: ({ metric, periodA, periodB, location }) =>
    comparePeriods(metric, periodA, periodB, (range) => {
      if (metric === 'locationVisits') {
        return location &&
          nearPlace(location.latitude, location.longitude) &&
          overlaps('2019-03-01', '2019-05-21', range)
          ? VISITS
          : 0;
      }
      return yearsWithin(range).reduce((sum, y) => sum + y[metric], 0);
    }),
};

const SYNTHETIC_HISTORY = {
  rideCount: 62,
  firstRideDate: '2018-01-06',
  lastRideDate: '2019-06-29',
};
const EVALUATION_TODAY = '2020-01-15';
const EVALUATION_TIME_ZONE = 'UTC';

// --- Checking answers ----------------------------------------------------------------------------

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly ok: boolean;
}

interface Trace {
  readonly calls: readonly Call[];
  readonly answer: string;
  readonly toolResults: readonly string[];
  readonly failed: string | null;
}

interface EvaluationCaseSpec {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  /** Tools a correct answer uses; a call to any other tool must at least be valid. */
  readonly allowedTools: readonly string[];
  /** Problems with the calls (selection and arguments); empty when right. */
  checkCalls(calls: readonly Call[]): string[];
  /** Problems with how the results were used; empty when right. */
  checkAnswer(answer: string): string[];
}

const isFullYear = (from: unknown, to: unknown, y: number) =>
  from === `${y}-01-01` && to === `${y}-12-31`;
const near = (value: unknown, target: number, tolerance: number) =>
  typeof value === 'number' && Math.abs(value - target) <= tolerance;
const okCalls = (calls: readonly Call[], name: string) =>
  calls.filter((c) => c.ok && c.name === name);

/** The required evaluation cases (OD-38). A model must pass all of them. */
export const EVALUATION_CASES: readonly EvaluationCaseSpec[] = [
  {
    id: 'monthly-distance',
    title: 'Distance per month (tool choice, dates, results used)',
    question: 'How far did I ride in each month of 2019?',
    allowedTools: ['distance_by_month'],
    checkCalls: (calls) => {
      const monthly = okCalls(calls, 'distance_by_month');
      if (monthly.length === 0) return ['It did not call distance_by_month with valid arguments.'];
      return monthly.some((c) => isFullYear(c.args.from, c.args.to, 2019))
        ? []
        : ['It did not ask for 2019-01-01 to 2019-12-31.'];
    },
    checkAnswer: (answer) =>
      [487.3, 312.8, 655.1].every((km) => mentions(answer, km))
        ? []
        : ['The answer does not give the monthly distances from the tool result.'],
  },
  {
    id: 'location-visits',
    title: 'Visits to a place (coordinates and radius)',
    question: 'How many of my rides passed within 200 m of 52.40090, 13.05910?',
    allowedTools: ['location_visits'],
    checkCalls: (calls) => {
      const visits = okCalls(calls, 'location_visits');
      if (visits.length === 0) return ['It did not call location_visits with valid arguments.'];
      return visits.some(
        (c) =>
          near(c.args.lat, 52.4009, 0.0005) &&
          near(c.args.lng, 13.0591, 0.0005) &&
          near(c.args.radiusM, 200, 0),
      )
        ? []
        : ['It did not pass the place (52.40090, 13.05910) and the radius (200 m) correctly.'];
    },
    checkAnswer: (answer) =>
      mentions(answer, VISITS)
        ? []
        : ['The answer does not give the visit count from the tool result.'],
  },
  {
    id: 'compare-years',
    title: 'Comparison of two years',
    question: 'Compare my total distance in 2018 with 2019.',
    allowedTools: ['compare_periods', 'distance_by_year'],
    checkCalls: (calls) => {
      const compared = okCalls(calls, 'compare_periods').some(
        (c) =>
          c.args.metric === 'distanceKm' &&
          ((isFullYear(c.args.aFrom, c.args.aTo, 2018) &&
            isFullYear(c.args.bFrom, c.args.bTo, 2019)) ||
            (isFullYear(c.args.aFrom, c.args.aTo, 2019) &&
              isFullYear(c.args.bFrom, c.args.bTo, 2018))),
      );
      const yearly = okCalls(calls, 'distance_by_year').some(
        (c) =>
          (c.args.from === undefined ||
            c.args.from === null ||
            String(c.args.from) <= '2018-01-01') &&
          (c.args.to === undefined || c.args.to === null || String(c.args.to) >= '2019-12-31'),
      );
      return compared || yearly
        ? []
        : ['It did not compare 2018 with 2019 (whole years, distance).'];
    },
    checkAnswer: (answer) =>
      (mentions(answer, 2104.6) && mentions(answer, 1455.2)) || mentions(answer, 649.4)
        ? []
        : ['The answer does not give the distances or the difference from the tool result.'],
  },
  {
    id: 'unanswerable',
    title: 'A question the analytics cannot answer',
    question: 'What was my average heart rate on my rides in 2019?',
    allowedTools: [
      'distance_by_month',
      'distance_by_year',
      'location_visits',
      'route_frequency',
      'compare_periods',
    ],
    checkCalls: () => [],
    checkAnswer: () => [], // inventing a heart rate is caught by the invented-number check
  },
];

function judge(
  spec: EvaluationCaseSpec,
  trace: Trace,
  context: readonly string[],
): ModelEvaluationCase {
  const problems: string[] = [];
  if (trace.failed !== null) problems.push(trace.failed);
  // Extra calls to other analytics are accepted when valid: the tools only read (owner decision
  // 2026-11-20, OD-38). A failed extra call (unknown tool, invalid arguments) is incorrect use.
  const incorrect = [
    ...new Set(
      trace.calls.filter((c) => !c.ok && !spec.allowedTools.includes(c.name)).map((c) => c.name),
    ),
  ];
  if (incorrect.length > 0)
    problems.push(
      `It used tools incorrectly (unknown tool or invalid arguments): ${incorrect.join(', ')}.`,
    );
  // Tool selection and arguments are judged even when the answer then failed.
  problems.push(...spec.checkCalls(trace.calls));
  if (trace.failed === null) {
    if (trace.answer.trim() === '') problems.push('It gave no answer.');
    else problems.push(...spec.checkAnswer(trace.answer));
    const invented = inventedNumbers(trace.answer, {
      texts: [spec.question, ...context],
      toolResults: trace.toolResults,
    });
    if (invented.length > 0)
      problems.push(
        `The answer contains numbers that are not in any tool result: ${invented.join(', ')}.`,
      );
  }
  return { id: spec.id, title: spec.title, passed: problems.length === 0, problems };
}

/** Records every result the tools return, for the invented-number check. */
function recording(tools: readonly AssistantTool[], results: string[]): AssistantTool[] {
  return tools.map((tool) => ({
    ...tool,
    run(args) {
      const run = tool.run(args);
      results.push(run.content);
      return run;
    },
  }));
}

export interface EvaluateInput {
  readonly provider: LLMProvider;
  readonly model: string;
  readonly signal: AbortSignal;
  readonly limits?: Partial<AssistantLimits>;
  readonly clock?: () => Date;
  readonly cases?: readonly EvaluationCaseSpec[];
}

export type EvaluationOutcome =
  | { readonly ok: true; readonly evaluation: ModelEvaluation }
  | { readonly ok: false; readonly code: Extract<ModelCheck, { ok: false }>['code'] | 'cancelled' };

/** Runs the evaluation cases on a model (BR-43). Generates on the local model only. */
// Implements: BR-43, AC-50
export async function evaluateModel(input: EvaluateInput): Promise<EvaluationOutcome> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const check = await checkModel(input.provider, input.model, limits, input.signal);
  if (!check.ok) return check;
  const system = buildSystemPrompt({
    today: EVALUATION_TODAY,
    timeZone: EVALUATION_TIME_ZONE,
    history: SYNTHETIC_HISTORY,
  });
  const baseTools = createAnalyticsTools(SYNTHETIC_ANALYTICS, { timeZone: EVALUATION_TIME_ZONE });
  const cases: ModelEvaluationCase[] = [];
  for (const spec of input.cases ?? EVALUATION_CASES) {
    const results: string[] = [];
    const calls: Call[] = [];
    let answer = '';
    let failed: string | null = null;
    for await (const event of runTurn({
      provider: input.provider,
      model: check.model,
      tools: recording(baseTools, results),
      system,
      history: [],
      question: spec.question,
      limits,
      signal: input.signal,
      temperature: EVALUATION_TEMPERATURE,
    })) {
      if (event.type === 'text') answer += event.delta;
      else if (event.type === 'tool') {
        const args =
          event.use.arguments && typeof event.use.arguments === 'object'
            ? (event.use.arguments as Record<string, unknown>)
            : {};
        calls.push({ name: event.use.name, args, ok: event.use.ok });
      } else if (event.type === 'error') failed = `It failed: ${event.message}`;
      else if (event.type === 'done' && event.reason === 'cancelled')
        return { ok: false, code: 'cancelled' };
    }
    cases.push(judge(spec, { calls, answer, toolResults: results, failed }, [system]));
  }
  return {
    ok: true,
    evaluation: {
      model: check.model.id,
      revision: check.model.revision,
      suiteVersion: EVALUATION_SUITE_VERSION,
      passed: cases.every((c) => c.passed),
      evaluatedAt: (input.clock ?? (() => new Date()))().toISOString(),
      cases,
    },
  };
}
