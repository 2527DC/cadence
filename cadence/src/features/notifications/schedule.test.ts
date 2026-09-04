// The two things in P11 that would be wrong silently: the timezone arithmetic behind
// "Sunday 20:00 Asia/Kolkata", and the week a tapped notification resolves to.
//
// Both are checked against absolute instants written in UTC, so these assertions hold
// whatever timezone the machine running the tests is set to. 20:00 IST is 14:30 UTC
// and 09:00 IST is 03:30 UTC — every expected value below is one of those two.

import {
  DEFAULT_PREFS,
  REMINDERS,
  REMINDER_KINDS,
  deliveredAtMs,
  deviceLocalClock,
  expoWeekday,
  istInstant,
  nextOccurrence,
  parsePrefs,
  parseReminderPayload,
  reminderPayload,
  weekStartAt,
  weekToReview,
  withReminder,
} from './schedule';

// 2026-09-06 is a Sunday; 2026-09-07 the Monday after it.
const SUNDAY_2000_IST = new Date('2026-09-06T14:30:00.000Z');
const MONDAY_0900_IST = new Date('2026-09-07T03:30:00.000Z');

describe('OQ-10: exactly two reminders', () => {
  it('has two, and no more', () => {
    expect(REMINDER_KINDS).toEqual(['review', 'plan']);
    expect(Object.keys(REMINDERS).sort()).toEqual(['plan', 'review']);
  });

  it('puts the review on Sunday evening and the plan on Monday morning', () => {
    expect(REMINDERS.review).toMatchObject({ isoWeekday: 7, hour: 20, minute: 0 });
    expect(REMINDERS.plan).toMatchObject({ isoWeekday: 1, hour: 9, minute: 0 });
  });

  it('gives each a stable identifier, so rescheduling replaces rather than stacks', () => {
    expect(REMINDERS.review.id).toBe('cadence.reminder.weekly-review');
    expect(REMINDERS.plan.id).toBe('cadence.reminder.plan-week');
  });
});

describe('istInstant', () => {
  it('reads the clock in IST, not in the device timezone', () => {
    expect(istInstant('2026-09-06', 20, 0).toISOString()).toBe('2026-09-06T14:30:00.000Z');
    expect(istInstant('2026-09-07', 9, 0).toISOString()).toBe('2026-09-07T03:30:00.000Z');
  });

  it('pads single-digit hours and minutes', () => {
    expect(istInstant('2026-09-07', 9, 5).toISOString()).toBe('2026-09-07T03:35:00.000Z');
  });
});

describe('nextOccurrence', () => {
  it('finds the coming Sunday from midweek', () => {
    // Wednesday 2026-09-02, 10:00 IST.
    const now = new Date('2026-09-02T04:30:00.000Z');
    expect(nextOccurrence(REMINDERS.review, now).toISOString()).toBe(SUNDAY_2000_IST.toISOString());
  });

  it('finds the coming Monday from midweek — the one after, not the one behind', () => {
    const now = new Date('2026-09-02T04:30:00.000Z');
    expect(nextOccurrence(REMINDERS.plan, now).toISOString()).toBe('2026-09-07T03:30:00.000Z');
  });

  it('is still today when the hour has not arrived yet', () => {
    // Sunday 19:59 IST.
    const now = new Date('2026-09-06T14:29:00.000Z');
    expect(nextOccurrence(REMINDERS.review, now).toISOString()).toBe(SUNDAY_2000_IST.toISOString());
  });

  it('rolls to next week when the instant has exactly arrived', () => {
    expect(nextOccurrence(REMINDERS.review, SUNDAY_2000_IST).toISOString()).toBe(
      '2026-09-13T14:30:00.000Z',
    );
  });

  it('treats a late Sunday night as Sunday in IST even when the device is a day behind', () => {
    // 23:30 UTC on Sunday is already 05:00 Monday in IST, so the next review is the
    // following Sunday. This is the OQ-1 case that makes the whole app fixed to IST.
    const now = new Date('2026-09-06T23:30:00.000Z');
    expect(nextOccurrence(REMINDERS.review, now).toISOString()).toBe('2026-09-13T14:30:00.000Z');
  });
});

