// The weekly review, as data. P11.
//
// This is the pure half of src/app/review/[week].tsx. It lives here rather than beside
// the screen because expo-router treats every file under src/app as a route, so a
// helper module dropped in there would become a navigable URL. features/notifications
// is P11's own folder, and this is P11's logic.
//
// Nothing here computes a rate. Every number comes out of v_week_rollup or out of
// src/features/analytics/metrics.ts (thisWeek, weekOverWeek, goalScorecards), which is
// the tested surface for the formulas. What this file does is three things the review
// needs and the dashboard does not:
//
//   1. Split a week's tasks into the four groups the review reads out — still open,
//      closed, uncommitted drafts, late adds — with the domain meaning of each.
//   2. Find the note behind each close, from the append-only ledger.
//   3. Build the `stats` snapshot, and read one back.
//
// The snapshot is the reason the phase exists. Reopen a task from three weeks ago and
// that week's review must still show what you saw when you wrote it: a review is a
// record of a moment, not a live query. So the numbers are frozen into
// weekly_reviews.stats at save time, and buildReviewStats is the only thing that
// writes them.

import type { GoalScorecard, ThisWeek, WeekComparison } from '@/features/analytics/metrics';
import type { DateString } from '@/lib/week';
import type { Tables } from '@/types/database.types';

// Narrow shapes, so the tests can build a task out of the five fields that matter
// rather than a whole row, and so nothing here can accidentally depend on the client.
type TaskLike = Pick<Tables<'tasks'>, 'id' | 'status' | 'is_finalized' | 'late_add' | 'closed_at'>;
type EventLike = Pick<Tables<'task_status_events'>, 'task_id' | 'created_at'>;

// ---------------------------------------------------------------------------
// The four groups
// ---------------------------------------------------------------------------

export type ReviewGroups<T> = {
  /**
   * Committed, and the week ended without an answer. Surfaced at the top of the
   * review because it is the only thing on the screen that can still be changed —
   * and because leaving it open is a choice, not an oversight: an OPEN task stays in
   * the denominator and drags the rate down until it is closed honestly.
   */
  stillOpen: T[];
  /** Committed and answered: C, N or NC. Shown with the note behind each one. */
  closed: T[];
  /**
   * Never committed. Not failures — they were never promises — but not invisible
   * either. A week of drafts that were never committed is a week you did not commit
   * to anything, and the review should say so plainly.
   */
  drafts: T[];
  /** Committed after Wednesday of their own week. A subset of the finalized tasks. */
  lateAdds: T[];
};

export function groupReviewTasks<T extends TaskLike>(tasks: readonly T[]): ReviewGroups<T> {
  const groups: ReviewGroups<T> = { stillOpen: [], closed: [], drafts: [], lateAdds: [] };
  for (const t of tasks) {
    if (!t.is_finalized) {
      groups.drafts.push(t);
      continue;
    }
    if (t.status === 'OPEN') groups.stillOpen.push(t);
    else groups.closed.push(t);
    if (t.late_add) groups.lateAdds.push(t);
  }
  return groups;
}

