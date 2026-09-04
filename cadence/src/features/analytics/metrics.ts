// Analytics metrics. Every number on the dashboard that is not read straight off a view
// is derived here, in one function named after the question it answers.
//
// The discipline for this file: every function is pure. It takes rows from
// v_week_rollup / v_goal_progress (or the narrow slices of tasks and goals the views do
// not expose — weight, late_add, start_week), it is handed the current week and today
// rather than reading a clock, and it never renders or fetches. That is what makes
// metrics.test.ts possible, and this is the file most likely to lie quietly: a wrong
// formula here produces a plausible-looking number, not a crash.
//
// Formulas: doc/05-analytics-spec.md. Rules: the cadence-domain skill. Where the two
// leave a gap, the comment on the function says which reading was chosen and why.

import { differenceInCalendarDays, parseISO } from 'date-fns';

import { currentWeekStart, formatWeekRange, shiftWeek, type DateString } from '@/lib/week';
import type { Tables } from '@/types/database.types';

// ---------------------------------------------------------------------------
// Inputs. Narrow on purpose so tests can build fixtures without a whole row.
// ---------------------------------------------------------------------------

export type WeekRollup = Tables<'v_week_rollup'>;

export type GoalProgressRow = Pick<
  Tables<'v_goal_progress'>,
  'goal_id' | 'week_start' | 'completed' | 'attainment'
>;

export type GoalFacts = Pick<
  Tables<'goals'>,
  'id' | 'title' | 'color' | 'target_per_week' | 'start_week' | 'end_week' | 'state'
>;

export type TaskFacts = Pick<Tables<'tasks'>, 'week_start' | 'status' | 'weight' | 'late_add'>;

/** OQ-2: a kept week needs this many counted (C or N) tasks. Mirrors migration 0011. */
export const MIN_COUNTED_FOR_KEPT = 3;

/** doc/05 §4.1: above this NC share of a week, the red banner shows. Strictly greater. */
export const NC_BANNER_THRESHOLD = 0.2;

/** doc/05 §4.2: with-vs-without late adds is "said plainly" past this many points. */
export const LATE_ADD_GAP_THRESHOLD = 0.1;

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/**
 * C / (C + N). NC is not in the denominator — that is the entire point of NC.
 *
 * Returns null, never 0, when nothing was counted. A zero implies failure; absence
 * does not (doc/05 §7), and callers must render null as "—".
 */
export function completionRate(completed: number, missed: number): number | null {
  const counted = completed + missed;
  return counted === 0 ? null : completed / counted;
}

/** "72%", or "—" for an undefined rate. The dash is the honest rendering of null. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** "+12 pts" / "−5 pts" / "0 pts". For deltas between two rates. */
export function formatPoints(delta: number): string {
  const pts = Math.round(delta * 100);
  const sign = pts > 0 ? '+' : pts < 0 ? '−' : '';
  return `${sign}${Math.abs(pts)} pts`;
}

// ---------------------------------------------------------------------------
// The calendar of weeks
// ---------------------------------------------------------------------------

/**
 * What a calendar week means for the streak and the consistency ratio.
 *
 *   in_progress     the current week; it has not been kept or lost yet
 *   before_history  a week before the first finalized task ever — not a gap, just
 *                   the time before the app was in use
 *   missing         a finished week with no row: nothing was committed. Breaks the
 *                   streak and counts as NOT kept (OQ-2)
 *   neutral         only NC tasks, nothing counted, nothing open. Neither kept nor
 *                   broken; skipped in the streak (doc/05 §7)
 *   kept            v_week_rollup.is_kept_week
 *   not_kept        everything else, including a week left with OPEN tasks
 */
export type WeekKind =
  'in_progress' | 'before_history' | 'missing' | 'neutral' | 'kept' | 'not_kept';

export type WeekSlot = {
  weekStart: DateString;
  kind: WeekKind;
  row: WeekRollup | null;
  /** completion_rate from the view; null when undefined or when there is no row. */
  rate: number | null;
  /** nc_rate from the view; 0 when there is no row. */
  ncRate: number;
};

function firstWeekOf(rollups: WeekRollup[]): DateString | null {
  let first: DateString | null = null;
  for (const r of rollups) {
    const w = String(r.week_start);
    if (first === null || w < first) first = w;
  }
  return first;
}

