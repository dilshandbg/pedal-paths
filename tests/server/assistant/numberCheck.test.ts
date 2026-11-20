// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inventedNumbers, mentions, numbersIn } from '../../../server/assistant/numberCheck';

const none = { texts: [], toolResults: [] };

describe('RULE-25 / AC-55: reading numbers in an answer', () => {
  it('reads numbers but not dates or thousands separators', () => {
    expect(numbersIn('On 2019-03-01 you rode 2,104.6 km in 7 rides (12.5%).')).toEqual([
      2104.6, 7, 12.5,
    ]);
  });

  it('reads nothing from a text without numbers', () => {
    expect(numbersIn('No rides there.')).toEqual([]);
  });

  it('finds a value also when written rounded', () => {
    expect(mentions('About 487 km', 487.3)).toBe(true);
    expect(mentions('About 480 km', 487.3)).toBe(false);
  });
});

describe('RULE-25 / AC-55: traceable numbers', () => {
  const toolResults = [
    JSON.stringify({
      months: [
        { distanceKm: 487.3, rides: 7 },
        { distanceKm: 312.8, rides: 5 },
        { distanceKm: 655.1, rides: 9 },
      ],
    }),
  ];
  const sources = { texts: ['How far did I ride in 2019?'], toolResults };

  it('allows tool results, rounded or absolute, and numbers from the question', () => {
    expect(inventedNumbers('487.3 km, about 313 km and 655.1 km in 2019.', sources)).toEqual([]);
    expect(
      inventedNumbers('649.4 less (31%).', {
        texts: [],
        toolResults: [JSON.stringify({ difference: -649.4, percentChange: -30.86 })],
      }),
    ).toEqual([]);
  });

  it('allows the total of a list column and the difference of two of its values', () => {
    // 487.3 + 312.8 + 655.1 = 1455.2; 655.1 − 312.8 = 342.3; 7 + 5 + 9 = 21.
    expect(inventedNumbers('1,455.2 km in 21 rides; June was 342.3 km more.', sources)).toEqual([]);
  });

  it('allows unit conversions given by the field unit', () => {
    const results = [
      JSON.stringify({
        distanceKm: 2.5,
        elevationGainM: 1250,
        movingTimeS: 5400,
        movingTimeH: 1.5,
        newestRides: [{ closestM: 20 }],
      }),
    ];
    const answer = '2,500 m, 1.25 km of climbing, 90 minutes, 1.5 hours, 0.02 km.';
    expect(inventedNumbers(answer, { texts: [], toolResults: results })).toEqual([]);
  });

  it('allows metres and kilometres converted from the question', () => {
    expect(
      inventedNumbers('Within 0.2 km: 17 rides.', {
        texts: ['How many rides passed within 200 m?'],
        toolResults: [JSON.stringify({ visitCount: 17 })],
      }),
    ).toEqual([]);
  });

  it('does not convert a number without a unit', () => {
    expect(
      inventedNumbers('That is 17,000 of something.', {
        texts: [],
        toolResults: [JSON.stringify({ visitCount: 17 })],
      }),
    ).toEqual([17000]);
  });

  it('flags every other number, once, in order', () => {
    expect(inventedNumbers('You rode 1,234.5 km, burnt 900 kcal, and 900 again.', sources)).toEqual(
      [1234.5, 900],
    );
  });

  it('allows whole numbers up to 12, but not 13 or fractions', () => {
    expect(inventedNumbers('Over 3 months, 12 weeks.', none)).toEqual([]);
    expect(inventedNumbers('Over 13 weeks and 2.5 days.', none)).toEqual([13, 2.5]);
  });

  it('reads a tool result that is not JSON as text', () => {
    expect(inventedNumbers('42 km.', { texts: [], toolResults: ['42 km'] })).toEqual([]);
  });
});
