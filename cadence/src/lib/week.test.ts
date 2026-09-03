// The week boundary, which is the one piece of date logic in this app that is wrong
// silently rather than loudly.
//
// P04 asks specifically for the Sunday 23:59 / Monday 00:01 IST case, and it is the
// right thing to ask for: OQ-1 exists because "if you close a task at 00:30 on Monday,
// does it belong to last week or this week?" has no obvious answer. The answer chosen
// was Asia/Kolkata, always, regardless of where the phone thinks it is.
//
// These tests deliberately construct instants in UTC and assert what they mean in IST
// (UTC+05:30), because that offset is the entire subject.

import {
  currentWeekStart,
  daysOfWeek,
  formatWeekRange,
  mondayOf,
  shiftWeek,
  toDateString,
  todayInAppTimezone,
  weekStartOf,
  wouldBeLateAdd,
} from './week';

describe('todayInAppTimezone', () => {
  it('reads the IST calendar date, not the UTC one', () => {
    // 2026-09-03 20:00 UTC is 2026-09-04 01:30 IST — already the next day in Kolkata.
    const instant = new Date('2026-09-03T20:00:00Z');
    expect(toDateString(todayInAppTimezone(instant))).toBe('2026-09-04');
  });

  it('has not rolled over yet just before IST midnight', () => {
    // 2026-09-03 18:00 UTC is 2026-09-03 23:30 IST — still the same day.
    const instant = new Date('2026-09-03T18:00:00Z');
    expect(toDateString(todayInAppTimezone(instant))).toBe('2026-09-03');
  });
});

describe('the Sunday/Monday boundary in IST', () => {
  // Sunday 2026-08-30 23:59 IST  ==  2026-08-30 18:29 UTC
  const sundayLate = new Date('2026-08-30T18:29:00Z');
  // Monday  2026-08-31 00:01 IST  ==  2026-08-30 18:31 UTC
  const mondayEarly = new Date('2026-08-30T18:31:00Z');

  it('puts Sunday 23:59 IST in the week that is ending', () => {
    expect(toDateString(mondayOf(todayInAppTimezone(sundayLate)))).toBe('2026-08-24');
  });

  it('puts Monday 00:01 IST in the new week', () => {
    expect(toDateString(mondayOf(todayInAppTimezone(mondayEarly)))).toBe('2026-08-31');
  });

  it('separates two instants two minutes apart into different weeks', () => {
    const before = toDateString(mondayOf(todayInAppTimezone(sundayLate)));
    const after = toDateString(mondayOf(todayInAppTimezone(mondayEarly)));
    expect(before).not.toBe(after);
    expect(shiftWeek(before, 1)).toBe(after);
  });
});

describe('mondayOf', () => {
  it.each([
    ['2026-08-31', '2026-08-31'], // a Monday maps to itself
    ['2026-09-01', '2026-08-31'], // Tuesday
    ['2026-09-03', '2026-08-31'], // Thursday
    ['2026-09-06', '2026-08-31'], // Sunday still belongs to the week that began Monday
    ['2026-09-07', '2026-09-07'], // the next Monday
  ])('maps %s to %s', (input, expected) => {
    expect(weekStartOf(input)).toBe(expected);
  });
});

describe('week navigation', () => {
  it('crosses a month boundary', () => {
    expect(shiftWeek('2026-08-31', 1)).toBe('2026-09-07');
    expect(shiftWeek('2026-09-07', -1)).toBe('2026-08-31');
  });

  it('crosses 1 January without landing on the wrong year', () => {
    // 2026-12-28 is a Monday; the following Monday is in 2027.
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28');
  });

  it('is reversible over long spans', () => {
    const start = '2026-08-31';
    expect(shiftWeek(shiftWeek(start, 52), -52)).toBe(start);
  });

  it('always returns a Monday', () => {
    for (let i = -30; i <= 30; i++) {
      const w = shiftWeek('2026-08-31', i);
      expect(weekStartOf(w)).toBe(w);
    }
  });
});

describe('currentWeekStart', () => {
  it('is always a Monday, whatever today is', () => {
    const w = currentWeekStart();
    expect(weekStartOf(w)).toBe(w);
  });
});

describe('daysOfWeek', () => {
  it('gives seven days beginning on the Monday', () => {
    const days = daysOfWeek('2026-08-31');
    expect(days).toHaveLength(7);
    expect(toDateString(days[0])).toBe('2026-08-31');
    expect(toDateString(days[6])).toBe('2026-09-06');
  });
});

describe('formatWeekRange', () => {
  it('collapses the month when the week does not cross one', () => {
    expect(formatWeekRange('2026-09-07')).toBe('7 – 13 Sep');
  });

  it('names both months when the week straddles them', () => {
    expect(formatWeekRange('2026-08-31')).toBe('31 Aug – 6 Sep');
  });
});

describe('wouldBeLateAdd', () => {
  // Wednesday is isodow 3. Finalizing on Thursday or later is a late add. This only
  // ever warns the user in advance — mark_late_add() in migration 0006 computes the
  // stored value and ignores anything the client sends.
  it.each([
    ['2026-08-31', false], // Monday
    ['2026-09-01', false], // Tuesday
    ['2026-09-02', false], // Wednesday — the last non-late day
    ['2026-09-03', true], // Thursday
    ['2026-09-05', true], // Saturday
    ['2026-09-06', true], // Sunday
  ])('%s -> %s', (day, expected) => {
    expect(wouldBeLateAdd(new Date(`${day}T09:00:00`))).toBe(expected);
  });
});