// ISO dates compare correctly as strings, which is why week_start is kept as a string
// everywhere rather than parsed.
function classifyWeek(
  row: WeekRollup | null,
  weekStart: DateString,
  currentWeek: DateString,
  firstWeek: DateString | null,
): WeekKind {
  if (weekStart >= currentWeek) return 'in_progress';
  if (!row) return firstWeek === null || weekStart < firstWeek ? 'before_history' : 'missing';

  const counted = row.counted_total ?? 0;
  const notCounted = row.not_counted ?? 0;
  const open = row.still_open ?? 0;
  if (counted === 0 && notCounted > 0 && open === 0) return 'neutral';

  return row.is_kept_week ? 'kept' : 'not_kept';
}

/**
 * The last `weeks` calendar weeks ending at `currentWeek`, oldest first, one slot per
 * week whether or not the view returned a row for it.
 *
 * This is the function that makes empty weeks visible. v_week_rollup cannot produce a
 * row for a week with no finalized tasks, so anything that walks only the rows the view
 * returns will silently skip those weeks — and "stop planning" becomes the cheapest way
 * to protect a streak. Everything downstream (streak, consistency, sparkline, the
 * empty-week banner) reads this series, not the raw rows.
 */
export function weekSeries(
  rollups: WeekRollup[],
  currentWeek: DateString,
  weeks: number,
): WeekSlot[] {
  const byWeek = new Map(rollups.map((r) => [String(r.week_start), r]));
  const firstWeek = firstWeekOf(rollups);
  const slots: WeekSlot[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = shiftWeek(currentWeek, -i);
    const row = byWeek.get(weekStart) ?? null;
    slots.push({
      weekStart,
      kind: classifyWeek(row, weekStart, currentWeek, firstWeek),
      row,
      rate: row?.completion_rate ?? null,
      ncRate: row?.nc_rate ?? 0,
    });
  }
  return slots;
}

/**
 * The current streak of kept weeks, counting back from the most recently finished week.
 *
 * Walks the calendar, not the data. A finished week with no row breaks the streak
 * (OQ-2, locked 2026-09-02): a week where you committed to nothing is not a week you
 * kept. The one exception is a week of only NC tasks, which doc/05 §7 says is neither
 * kept nor broken — it is stepped over. The week in progress is excluded; it has not
 * been kept or lost yet, and counting it would make the number flicker all week.
 */
export function computeStreak(
  rollups: WeekRollup[],
  currentWeek: DateString = currentWeekStart(),
): number {
  const byWeek = new Map(rollups.map((r) => [String(r.week_start), r]));
  const firstWeek = firstWeekOf(rollups);
  let streak = 0;
  let cursor = shiftWeek(currentWeek, -1);

  // Bounded so a bad clock or a corrupt row cannot spin here. 520 weeks is ten years.
  for (let i = 0; i < 520; i++) {
    const kind = classifyWeek(byWeek.get(cursor) ?? null, cursor, currentWeek, firstWeek);
    if (kind === 'kept') streak++;
    else if (kind !== 'neutral') break;
    cursor = shiftWeek(cursor, -1);
  }
  return streak;
}

export type Consistency = {
  kept: number;
  /** Finished weeks that could have been kept: kept + not kept + missing. */
  counted: number;
  /** kept / counted, or null when there is nothing to divide — "not enough data yet". */
  ratio: number | null;
  /** Only-NC weeks, excluded from the ratio and reported so they are not invisible. */
  neutral: number;
};

/**
 * doc/05 §3.2: kept weeks / finished weeks over the last `window` weeks. The headline
 * consistency number — it survives one bad flu where the streak does not.
 *
 * Missing weeks after history began are in the denominator, for the same reason they
 * break the streak. Weeks before the first finalized task are not: they are not weeks
 * you failed, they are weeks before you started. Only-NC weeks are left out of both
 * sides, matching the streak.
 */
export function consistency(
  rollups: WeekRollup[],
  currentWeek: DateString,
  window = 12,
): Consistency {
  // One extra slot so the current week can be dropped off the end.
  const finished = weekSeries(rollups, currentWeek, window + 1).slice(0, window);
  let kept = 0;
  let counted = 0;
  let neutral = 0;
  for (const s of finished) {
    if (s.kind === 'kept') {
      kept++;
      counted++;
    } else if (s.kind === 'not_kept' || s.kind === 'missing') {
      counted++;
    } else if (s.kind === 'neutral') {
      neutral++;
    }
  }
  return { kept, counted, ratio: counted === 0 ? null : kept / counted, neutral };
}

