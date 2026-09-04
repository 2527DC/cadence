// What gets scheduled, when, and whether. P11.
//
// OQ-10 is answered here and nowhere else: there are exactly TWO reminders and there
// is no mechanism to add a third. No streak nag, no daily reminder, no "you have not
// opened the app in a while". A tracker that nags stops being opened, and the whole
// value of this one depends on it still being opened in six months.
//
//   Sunday 20:00 IST   "Time to review your week"  -> the week that is ending
//   Monday 09:00 IST   "Plan this week"            -> the planner
//
// This module is pure — no expo-notifications, no AsyncStorage, no React — so the two
// things most likely to be quietly wrong (the timezone arithmetic and the week a tap
// resolves to) have unit tests. reminders.ts does the talking to the OS.
//
// The one subtlety worth reading: a repeating trigger is scheduled once and fires for
// years, so nothing week-specific can be baked into its payload — a `weekStart` written
// into a notification in September would still say September next March. The payload
// therefore carries only the kind, and the week is derived from the delivery time at
// the moment the tap is handled. See weekToReview().

import { addDays, parseISO } from 'date-fns';

import { mondayOf, toDateString, todayInAppTimezone, type DateString } from '@/lib/week';

export type ReminderKind = 'review' | 'plan';

/** Both, in display order. This array is the complete list. There is no third. */
export const REMINDER_KINDS: readonly ReminderKind[] = ['review', 'plan'];

export type Reminder = {
  /**
   * The scheduled notification's identifier. Stable forever: rescheduling cancels by
   * this id first, which is what stops a duplicate stacking up on every launch. If it
   * ever changes, every phone that has run an older build keeps its old copy and the
   * user gets two Sunday notifications.
   */
  id: string;
  /** ISO weekday in Asia/Kolkata: Monday 1 … Sunday 7. */
  isoWeekday: number;
  hour: number;
  minute: number;
  title: string;
  body: string;
  /** Shown next to the toggle, so a switch is never unlabelled. */
  description: string;
};

export const REMINDERS: Record<ReminderKind, Reminder> = {
  review: {
    id: 'cadence.reminder.weekly-review',
    isoWeekday: 7,
    hour: 20,
    minute: 0,
    title: 'Time to review your week',
    body: 'Five minutes, honestly. What actually happened?',
    description: 'Sunday, 8:00 pm — opens the review for the week that just ended.',
  },
  plan: {
    id: 'cadence.reminder.plan-week',
    isoWeekday: 1,
    hour: 9,
    minute: 0,
    title: 'Plan this week',
    body: 'Commit to a few things now, while the week is still yours.',
    description: 'Monday, 9:00 am — opens the planner. Committing on Monday is the point.',
  },
};

// ---------------------------------------------------------------------------
// Time in Asia/Kolkata
// ---------------------------------------------------------------------------

/**
 * India has been UTC+05:30 since 1945 and observes no daylight saving, so the offset
 * is a constant rather than something to look up per date. OQ-1 fixed the app to this
 * one zone; if that is ever revisited, this is the line that has to change.
 */