/** Oldest close first, so the week reads in the order it happened. */
export function byClosedAt<T extends TaskLike>(a: T, b: T): number {
  const x = a.closed_at ?? '';
  const y = b.closed_at ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The note behind each close
// ---------------------------------------------------------------------------

/**
 * The most recent ledger entry per task, and whether there were earlier ones.
 *
 * task_status_events is append-only: a correction adds a second row rather than
 * replacing the first, so a task can have several. The review shows the latest — that
 * is the answer that stands — and says that it is a correction, because "I closed this
 * as N and then reopened the question" is exactly the kind of thing a review is for.
 * The earlier entries are not lost; they are on the task's own screen.
 */
export function latestEvents<T extends EventLike>(
  events: readonly T[],
): Map<string, { event: T; corrections: number }> {
  const out = new Map<string, { event: T; corrections: number }>();
  for (const e of events) {
    const seen = out.get(e.task_id);
    if (!seen) {
      out.set(e.task_id, { event: e, corrections: 0 });
      continue;
    }
    const newer = e.created_at > seen.event.created_at;
    out.set(e.task_id, {
      event: newer ? e : seen.event,
      corrections: seen.corrections + 1,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

/**
 * Bumped whenever the shape changes. A stored snapshot from an older version is still
 * read — the fields it has are the fields it had — but the version is what lets a
 * future reader know which ones to trust.
 */
export const REVIEW_STATS_VERSION = 1;

export type ReviewGoalStat = {
  goal_id: string;
  title: string;
  target: number;
  completed: number;
  /** v_goal_progress.attainment for this week: completed / target, capped at 1. */
  attainment: number;
};

/**
 * Exactly what the numbers were when the review was written.
 *
 * Snake_case because it is stored as JSON in Postgres and will be read from SQL as
 * often as from here. Every field is a plain value — no dates, no nested nulls beyond
 * the rates, which are null when nothing was counted and must never be rendered as 0.
 */
export type ReviewStats = {
  version: number;
  week_start: DateString;
  /** ISO instant. "This is what it looked like at 20:14 on Sunday." */
  captured_at: string;

  total: number;
  completed: number;
  missed: number;
  not_counted: number;
  still_open: number;
  counted: number;

  completion_rate: number | null;
  nc_rate: number;
  is_kept_week: boolean;

  late_adds: number;
  /** The week's rate with late adds in it — the same number as completion_rate. */
  rate_with_late_adds: number | null;
  /** …and without them, over only what was committed by Wednesday. */
  rate_without_late_adds: number | null;

  drafts_not_committed: number;

  previous_week_start: DateString;
  previous_completion_rate: number | null;
  /** this − previous, in rate. Null when either week has no rate. */
  rate_delta: number | null;

  goals: ReviewGoalStat[];
};

export function buildReviewStats(input: {
  week: ThisWeek;
  comparison: WeekComparison;
  goals: readonly GoalScorecard[];
  draftCount: number;
  capturedAt: Date;
}): ReviewStats {
  const { week, comparison, goals, draftCount, capturedAt } = input;
  return {
    version: REVIEW_STATS_VERSION,
    week_start: week.weekStart,
    captured_at: capturedAt.toISOString(),

    total: week.total,
    completed: week.completed,
    missed: week.missed,
    not_counted: week.notCounted,
    still_open: week.open,
    counted: week.counted,

    completion_rate: week.rate,
    nc_rate: week.ncRate,
    is_kept_week: week.isKeptSoFar,

    late_adds: week.lateAdds.lateAdds,
    rate_with_late_adds: week.lateAdds.withRate,
    rate_without_late_adds: week.lateAdds.withoutRate,

    drafts_not_committed: draftCount,

    previous_week_start: comparison.lastWeek.weekStart,
    previous_completion_rate: comparison.lastWeek.rate,
    rate_delta: comparison.rateDelta,

    goals: goals.map((g) => ({
      goal_id: g.goalId,
      title: g.title,
      target: g.target,
      completed: g.completedThisWeek,
      attainment: g.attainment,
    })),
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function rate(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Read a stored snapshot back.
 *
 * Defensive on purpose: this JSON was written by an older build of the app and there
 * is no migration for a jsonb column. Anything unreadable returns null and the screen
 * simply shows the live numbers, which is a smaller lie than a review whose figures
 * are half zeroes.
 */
export function parseReviewStats(raw: unknown): ReviewStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.week_start !== 'string' || o.week_start === '') return null;

  const goals: ReviewGoalStat[] = Array.isArray(o.goals)
    ? o.goals.flatMap((g) => {
        if (!g || typeof g !== 'object') return [];
        const r = g as Record<string, unknown>;
        if (typeof r.goal_id !== 'string') return [];
        return [
          {
            goal_id: r.goal_id,
            title: typeof r.title === 'string' ? r.title : 'Untitled goal',
            target: num(r.target, 0),
            completed: num(r.completed, 0),
            attainment: num(r.attainment, 0),
          },
        ];
      })
    : [];

  return {
    version: num(o.version, 0),
    week_start: o.week_start,
    captured_at: typeof o.captured_at === 'string' ? o.captured_at : '',

    total: num(o.total, 0),
    completed: num(o.completed, 0),
    missed: num(o.missed, 0),
    not_counted: num(o.not_counted, 0),
    still_open: num(o.still_open, 0),
    counted: num(o.counted, 0),

    completion_rate: rate(o.completion_rate),
    nc_rate: num(o.nc_rate, 0),
    is_kept_week: o.is_kept_week === true,

    late_adds: num(o.late_adds, 0),
    rate_with_late_adds: rate(o.rate_with_late_adds),
    rate_without_late_adds: rate(o.rate_without_late_adds),

    drafts_not_committed: num(o.drafts_not_committed, 0),

    previous_week_start: typeof o.previous_week_start === 'string' ? o.previous_week_start : '',
    previous_completion_rate: rate(o.previous_completion_rate),
    rate_delta: rate(o.rate_delta),

    goals,
  };
}

/**
 * Whether the week has moved since the review was written, and how.
 *
 * The snapshot is deliberately frozen, so it *will* eventually disagree with the live
 * view — a task reopened, a status corrected, a late close. Saying so is the honest
 * thing: silently showing the old numbers would be a stale dashboard, and silently
 * showing the new ones would throw away the record of what was actually reviewed.
 *
 * Returns null when they agree, which is the normal case.
 */
export function statsDrift(
  snapshot: ReviewStats | null,
  live: { completed: number; missed: number; notCounted: number; open: number },
): string | null {
  if (!snapshot) return null;
  const moved: string[] = [];
  if (snapshot.completed !== live.completed)
    moved.push(`C ${snapshot.completed} → ${live.completed}`);
  if (snapshot.missed !== live.missed) moved.push(`N ${snapshot.missed} → ${live.missed}`);
  if (snapshot.not_counted !== live.notCounted) {
    moved.push(`NC ${snapshot.not_counted} → ${live.notCounted}`);
  }
  if (snapshot.still_open !== live.open) moved.push(`open ${snapshot.still_open} → ${live.open}`);
  return moved.length === 0 ? null : moved.join(' · ');
}