/** Whole days left after `today` until the week ends: Monday 6 … Sunday 0. */
export function daysLeftInWeek(today: Date): number {
  const isoDay = today.getDay() === 0 ? 7 : today.getDay();
  return 7 - isoDay;
}

// ---------------------------------------------------------------------------
// Weight — OQ-8. The column exists, the UI does not expose it.
// ---------------------------------------------------------------------------

/** True once any finalized task carries a weight above the default. Gates "by effort". */
export function usesWeight(tasks: TaskFacts[]): boolean {
  return tasks.some((t) => t.weight > 1);
}

/**
 * doc/05 §2.1: sum(weight) filter (C) / sum(weight) filter (C or N). Diverges from the
 * count-based rate exactly when the easy things are the ones getting done.
 */
export function effortRate(tasks: TaskFacts[]): number | null {
  let done = 0;
  let counted = 0;
  for (const t of tasks) {
    if (t.status === 'C') {
      done += t.weight;
      counted += t.weight;
    } else if (t.status === 'N') {
      counted += t.weight;
    }
  }
  return counted === 0 ? null : done / counted;
}

// ---------------------------------------------------------------------------
// Late adds — doc/05 §4.2
// ---------------------------------------------------------------------------

export type LateAddSplit = {
  lateAdds: number;
  finalized: number;
  /** late adds / finalized, null when nothing was finalized. */
  lateAddRate: number | null;
  /** Completion rate over every counted task. */
  withRate: number | null;
  /** Completion rate over only the tasks committed by Wednesday. */
  withoutRate: number | null;
  /** True when the two rates are more than 10 points apart — the case to say plainly. */
  differs: boolean;
};

export function lateAddSplit(tasks: TaskFacts[]): LateAddSplit {
  const count = (ts: TaskFacts[], status: TaskFacts['status']) =>
    ts.filter((t) => t.status === status).length;

  const onTime = tasks.filter((t) => !t.late_add);
  const withRate = completionRate(count(tasks, 'C'), count(tasks, 'N'));
  const withoutRate = completionRate(count(onTime, 'C'), count(onTime, 'N'));
  const lateAdds = tasks.length - onTime.length;

  // The epsilon keeps 0.8 − 0.7 (which floats to 0.10000000000000009) from counting
  // as "more than 10 points".
  const differs =
    withRate !== null &&
    withoutRate !== null &&
    Math.abs(withRate - withoutRate) > LATE_ADD_GAP_THRESHOLD + 1e-9;

  return {
    lateAdds,
    finalized: tasks.length,
    lateAddRate: tasks.length === 0 ? null : lateAdds / tasks.length,
    withRate,
    withoutRate,
    differs,
  };
}

// ---------------------------------------------------------------------------
// This week — doc/05 §2.1
// ---------------------------------------------------------------------------

export type ThisWeek = {
  weekStart: DateString;
  completed: number;
  missed: number;
  notCounted: number;
  open: number;
  total: number;
  counted: number;
  rate: number | null;
  ncRate: number;
  usesWeight: boolean;
  effortRate: number | null;
  lateAdds: LateAddSplit;
  daysLeft: number;
  /** v_week_rollup.is_kept_week as of now — the closed tasks so far already qualify. */
  isKeptSoFar: boolean;
  /** Counted tasks still needed before the week is even eligible to be kept. */
  keptShortfall: number;
};

/**
 * The counts come off the view. The only derivations are the ones the view cannot
 * make: effort (needs weight), the late-add split (needs late_add per status), and
 * the calendar.
 */
