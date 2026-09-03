// Weeks, and the one timezone this app has.
//
// OQ-1, locked 2026-09-02: the timezone is fixed to Asia/Kolkata. A day ends at
// midnight IST and does not shift when you travel. Everything here follows from that.
//
// The database agrees and enforces it: `week_start_is_monday` is a check constraint on
// tasks, goals and weekly_reviews, and mark_late_add() reads Asia/Kolkata directly. If
// this file and the database ever disagree, the database wins and inserts start failing
// — which is the right way round.

import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';

export const APP_TIMEZONE = 'Asia/Kolkata';

/** A `YYYY-MM-DD` string. What Postgres `date` columns take and return. */
export type DateString = string;

/**
 * "Now", as a wall-clock date in Asia/Kolkata rather than in the device's timezone.
 *
 * This matters at the edges of the day. At 00:30 IST on Monday, a phone still set to
 * London says it is Sunday, and a task closed then would land in the wrong week — the
 * exact question OQ-1 exists to answer. Formatting through the Swedish locale is the
 * short way to get an ISO-shaped date out of Intl for a named zone.
 */
export function todayInAppTimezone(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat('sv-SE', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parseISO(iso);
}

/** The Monday of the week containing `date`. Weeks are Monday–Sunday. */
export function mondayOf(date: Date = todayInAppTimezone()): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** The Monday of the current week, as the database wants it. */
export function currentWeekStart(): DateString {
  return toDateString(mondayOf());
}

export function toDateString(date: Date): DateString {
  return format(date, 'yyyy-MM-dd');
}

export function shiftWeek(weekStart: DateString, weeks: number): DateString {
  return toDateString(addDays(parseISO(weekStart), weeks * 7));
}

/** The seven days of a week, Monday first. */
export function daysOfWeek(weekStart: DateString): Date[] {
  const monday = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "1 – 7 Sep" / "29 Sep – 5 Oct". Compact enough for a screen title. */
export function formatWeekRange(weekStart: DateString): string {
  const monday = parseISO(weekStart);
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  return sameMonth
    ? `${format(monday, 'd')} – ${format(sunday, 'd MMM')}`
    : `${format(monday, 'd MMM')} – ${format(sunday, 'd MMM')}`;
}

export function isToday(date: Date): boolean {
  return isSameDay(date, todayInAppTimezone());
}

/**
 * A task finalized after Wednesday of its own week is a "late add".
 *
 * The database computes this itself in mark_late_add() and ignores whatever the client
 * sends, so this is only ever used to warn someone *before* they commit. Never trust it
 * as the answer — read `late_add` back from the row.
 */
export function wouldBeLateAdd(now: Date = todayInAppTimezone()): boolean {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // Sunday is 0 in JS, 7 in ISO
  return isoDay > 3;
}

/** Monday of the week that `date` falls in, for grouping arbitrary rows. */
export function weekStartOf(date: Date | DateString): DateString {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return toDateString(mondayOf(d));
}
