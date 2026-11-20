/*
 * Traceable numbers (RULE-25, AC-55, OD-38). A number in an answer is traceable when it comes from
 * a trusted source — the question, the system prompt or a tool result — directly or through one of
 * the derivations defined here. Everything else is untraceable: the model evaluation fails a case
 * with it, and a normal answer is flagged.
 *
 * Defined derivations of a trusted number:
 * - rounding to 0, 1 or 2 decimals, and the absolute value;
 * - for a list in a tool result: the total of a numeric column, and the difference of two values
 *   in the same column;
 * - unit conversions given by a field's unit suffix: `…M` metres → km, `…Km` km → m, `…S` seconds
 *   → minutes and hours, `…H` hours → minutes; in a text, a number followed by `m` or `km`.
 * Whole numbers up to 12 (months, small counts) are always allowed.
 */

/** Whole numbers up to this are always allowed. */
export const SMALL_WHOLE_NUMBER_MAX = 12;

/** Numbers written in a text, without ISO dates (`2019-03-01`) and thousands separators. */
export function numbersIn(text: string): number[] {
  const cleaned = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/(\d),(?=\d{3}\b)/g, '$1');
  return [...cleaned.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

const roundings = (v: number) => {
  const a = Math.abs(v);
  return [v, a, Math.round(a), Math.round(a * 10) / 10, Math.round(a * 100) / 100];
};

/** The unit conversions of a value in a field, by the field name's unit suffix. */
function conversions(key: string, value: number): number[] {
  if (/Km$/.test(key)) return [value * 1000];
  if (/[a-z]M$/.test(key)) return [value / 1000];
  if (/[a-z]S$/.test(key)) return [value / 60, value / 3600];
  if (/[a-z]H$/.test(key)) return [value * 60];
  return [];
}

/** Trusted numbers in a JSON value, with the list totals, differences and unit conversions. */
function numbersInJson(value: unknown, key: string, into: number[]): void {
  if (typeof value === 'number') {
    into.push(value, ...conversions(key, value));
  } else if (typeof value === 'string') {
    into.push(...(value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  } else if (Array.isArray(value)) {
    value.forEach((item) => numbersInJson(item, key, into));
    const columns = new Set(
      value.flatMap((item) => (item && typeof item === 'object' ? Object.keys(item) : [])),
    );
    for (const column of columns) {
      const values = value.map((item) => (item as Record<string, unknown>)?.[column]);
      if (!values.every((v): v is number => typeof v === 'number')) continue;
      const total = values.reduce((a, b) => a + b, 0);
      into.push(total, ...conversions(column, total));
      for (let i = 0; i < values.length; i += 1) {
        for (let j = i + 1; j < values.length; j += 1) {
          const difference = Math.abs(values[i]! - values[j]!); // i, j < values.length
          into.push(difference, ...conversions(column, difference));
        }
      }
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) numbersInJson(v, k, into);
  }
}

/** Numbers in a text, with metres and kilometres converted when a unit follows them. */
function numbersInText(text: string): number[] {
  const found = numbersIn(text);
  const cleaned = text.replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const match of cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(km|m)\b/gi)) {
    const v = Number(match[1]);
    found.push(match[2]?.toLowerCase() === 'km' ? v * 1000 : v / 1000);
  }
  return found;
}

export interface NumberSources {
  /** Trusted texts: the question, the system prompt, earlier questions. */
  readonly texts: readonly string[];
  /** Tool results as sent to the model (JSON). */
  readonly toolResults: readonly string[];
}

/** Every number an answer may contain, given its sources. */
export function traceableNumbers(sources: NumberSources): ReadonlySet<number> {
  const allowed = new Set<number>();
  const add = (v: number) => roundings(v).forEach((r) => allowed.add(r));
  sources.texts.forEach((text) => numbersInText(text).forEach(add));
  for (const result of sources.toolResults) {
    const found: number[] = [];
    try {
      numbersInJson(JSON.parse(result), '', found);
    } catch {
      found.push(...numbersInText(result));
    }
    found.forEach(add);
  }
  return allowed;
}

/** Numbers in an answer that cannot be traced to its sources (RULE-25), in order, once each. */
// Implements: RULE-25, AC-55
export function inventedNumbers(answer: string, sources: NumberSources): number[] {
  const allowed = traceableNumbers(sources);
  return [...new Set(numbersIn(answer))].filter(
    (n) => !(Number.isInteger(n) && n <= SMALL_WHOLE_NUMBER_MAX) && !allowed.has(n),
  );
}

/** Whether an answer mentions a value, also rounded or as an absolute value. */
export function mentions(answer: string, value: number): boolean {
  const written = new Set(numbersIn(answer));
  return roundings(value).some((r) => written.has(r));
}