export function thisWeek(
  row: WeekRollup | null,
  tasks: TaskFacts[],
  weekStart: DateString,
  today: Date,
): ThisWeek {
  const completed = row?.completed ?? 0;
  const missed = row?.missed ?? 0;
  const notCounted = row?.not_counted ?? 0;
  const open = row?.still_open ?? 0;
  const counted = row?.counted_total ?? 0;
  const weekTasks = tasks.filter((t) => t.week_start === weekStart);

  return {
    weekStart,
    completed,
    missed,
    notCounted,
    open,
    total: row?.total ?? 0,
    counted,
    rate: row?.completion_rate ?? null,
    ncRate: row?.nc_rate ?? 0,
    usesWeight: usesWeight(tasks),
    effortRate: effortRate(weekTasks),
    lateAdds: lateAddSplit(weekTasks),
    daysLeft: daysLeftInWeek(today),
    isKeptSoFar: row?.is_kept_week ?? false,
    keptShortfall: Math.max(0, MIN_COUNTED_FOR_KEPT - counted),
  };
}

// ---------------------------------------------------------------------------
// Goals — doc/05 §2.2 and §3.4
// ---------------------------------------------------------------------------

export type GoalScorecard = {
  goalId: string;
  title: string;
  color: string | null;
  state: GoalFacts['state'];
  target: number;
  /** This week, from v_goal_progress. A goal with no tasks this week is honestly at 0. */
  completedThisWeek: number;
  attainment: number;
  /** Finished weeks since start_week (and up to end_week). The in-progress week is not one. */
  weeksElapsed: number;
  expected: number;
  actual: number;
  /** expected − actual. Positive means behind. The number to show. */
  debt: number;
  reliability: {
    /** Finished weeks in the window where the goal was active. */
    active: number;
    /** …of which the goal hit its target. */
    hit: number;
    ratio: number | null;
  };
};

/** Mondays from `a` to `b` inclusive; 0 when `a` is after `b`. */
function weeksInclusive(a: DateString, b: DateString): number {
  if (a > b) return 0;
  return Math.round(differenceInCalendarDays(parseISO(b), parseISO(a)) / 7) + 1;
}

/**
 * One scorecard per goal. Debt and reliability are computed over finished weeks only:
 * an in-progress week cannot be behind yet, so counting its target as already owed
 * would show "3 behind" on every Monday morning.
 *
 * A week where the goal had no finalized tasks produces no row in v_goal_progress and
 * is treated as 0 completed — the same rule as empty weeks in the streak. A goal
 * created mid-week is not prorated (doc/05 §7); it starts counting from start_week.
 */
export function goalScorecards(
  goals: GoalFacts[],
  rows: GoalProgressRow[],
  currentWeek: DateString,
  reliabilityWindow = 8,
): GoalScorecard[] {
  const lastFinished = shiftWeek(currentWeek, -1);

  const byGoal = new Map<string, Map<DateString, GoalProgressRow>>();
  for (const r of rows) {
    if (!r.goal_id || !r.week_start) continue;
    let weeks = byGoal.get(r.goal_id);
    if (!weeks) {
      weeks = new Map();
      byGoal.set(r.goal_id, weeks);
    }
    weeks.set(r.week_start, r);
  }

  return goals.map((g) => {
    const weeks = byGoal.get(g.id) ?? new Map<DateString, GoalProgressRow>();
    const target = g.target_per_week;

    const current = weeks.get(currentWeek);
    const completedThisWeek = current?.completed ?? 0;
    // The view's attainment is the number; the fallback only covers a missing row,
    // where the answer is 0 by construction.
    const attainment = current?.attainment ?? Math.min(completedThisWeek / target, 1);

    // Debt: every finished week from start_week to end_week (or last week).
    const end = g.end_week && g.end_week < lastFinished ? g.end_week : lastFinished;
    const weeksElapsed = weeksInclusive(g.start_week, end);
    let actual = 0;
    for (const [w, r] of weeks) {
      if (w >= g.start_week && w <= end) actual += r.completed ?? 0;
    }
    const expected = weeksElapsed * target;

    // Reliability: the last `reliabilityWindow` finished weeks the goal was active in.
    const windowStart = shiftWeek(currentWeek, -reliabilityWindow);
    const relStart = g.start_week > windowStart ? g.start_week : windowStart;
    let active = 0;
    let hit = 0;
    for (let w = relStart, i = 0; w <= end && i < reliabilityWindow; w = shiftWeek(w, 1), i++) {
      active++;
      if ((weeks.get(w)?.completed ?? 0) >= target) hit++;
    }

    return {
      goalId: g.id,
      title: g.title,
      color: g.color,
      state: g.state,
      target,
      completedThisWeek,
      attainment,
      weeksElapsed,
      expected,
      actual,
      debt: expected - actual,
      reliability: { active, hit, ratio: active === 0 ? null : hit / active },
    };
  });
}

