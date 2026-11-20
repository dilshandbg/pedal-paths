// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createConversationStore } from '../../../server/assistant/conversations';
import { buildSystemPrompt, summarizeHistory } from '../../../server/assistant/systemPrompt';

describe('OD-33: conversations are kept in memory only', () => {
  it('creates, appends to and removes conversations', () => {
    const store = createConversationStore();
    const id = store.create();
    expect(store.messages(id)).toEqual([]);
    expect(store.append(id, [{ role: 'user', text: 'Hi' }])).toBe(true);
    expect(store.messages(id)).toEqual([{ role: 'user', text: 'Hi' }]);
    store.remove(id);
    expect(store.has(id)).toBe(false);
    expect(store.append(id, [])).toBe(false);
  });

  it('keeps at most the limit, dropping the least recently used', () => {
    let n = 0;
    const store = createConversationStore(2, () => `c${(n += 1)}`);
    const a = store.create();
    const b = store.create();
    store.messages(a); // a is now more recent than b
    const c = store.create();
    expect([store.has(a), store.has(b), store.has(c)]).toEqual([true, false, true]);
  });

  it('never drops a conversation that is answering', () => {
    let n = 0;
    const store = createConversationStore(1, () => `c${(n += 1)}`);
    const a = store.create();
    store.begin(a);
    store.create();
    expect(store.has(a)).toBe(true);
  });

  it('allows one question at a time', () => {
    const store = createConversationStore();
    const id = store.create();
    expect(store.begin(id)).toBe(true);
    expect(store.begin(id)).toBe(false);
    store.end(id);
    expect(store.begin(id)).toBe(true);
    expect(store.begin('missing')).toBe(false);
  });
});

describe('RULE-25: the system prompt', () => {
  it('summarizes the history in the given time zone', () => {
    const ride = (activityDate: string) => ({
      activityId: activityDate,
      activityName: 'r',
      activityDate,
      distanceKm: 1,
      elevationGainM: 1,
      movingTimeS: 1,
    });
    expect(
      summarizeHistory(
        [ride('2024-06-01T08:00:00Z'), ride('2023-12-31T23:30:00Z')],
        'Europe/Berlin',
      ),
    ).toEqual({
      rideCount: 2,
      firstRideDate: '2024-01-01',
      lastRideDate: '2024-06-01',
    });
    expect(summarizeHistory([])).toEqual({ rideCount: 0, firstRideDate: null, lastRideDate: null });
  });

  it('forbids invented numbers and says when there are no rides', () => {
    const prompt = buildSystemPrompt({
      today: '2026-11-20',
      timeZone: 'Europe/Berlin',
      history: { rideCount: 0, firstRideDate: null, lastRideDate: null },
    });
    expect(prompt).toContain('Use only numbers from tool results');
    expect(prompt).toContain('say so plainly and do not give numbers');
    expect(prompt).toContain('No rides are stored yet.');
    expect(prompt).toContain('time zone Europe/Berlin. Today is 2026-11-20');
  });
});
