import {
  DAILY_LOG,
  PAGE_SIZE,
  bodyFor,
  clockOf,
  dayKeyOf,
  dayLabel,
  flattenPages,
  isSearchable,
  kindFor,
  nextPageCursor,
  normalizeSearch,
  parseSelection,
  previewOf,
  sameSelection,
  sendProblem,
  serializeSelection,
  startsDay,
  wallClock,
} from './model';

describe('wallClock', () => {
  it('reads the day and time in Asia/Kolkata, not UTC', () => {
    // 20:30 UTC is 02:00 IST the next day.
    expect(wallClock('2026-09-03T20:30:00Z')).toEqual({ day: '2026-09-04', clock: '02:00' });
  });

  it('never prints midnight as 24:00', () => {
    // 18:30 UTC is exactly 00:00 IST.
    expect(clockOf('2026-09-03T18:30:00Z')).toBe('00:00');
    expect(dayKeyOf('2026-09-03T18:30:00Z')).toBe('2026-09-04');
  });

  it('is empty for garbage rather than throwing', () => {
    expect(wallClock('not a date')).toEqual({ day: '', clock: '' });
  });
});

describe('dayLabel', () => {
  const today = '2026-09-04'; // a Friday

  it('names today and yesterday', () => {
    expect(dayLabel('2026-09-04', today)).toBe('Today');
    expect(dayLabel('2026-09-03', today)).toBe('Yesterday');
  });

  it('uses the weekday inside the last week', () => {
    expect(dayLabel('2026-09-02', today)).toBe('Wednesday');
    expect(dayLabel('2026-08-29', today)).toBe('Saturday');
  });

  it('falls back to a date beyond a week, with the year only when it differs', () => {
    expect(dayLabel('2026-08-28', today)).toBe('Fri 28 Aug');
    expect(dayLabel('2025-12-31', today)).toBe('31 Dec 2025');
  });

  it('is empty for an empty key', () => {
    expect(dayLabel('', today)).toBe('');
  });
});

describe('startsDay', () => {
  // Newest first, as an inverted list holds them.
  const keys = ['2026-09-04', '2026-09-04', '2026-09-03', '2026-09-01'];

  it('marks the oldest row of each day', () => {
    expect(startsDay(keys, 0)).toBe(false); // a newer message on the same day as index 1
    expect(startsDay(keys, 1)).toBe(true); // first message of the 4th
    expect(startsDay(keys, 2)).toBe(true); // only message of the 3rd
    expect(startsDay(keys, 3)).toBe(true); // the oldest row always starts its day
  });

  it('is false off the end', () => {
    expect(startsDay(keys, 4)).toBe(false);
    expect(startsDay([], 0)).toBe(false);
  });
});

describe('pages', () => {
  const row = (id: string, created_at: string) => ({ id, created_at });

  it('cursors on the oldest row of a full page and stops on a short one', () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
      row(`m${i}`, `2026-09-04T10:${String(59 - i).padStart(2, '0')}:00Z`),
    );
    expect(nextPageCursor(full)).toBe('2026-09-04T10:10:00Z');
    expect(nextPageCursor(full.slice(0, 10))).toBeUndefined();
    expect(nextPageCursor([])).toBeUndefined();
  });

  it('flattens newest-first and drops a row seen twice', () => {
    const a = row('a', '2026-09-04T10:00:00Z');
    const b = row('b', '2026-09-04T09:00:00Z');
    const c = row('c', '2026-09-04T08:00:00Z');
    expect(flattenPages([[a, b], [b, c]])).toEqual([a, b, c]);
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe('sending', () => {
  it('is a voice message when a voice note is attached, whatever the text says', () => {
    expect(kindFor({ voiceNoteId: 'v1' })).toBe('voice');
    expect(kindFor({ voiceNoteId: 'v1', text: 'ignored' })).toBe('voice');
    expect(kindFor({ text: 'hello' })).toBe('text');
  });

  it('refuses a blank text message, the way body_matches_kind does', () => {
    expect(sendProblem({ text: '' })).not.toBeNull();
    expect(sendProblem({ text: '   \n' })).not.toBeNull();
    expect(sendProblem({})).not.toBeNull();
    expect(sendProblem({ text: 'a real thought' })).toBeNull();
  });

  it('lets a voice message through with no body', () => {
    expect(sendProblem({ voiceNoteId: 'v1' })).toBeNull();
  });

  it('caps the body length', () => {
    expect(sendProblem({ text: 'x'.repeat(4001) })).toMatch(/1 characters over/);
    expect(sendProblem({ text: 'x'.repeat(4000) })).toBeNull();
  });

  it('stores a trimmed body for text and none for voice', () => {
    expect(bodyFor({ text: '  hi there  ' })).toBe('hi there');
    expect(bodyFor({ voiceNoteId: 'v1', text: 'anything' })).toBeNull();
  });
});

describe('search', () => {
  it('collapses whitespace', () => {
    expect(normalizeSearch('  slept   badly \n again ')).toBe('slept badly again');
  });

  it('needs at least two characters', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' a ')).toBe(false);
    expect(isSearchable('ab')).toBe(true);
  });
});

describe('previewOf', () => {
  it('names a voice message', () => {
    expect(previewOf({ kind: 'voice', body: null })).toBe('Voice note');
  });

  it('takes the first line and cuts long ones with an ellipsis', () => {
    expect(previewOf({ kind: 'text', body: 'first line\nsecond' })).toBe('first line');
    const long = 'word '.repeat(40).trim();
    const out = previewOf({ kind: 'text', body: long }, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('thread selection', () => {
  it('round-trips a goal selection', () => {
    const sel = { kind: 'goal', goalId: 'g1', goalTitle: 'Run' } as const;
    expect(parseSelection(serializeSelection(sel))).toEqual(sel);
  });

  it('falls back to the daily log for anything malformed', () => {
    expect(parseSelection(null)).toEqual(DAILY_LOG);
    expect(parseSelection('')).toEqual(DAILY_LOG);
    expect(parseSelection('{not json')).toEqual(DAILY_LOG);
    expect(parseSelection('"a string"')).toEqual(DAILY_LOG);
    expect(parseSelection(JSON.stringify({ kind: 'goal' }))).toEqual(DAILY_LOG);
    expect(parseSelection(JSON.stringify({ kind: 'goal', goalId: '' }))).toEqual(DAILY_LOG);
    expect(parseSelection(JSON.stringify({ kind: 'daily_log' }))).toEqual(DAILY_LOG);
  });

  it('compares by kind and goal only', () => {
    expect(sameSelection(DAILY_LOG, { kind: 'daily_log' })).toBe(true);
    expect(
      sameSelection(
        { kind: 'goal', goalId: 'g1', goalTitle: 'A' },
        { kind: 'goal', goalId: 'g1', goalTitle: 'B' },
      ),
    ).toBe(true);
    expect(sameSelection({ kind: 'goal', goalId: 'g1', goalTitle: 'A' }, DAILY_LOG)).toBe(false);
    expect(sameSelection(null, DAILY_LOG)).toBe(false);
    expect(sameSelection(null, null)).toBe(true);
  });
});
