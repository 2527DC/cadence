// The shape of a week on the planner screen. P04.
//
// Pure on purpose: everything here is a function of the rows and a date, with no
// React and no network, so the grouping and the "is this week over?" question can be
// tested without a device. The screen in src/app/(tabs)/index.tsx is a thin layer
// over these.

import { format, parseISO } from 'date-fns';

import type { Task } from '@/api/tasks';
import {
  currentWeekStart,
  daysOfWeek,
  isToday,
  mondayOf,
  toDateString,
  todayInAppTimezone,
  type DateString,
} from '@/lib/week';

/** Section key for tasks with no `planned_for`. Never collides with a date. */
export const UNSCHEDULED = 'unscheduled';

export type PlannerSection = {
  /** A `YYYY-MM-DD` day of the week, or UNSCHEDULED. Doubles as the list key. */
  key: string;
  /** Null for the unscheduled group. */
  day: DateString | null;
  data: Task[];
};

/**
 * The week as sections: one per day that has something in it, in calendar order,
 * then "Unscheduled" last.
 *
 * Empty days are left out rather than shown as headings with nothing under them —
 * a week with three unscheduled drafts should not open with seven empty labels.
 * Unscheduled goes last so that a task added without a day lands right above the add
 * row, where the eye already is.
 *
 * Within a day, committed tasks come before drafts. The committed part of a day is
 * settled; the drafts are what is still being decided, and keeping them below the
 * line mirrors the old committed-above-drafts layout inside each group.
 *
 * The database restricts `planned_for` to the task's own week, so every row lands in
 * a day bucket or in unscheduled. A value outside the week — impossible today, but
 * cheap to be safe about — is treated as unscheduled rather than dropped.
 */
export function buildSections(tasks: readonly Task[], weekStart: DateString): PlannerSection[] {
  const days = daysOfWeek(weekStart).map(toDateString);
  const byDay = new Map<DateString, Task[]>(days.map((d) => [d, []]));
  const unscheduled: Task[] = [];

  for (const t of tasks) {
    const bucket = t.planned_for ? byDay.get(t.planned_for) : undefined;
    (bucket ?? unscheduled).push(t);
  }

  const sections: PlannerSection[] = [];
  for (const day of days) {
    const data = byDay.get(day) ?? [];
    if (data.length > 0) sections.push({ key: day, day, data: orderWithinDay(data) });
  }
  if (unscheduled.length > 0) {
    sections.push({ key: UNSCHEDULED, day: null, data: orderWithinDay(unscheduled) });
  }
  return sections;
}

function orderWithinDay(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.is_finalized !== b.is_finalized) return a.is_finalized ? -1 : 1;
    // ISO timestamps from Postgres share a format, so string order is time order.
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/**
 * A week before the current one is history. Nothing can be added to it, nothing in
 * it can be committed, and the drafts left in it stay exactly as they were: the
 * record of a plan that was never made real.
 */
export function isPastWeek(
  weekStart: DateString,
  thisWeek: DateString = currentWeekStart(),
): boolean {
  return weekStart < thisWeek;
}

/**
 * Saturday or Sunday, in IST. The last stretch in which a draft can still be
 * committed before the week closes over it. `now` is a wall-clock date from
 * todayInAppTimezone(), the same convention as wouldBeLateAdd().
 */
export function isWeekEnd(now: Date = todayInAppTimezone()): boolean {
  const day = now.getDay(); // 0 is Sunday, 6 is Saturday
  return day === 0 || day === 6;
}

/**
 * How many drafts are about to be lost to the week.
 *
 * Only ever non-zero for the current week at the weekend: a past week's drafts are
 * already lost, and a future week has time. The number is shown as a nudge, not a
 * gate — leaving something uncommitted is a legitimate decision, it just should not
 * be an accident.
 */
export function draftsAtRisk(
  tasks: readonly Task[],
  weekStart: DateString,
  now: Date = todayInAppTimezone(),
): number {
  if (weekStart !== toDateString(mondayOf(now)) || !isWeekEnd(now)) return 0;
  return tasks.filter((t) => !t.is_finalized).length;
}

export type DayHeading = {
  /** "Monday" */
  weekday: string;
  /** "31 Aug" */
  date: string;
  isToday: boolean;
};

/** What the section header for a day says. */
export function describeDay(day: DateString): DayHeading {
  const d = parseISO(day);
  return { weekday: format(d, 'EEEE'), date: format(d, 'd MMM'), isToday: isToday(d) };
}

/** Short chip label for the day picker: "Mon 31". */
export function dayChipLabel(day: Date): string {
  return format(day, 'EEE d');
}