describe('weekToReview', () => {
  it('is the week the Sunday notification is the last day of', () => {
    expect(weekToReview(SUNDAY_2000_IST)).toBe('2026-08-31');
  });

  it('still names that week when the banner is tapped the next morning', () => {
    // The tap is handled with the *delivery* time, so a Monday tap does not slide the
    // review onto the new week.
    expect(weekToReview(SUNDAY_2000_IST)).toBe('2026-08-31');
    expect(weekStartAt(MONDAY_0900_IST)).toBe('2026-09-07');
  });

  it('uses IST for the boundary, not UTC', () => {
    // 20:00 UTC on Sunday is 01:30 Monday IST — a different week.
    expect(weekToReview(new Date('2026-09-06T20:00:00.000Z'))).toBe('2026-09-07');
  });
});

describe('expoWeekday', () => {
  it('shifts ISO (Monday 1) onto the Sunday-first numbering the OS wants', () => {
    expect(expoWeekday(1)).toBe(2); // Monday
    expect(expoWeekday(6)).toBe(7); // Saturday
    expect(expoWeekday(7)).toBe(1); // Sunday
  });
});

describe('deviceLocalClock', () => {
  it('describes the same instant in whatever timezone the device is in', () => {
    const clock = deviceLocalClock(SUNDAY_2000_IST);
    expect(clock).toEqual({
      weekday: SUNDAY_2000_IST.getDay() + 1,
      hour: SUNDAY_2000_IST.getHours(),
      minute: SUNDAY_2000_IST.getMinutes(),
    });
    expect(clock.weekday).toBeGreaterThanOrEqual(1);
    expect(clock.weekday).toBeLessThanOrEqual(7);
  });
});

describe('parseReminderPayload', () => {
  it('reads back what reminderPayload wrote', () => {
    expect(parseReminderPayload(reminderPayload('review'))).toEqual({ kind: 'review' });
    expect(parseReminderPayload(reminderPayload('plan'))).toEqual({ kind: 'plan' });
  });

  it('refuses to guess at anything else', () => {
    expect(parseReminderPayload(null)).toBeNull();
    expect(parseReminderPayload(undefined)).toBeNull();
    expect(parseReminderPayload('review')).toBeNull();
    expect(parseReminderPayload({})).toBeNull();
    expect(parseReminderPayload({ kind: 'streak' })).toBeNull();
  });
});

describe('deliveredAtMs', () => {
  const now = 1_800_000_000_000;

  it('passes a millisecond timestamp through', () => {
    expect(deliveredAtMs(SUNDAY_2000_IST.getTime(), now)).toBe(SUNDAY_2000_IST.getTime());
  });

  it('scales a seconds timestamp rather than resolving the week to 1970', () => {
    expect(deliveredAtMs(SUNDAY_2000_IST.getTime() / 1000, now)).toBe(SUNDAY_2000_IST.getTime());
  });

  it('falls back to now for anything missing or nonsensical', () => {
    expect(deliveredAtMs(undefined, now)).toBe(now);
    expect(deliveredAtMs(0, now)).toBe(now);
    expect(deliveredAtMs(-5, now)).toBe(now);
    expect(deliveredAtMs(Number.NaN, now)).toBe(now);
    expect(deliveredAtMs('yesterday', now)).toBe(now);
  });
});

describe('parsePrefs', () => {
  it('defaults both reminders on', () => {
    expect(parsePrefs(null)).toEqual({ review: true, plan: true, askedPermission: false });
  });

  it('survives corrupt storage rather than crashing the launch', () => {
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('[]')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"review"')).toEqual(DEFAULT_PREFS);
  });

  it('keeps the fields it recognises and defaults the rest', () => {
    expect(parsePrefs(JSON.stringify({ review: false }))).toEqual({
      review: false,
      plan: true,
      askedPermission: false,
    });
  });

  it('remembers that permission was already asked for', () => {
    expect(parsePrefs(JSON.stringify({ askedPermission: true })).askedPermission).toBe(true);
  });
});

describe('withReminder', () => {
  it('toggles one reminder without touching the other', () => {
    const off = withReminder(DEFAULT_PREFS, 'plan', false);
    expect(off).toEqual({ review: true, plan: false, askedPermission: false });
    expect(DEFAULT_PREFS.plan).toBe(true); // unchanged
  });
});