/**
 * doc/05 §3.4: "Goals you are not keeping" — active goals ranked by reliability,
 * worst first. Listed when the target was hit in fewer than half of the weeks it was
 * active, once there are at least two finished weeks to judge by; one week is not a
 * pattern. Ties go to the larger debt.
 */
export function notKeeping(cards: GoalScorecard[]): GoalScorecard[] {
  return cards
    .filter(
      (c) =>
        c.state === 'active' &&
        c.reliability.ratio !== null &&
        c.reliability.active >= 2 &&
        c.reliability.ratio < 0.5,
    )
    .sort((a, b) => (a.reliability.ratio ?? 0) - (b.reliability.ratio ?? 0) || b.debt - a.debt);
}

// ---------------------------------------------------------------------------
// Week over week — doc/05 §5.3
// ---------------------------------------------------------------------------

export type WeekColumn = {
  weekStart: DateString;
  hasData: boolean;
  completed: number;
  missed: number;
  notCounted: number;
  open: number;
  counted: number;
  rate: number | null;
  ncRate: number;
};

export type GoalMove = {
  goalId: string;
  title: string;
  color: string | null;
  before: number;
  after: number;
  delta: number;
};

export type WeekComparison = {
  thisWeek: WeekColumn;
  lastWeek: WeekColumn;
  /** this − last, in rate. Null when either rate is undefined. */
  rateDelta: number | null;
  /** Goals whose completed count changed, largest drop first. Archived goals included. */
  goalMoves: GoalMove[];
};

function weekColumn(row: WeekRollup | undefined, weekStart: DateString): WeekColumn {
  return {
    weekStart,
    hasData: row !== undefined,
    completed: row?.completed ?? 0,
    missed: row?.missed ?? 0,
    notCounted: row?.not_counted ?? 0,
    open: row?.still_open ?? 0,
    counted: row?.counted_total ?? 0,
    rate: row?.completion_rate ?? null,
    ncRate: row?.nc_rate ?? 0,
  };
}

export function weekOverWeek(
  rollups: WeekRollup[],
  goals: GoalFacts[],
  rows: GoalProgressRow[],
  currentWeek: DateString,
): WeekComparison {
  const lastWeek = shiftWeek(currentWeek, -1);
  const byWeek = new Map(rollups.map((r) => [String(r.week_start), r]));
  const current = weekColumn(byWeek.get(currentWeek), currentWeek);
  const previous = weekColumn(byWeek.get(lastWeek), lastWeek);

  const goalMoves: GoalMove[] = [];
  for (const g of goals) {
    const before =
      rows.find((r) => r.goal_id === g.id && r.week_start === lastWeek)?.completed ?? 0;
    const after =
      rows.find((r) => r.goal_id === g.id && r.week_start === currentWeek)?.completed ?? 0;
    if (before !== after) {
      goalMoves.push({
        goalId: g.id,
        title: g.title,
        color: g.color,
        before,
        after,
        delta: after - before,
      });
    }
  }
  goalMoves.sort((a, b) => a.delta - b.delta);

  return {
    thisWeek: current,
    lastWeek: previous,
    rateDelta:
      current.rate === null || previous.rate === null ? null : current.rate - previous.rate,
    goalMoves,
  };
}

// ---------------------------------------------------------------------------
// Guardrails — doc/05 §4 and §6. The banners that catch you gaming your own app.
// ---------------------------------------------------------------------------

export type Guardrail = {
  key: string;
  /** red for the NC banner (doc/05 §4.1); warn for the rest. */
  severity: 'red' | 'warn';
  title: string;
  /** Exactly what was measured, with the numbers, so the banner can be checked. */
  measuring: string;
  /** What to do about it. A warning without an action is just nagging. */
  action: string;
};

/**
 * Every banner in one place, in display order: NC first because it is the one that
 * can make a bad week look good, then the two OQ-2 traps (empty and thin weeks), then
 * late adds. Each banner says what it measured and what to do about it.
 *
 * `recentWindow` is how many finished weeks the thin/empty checks look back over.
 */