export const IST_OFFSET = '+05:30';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The absolute instant of `hour:minute` on `date`, read as a wall clock in IST. */
export function istInstant(date: DateString, hour: number, minute: number): Date {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00.000${IST_OFFSET}`);
}

/**
 * The next time this reminder is due, as an absolute instant.
 *
 * Strictly in the future: at exactly 20:00:00 on a Sunday the answer is next Sunday,
 * not now. A trigger set for an instant that has just passed either fires immediately
 * or is dropped, and neither is what "next" means.
 */
export function nextOccurrence(reminder: Reminder, now: Date = new Date()): Date {
  const monday = mondayOf(todayInAppTimezone(now));
  const day = toDateString(addDays(monday, reminder.isoWeekday - 1));
  const candidate = istInstant(day, reminder.hour, reminder.minute);
  if (candidate.getTime() > now.getTime()) return candidate;
  return istInstant(toDateString(addDays(parseISO(day), 7)), reminder.hour, reminder.minute);
}

/** The Monday of the IST week that `instant` falls in. */
export function weekStartAt(instant: Date): DateString {
  return toDateString(mondayOf(todayInAppTimezone(instant)));
}

/**
 * The week a review notification is about, derived from when it was delivered.
 *
 * The Sunday reminder fires at 20:00 on the last day of its own week, so the week it
 * asks about is the week containing that instant — four hours from over, and the only
 * week it could sensibly mean. Deriving it here rather than storing it in the payload
 * is what makes a repeating trigger correct: one scheduled notification resolves to a
 * different week every time it fires.
 *
 * Tapping the banner on Monday morning still opens the week the notification was
 * *delivered* in, which is the week it was about, not the new one.
 */
export function weekToReview(deliveredAt: Date): DateString {
  return weekStartAt(deliveredAt);
}

// ---------------------------------------------------------------------------
// Translating to what the OS wants
// ---------------------------------------------------------------------------

/** expo-notifications counts weekdays from Sunday = 1; ISO counts from Monday = 1. */
export function expoWeekday(isoWeekday: number): number {
  return (isoWeekday % 7) + 1;
}

export type WeeklyClock = { weekday: number; hour: number; minute: number };

/**
 * The same instant expressed in the device's own timezone, for a weekly trigger that
 * has no timezone of its own.
 *
 * On a phone set to IST — which is every phone this app expects — this is the identity.
 * It only does work when travelling, and then only until the next launch reschedules,
 * which is the honest limit of a device-local weekly trigger.
 */
export function deviceLocalClock(instant: Date): WeeklyClock {
  return {
    weekday: instant.getDay() + 1,
    hour: instant.getHours(),
    minute: instant.getMinutes(),
  };
}

// ---------------------------------------------------------------------------
// The payload, and reading it back
// ---------------------------------------------------------------------------

export type ReminderPayload = { kind: ReminderKind };

export function reminderPayload(kind: ReminderKind): ReminderPayload {
  return { kind };
}

/**
 * Read the payload off a tapped notification.
 *
 * Anything unrecognised returns null rather than guessing a route. The data comes back
 * through the OS, can have been scheduled by a build several versions old, and a wrong
 * guess would silently open the wrong week.
 */
export function parseReminderPayload(data: unknown): ReminderPayload | null {
  if (!data || typeof data !== 'object') return null;
  const kind = (data as { kind?: unknown }).kind;
  return kind === 'review' || kind === 'plan' ? { kind } : null;
}

/**
 * When a delivered notification was actually delivered, in milliseconds.
 *
 * `Notification.date` is a timestamp, but the two platforms have historically
 * disagreed about seconds versus milliseconds. Getting it wrong would resolve the week
 * to 1970 and open an empty review, so anything too small to be a plausible
 * millisecond timestamp is read as seconds, and anything missing falls back to now.
 */
export function deliveredAtMs(date: unknown, now: number): number {
  if (typeof date !== 'number' || !Number.isFinite(date) || date <= 0) return now;
  return date < 1e11 ? date * 1000 : date;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type ReminderPrefs = {
  review: boolean;
  plan: boolean;
  /**
   * Whether the OS permission prompt has ever been shown. iOS only asks once — every
   * later request resolves instantly with the old answer — so this is what stops the
   * app pestering on every launch after a "Don't Allow".
   */
  askedPermission: boolean;
};

/** Both on. The two reminders are the ritual; the toggles exist to switch them off. */
export const DEFAULT_PREFS: ReminderPrefs = { review: true, plan: true, askedPermission: false };

export const PREFS_STORAGE_KEY = 'cadence.reminders.v1';

/** Tolerant of anything: a missing key, corrupt JSON, or a shape from an older build. */
export function parsePrefs(raw: string | null | undefined): ReminderPrefs {
  if (!raw) return DEFAULT_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
  const o = parsed as Record<string, unknown>;
  return {
    review: typeof o.review === 'boolean' ? o.review : DEFAULT_PREFS.review,
    plan: typeof o.plan === 'boolean' ? o.plan : DEFAULT_PREFS.plan,
    askedPermission:
      typeof o.askedPermission === 'boolean' ? o.askedPermission : DEFAULT_PREFS.askedPermission,
  };
}

export function withReminder(
  prefs: ReminderPrefs,
  kind: ReminderKind,
  enabled: boolean,
): ReminderPrefs {
  return { ...prefs, [kind]: enabled };
}