export function guardrails(
  rollups: WeekRollup[],
  tasks: TaskFacts[],
  currentWeek: DateString,
  recentWindow = 4,
): Guardrail[] {
  const out: Guardrail[] = [];
  const series = weekSeries(rollups, currentWeek, recentWindow + 1);
  const current = series[series.length - 1];

  // 4.1 — NC rate this week. Strictly greater than 20%: 21% shows, 19% does not.
  const row = current?.row ?? null;
  const ncRate = row?.nc_rate ?? 0;
  if (row && ncRate > NC_BANNER_THRESHOLD) {
    const nc = row.not_counted ?? 0;
    const total = row.total ?? 0;
    out.push({
      key: 'nc',
      severity: 'red',
      title: `${nc} of ${total} tasks this week ${nc === 1 ? 'is' : 'are'} marked Not Counted. Is that really true?`,
      measuring:
        `NC rate is NC ÷ every finalized task in the week: ${nc} of ${total} = ${formatRate(ncRate)}. ` +
        'Anything over 20% is flagged, because NC is left out of the completion rate and is ' +
        'the one status that can make a bad week look good.',
      action:
        'Re-read each NC note. If it was in your control after all, close the task again as N ' +
        'and say why. The rate will fall, and that will be the honest number.',
    });
  }

  // OQ-2 — the last few finished weeks, only those after history began.
  const finished = series.filter((s) => s.kind !== 'in_progress' && s.kind !== 'before_history');
  const window = finished.length;

  const empty = finished.filter((s) => s.kind === 'missing');
  if (empty.length > 0) {
    out.push({
      key: 'empty_weeks',
      severity: 'warn',
      title: `${empty.length} of the last ${window} week${window === 1 ? '' : 's'} had nothing committed.`,
      measuring:
        `Finished weeks with zero finalized tasks: ${empty.map((s) => formatWeekRange(s.weekStart)).join(', ')}. ` +
        'An empty week is not skipped. It breaks the streak and counts as not kept — ' +
        'committing to nothing is not the same as keeping your word.',
      action: 'Plan something, even something small. Three honest tasks beat none.',
    });
  }

  const thin = finished.filter(
    (s) => s.kind === 'not_kept' && (s.row?.counted_total ?? 0) < MIN_COUNTED_FOR_KEPT,
  );
  if (thin.length > 0) {
    const detail = thin
      .map((s) => `${formatWeekRange(s.weekStart)} had ${s.row?.counted_total ?? 0}`)
      .join(', ');
    out.push({
      key: 'thin_weeks',
      severity: 'warn',
      title: `${thin.length} of the last ${window} week${window === 1 ? '' : 's'} ${thin.length === 1 ? 'was' : 'were'} too thin to count.`,
      measuring:
        `A kept week needs at least ${MIN_COUNTED_FOR_KEPT} counted (C or N) tasks, whatever the rate — ` +
        `otherwise one trivial task at 100% would prop up a streak. ${detail}.`,
      action:
        'Plan at least three real commitments a week, so that a good week can actually count.',
    });
  }

  // 4.2 — late adds, this week and last. Two banners are possible; both are true.
  const lastWeek = shiftWeek(currentWeek, -1);
  for (const [weekStart, label] of [
    [currentWeek, 'this week'],
    [lastWeek, 'last week'],
  ] as const) {
    const split = lateAddSplit(tasks.filter((t) => t.week_start === weekStart));
    if (!split.differs) continue;
    const flattering = (split.withRate ?? 0) > (split.withoutRate ?? 0);
    out.push({
      key: `late_adds:${weekStart}`,
      severity: 'warn',
      title: flattering
        ? `Late adds are flattering ${label}'s rate.`
        : `Late adds are dragging ${label}'s rate down.`,
      measuring:
        `${split.lateAdds} of ${split.finalized} tasks ${label} were committed after Wednesday. ` +
        `Completion is ${formatRate(split.withRate)} with them and ${formatRate(split.withoutRate)} ` +
        'without — more than 10 points apart.',
      action: flattering
        ? 'Commit on Monday. A task added on Thursday that is already half done is not a commitment, it is a receipt.'
        : 'Commit on Monday. Tasks added late are the ones that get squeezed out; plan them at the start of the week.',
    });
  }

  return out;
}
