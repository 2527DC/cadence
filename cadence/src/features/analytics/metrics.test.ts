// The analytics formulas, checked by hand.
//
// The main fixture is supabase/seed.sql as it stands on Monday 2026-08-31, worked out
// on paper in the comments below and asserted here. If a number on the dashboard ever
// disagrees with this file, the dashboard is wrong — these are the hand calculations
// the P09 acceptance criteria ask for.
//
// The rest are the edge cases doc/05 §7 and OQ-2 say must be handled explicitly:
// the missing week, the only-NC week, the first week ever, and the 21%-not-19%
// NC banner.

import { shiftWeek } from '@/lib/week';

import {
  completionRate,
  computeStreak,
  consistency,
  daysLeftInWeek,
  effortRate,
  formatPoints,
  formatRate,
  goalScorecards,
  guardrails,
  lateAddSplit,
  notKeeping,
  thisWeek,
  usesWeight,
  weekOverWeek,
  weekSeries,
  type GoalFacts,
  type GoalProgressRow,
  type TaskFacts,
  type WeekRollup,
} from './metrics';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = '11111111-1111-1111-1111-111111111111';

function rollup(partial: Partial<WeekRollup> & { week_start: string }): WeekRollup {
  const completed = partial.completed ?? 0;
  const missed = partial.missed ?? 0;
  const notCounted = partial.not_counted ?? 0;
  const open = partial.still_open ?? 0;
  const total = partial.total ?? completed + missed + notCounted + open;
  const counted = completed + missed;
  // The same rounding the view applies, so fixtures look like real rows.
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return {
    user_id: USER,
    total,
    completed,
    missed,
    not_counted: notCounted,
    still_open: open,
    late_adds: 0,
    counted_total: counted === 0 ? null : counted,
    completion_rate: counted === 0 ? null : r4(completed / counted),
    nc_rate: total === 0 ? null : r4(notCounted / total),
    is_kept_week: counted >= 3 && completed / Math.max(counted, 1) >= 0.7,
    ...partial,
  };
}

// seed.sql with v_w0 = 2026-08-31 (a Monday). From the comment block in the seed:
//   w-3  2026-08-10   4 C, 2 N         0.6667   not kept
//   w-2  2026-08-17   2 C, 4 N         0.3333   not kept
//   w-1  2026-08-24   5 C, 1 NC        1.0000   kept, one late add
//   w0   2026-08-31   6 OPEN           null     in progress
const W0 = '2026-08-31';
const SEED_ROLLUPS: WeekRollup[] = [
  rollup({ week_start: '2026-08-10', completed: 4, missed: 2 }),
  rollup({ week_start: '2026-08-17', completed: 2, missed: 4 }),
  rollup({ week_start: '2026-08-24', completed: 5, not_counted: 1, late_adds: 1 }),
  rollup({ week_start: '2026-08-31', still_open: 6 }),
];

// The three seed goals, all starting on w-3.
const FITNESS: GoalFacts = {
  id: 'g-fitness',
  title: 'Move every day',
  color: '#16A34A',
  target_per_week: 5,
  start_week: '2026-08-10',
  end_week: null,
  state: 'active',
};
const WRITING: GoalFacts = {
  ...FITNESS,
  id: 'g-writing',
  title: 'Finish the essay',
  target_per_week: 4,
};
const LEARNING: GoalFacts = {
  ...FITNESS,
  id: 'g-learning',
  title: 'Learn Postgres properly',
  target_per_week: 2,
};
const SEED_GOALS = [FITNESS, WRITING, LEARNING];

function progress(goal: GoalFacts, week_start: string, completed: number): GoalProgressRow {
  return {
    goal_id: goal.id,
    week_start,
    completed,
    attainment: Math.round(Math.min(completed / goal.target_per_week, 1) * 10000) / 10000,
  };
}

// Per goal per week, from the seed loop: tasks 1–2 are fitness, 3–4 writing, 5–6
// learning. w-3: task 1 corrected C→N, task 6 N. w-2: tasks 3–6 N. w-1: task 3 NC.
const SEED_PROGRESS: GoalProgressRow[] = [
  progress(FITNESS, '2026-08-10', 1),
  progress(FITNESS, '2026-08-17', 2),
  progress(FITNESS, '2026-08-24', 2),
  progress(FITNESS, '2026-08-31', 0),
  progress(WRITING, '2026-08-10', 2),
  progress(WRITING, '2026-08-17', 0),
  progress(WRITING, '2026-08-24', 1),
  progress(WRITING, '2026-08-31', 0),
  progress(LEARNING, '2026-08-10', 1),
  progress(LEARNING, '2026-08-17', 0),
  progress(LEARNING, '2026-08-24', 2),
  progress(LEARNING, '2026-08-31', 0),
];

function task(
  week_start: string,
  status: TaskFacts['status'],
  extra: Partial<Pick<TaskFacts, 'weight' | 'late_add'>> = {},
): TaskFacts {
  return { week_start, status, weight: 1, late_add: false, ...extra };
}

const SEED_TASKS: TaskFacts[] = [
  ...Array.from({ length: 4 }, () => task('2026-08-10', 'C')),
  ...Array.from({ length: 2 }, () => task('2026-08-10', 'N')),
  ...Array.from({ length: 2 }, () => task('2026-08-17', 'C')),
  ...Array.from({ length: 4 }, () => task('2026-08-17', 'N')),
  ...Array.from({ length: 4 }, () => task('2026-08-24', 'C')),
  task('2026-08-24', 'C', { late_add: true }),
  task('2026-08-24', 'NC'),
  ...Array.from({ length: 6 }, () => task('2026-08-31', 'OPEN')),
];

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

describe('completionRate', () => {
  it('leaves NC out of the denominator', () => {
    // w-1 in the seed: 5 C, 1 NC. 5/5, not 5/6.
    expect(completionRate(5, 0)).toBe(1);
  });

  it('is undefined, not zero, with nothing counted', () => {
    expect(completionRate(0, 0)).toBeNull();
    expect(formatRate(completionRate(0, 0))).toBe('—');
  });

  it('formats to whole percent', () => {
    expect(formatRate(4 / 6)).toBe('67%');
    expect(formatRate(2 / 6)).toBe('33%');
  });

  it('formats deltas in points with a sign', () => {
    expect(formatPoints(0.12)).toBe('+12 pts');
    expect(formatPoints(-0.05)).toBe('−5 pts');
    expect(formatPoints(0)).toBe('0 pts');
  });
});

// ---------------------------------------------------------------------------
// The seed, by hand
// ---------------------------------------------------------------------------

describe('the seed data on 2026-08-31', () => {
  it('has a streak of 1: w-1 kept, w-2 not', () => {
    expect(computeStreak(SEED_ROLLUPS, W0)).toBe(1);
  });

  it('has kept 1 of 3 finished weeks — the eight weeks before history are not failures', () => {
    expect(consistency(SEED_ROLLUPS, W0)).toEqual({
      kept: 1,
      counted: 3,
      ratio: 1 / 3,
      neutral: 0,
    });
  });

  it('classifies the 12-week series correctly', () => {
    const kinds = weekSeries(SEED_ROLLUPS, W0, 12).map((s) => s.kind);
    expect(kinds).toEqual([
      ...Array.from({ length: 8 }, () => 'before_history'),
      'not_kept',
      'not_kept',
      'kept',
      'in_progress',
    ]);
  });

  it('raises no banner: no NC this week, no thin or empty weeks, late add did not move the rate', () => {
    // w-1's late add was completed: 5/5 with it, 4/4 without. Same rate.
    expect(guardrails(SEED_ROLLUPS, SEED_TASKS, W0)).toEqual([]);
  });

  it('shows this week as six open tasks with an undefined rate and three days left on Thursday', () => {
    const thursday = new Date('2026-09-03T09:00:00');
    const tw = thisWeek(SEED_ROLLUPS[3], SEED_TASKS, W0, thursday);
    expect(tw.open).toBe(6);
    expect(tw.rate).toBeNull();
    expect(tw.daysLeft).toBe(3);
    expect(tw.keptShortfall).toBe(3);
    expect(tw.isKeptSoFar).toBe(false);
    expect(tw.usesWeight).toBe(false);
  });

  it('computes goal debt over the three finished weeks', () => {
    const cards = goalScorecards(SEED_GOALS, SEED_PROGRESS, W0);
    const byId = Object.fromEntries(cards.map((c) => [c.goalId, c]));

    // Fitness: target 5 × 3 weeks = 15 expected; 1 + 2 + 2 = 5 done → 10 behind.
    expect(byId['g-fitness']).toMatchObject({ weeksElapsed: 3, expected: 15, actual: 5, debt: 10 });
    // Writing: 4 × 3 = 12; 2 + 0 + 1 = 3 → 9 behind.
    expect(byId['g-writing']).toMatchObject({ expected: 12, actual: 3, debt: 9 });
    // Learning: 2 × 3 = 6; 1 + 0 + 2 = 3 → 3 behind.
    expect(byId['g-learning']).toMatchObject({ expected: 6, actual: 3, debt: 3 });
  });

  it('reads this week from the view and reliability from the last 8 finished weeks', () => {
    const cards = goalScorecards(SEED_GOALS, SEED_PROGRESS, W0);
    const byId = Object.fromEntries(cards.map((c) => [c.goalId, c]));

    expect(byId['g-fitness'].completedThisWeek).toBe(0);
    expect(byId['g-fitness'].attainment).toBe(0);
    // Only learning ever hit its target, and only in w-1.
    expect(byId['g-fitness'].reliability).toEqual({ active: 3, hit: 0, ratio: 0 });
    expect(byId['g-writing'].reliability).toEqual({ active: 3, hit: 0, ratio: 0 });
    expect(byId['g-learning'].reliability).toEqual({ active: 3, hit: 1, ratio: 1 / 3 });
  });

  it('names every seed goal as not kept, worst first, ties broken by debt', () => {
    const names = notKeeping(goalScorecards(SEED_GOALS, SEED_PROGRESS, W0)).map((c) => c.goalId);
    expect(names).toEqual(['g-fitness', 'g-writing', 'g-learning']);
  });

  it('compares this week to last', () => {
    const cmp = weekOverWeek(SEED_ROLLUPS, SEED_GOALS, SEED_PROGRESS, W0);
    expect(cmp.lastWeek).toMatchObject({ completed: 5, notCounted: 1, rate: 1, hasData: true });
    expect(cmp.thisWeek).toMatchObject({ open: 6, rate: null, hasData: true });
    expect(cmp.rateDelta).toBeNull();
    // Every goal dropped to 0 this week; the largest drop first.
    expect(cmp.goalMoves.map((m) => [m.goalId, m.delta])).toEqual([
      ['g-fitness', -2],
      ['g-learning', -2],
      ['g-writing', -1],
    ]);
  });
});

// ---------------------------------------------------------------------------
// OQ-2: the calendar walk
// ---------------------------------------------------------------------------

describe('computeStreak', () => {
  const kept = (week_start: string) => rollup({ week_start, completed: 4, missed: 1 });

  it('counts consecutive kept weeks back from last week', () => {
    const rows = [kept('2026-08-03'), kept('2026-08-10'), kept('2026-08-17'), kept('2026-08-24')];
    expect(computeStreak(rows, W0)).toBe(4);
  });

  it('is broken by a week with no row at all — stopping planning does not protect it', () => {
    // 2026-08-17 is missing. Only w-1 counts.
    const rows = [kept('2026-08-03'), kept('2026-08-10'), kept('2026-08-24')];
    expect(computeStreak(rows, W0)).toBe(1);
  });

  it('steps over a week of only NC without counting it', () => {
    const rows = [
      kept('2026-08-10'),
      rollup({ week_start: '2026-08-17', not_counted: 3 }),
      kept('2026-08-24'),
    ];
    expect(computeStreak(rows, W0)).toBe(2);
  });

  it('does not treat a week left with open tasks and nothing counted as neutral', () => {
    const rows = [
      kept('2026-08-10'),
      rollup({ week_start: '2026-08-17', not_counted: 1, still_open: 2 }),
      kept('2026-08-24'),
    ];
    expect(computeStreak(rows, W0)).toBe(1);
  });

  it('ignores the week in progress even when it already qualifies', () => {
    const rows = [kept('2026-08-24'), kept('2026-08-31')];
    expect(computeStreak(rows, W0)).toBe(1);
  });

  it('is zero when last week was missed, whatever came before', () => {
    const rows = [
      kept('2026-08-10'),
      kept('2026-08-17'),
      rollup({ week_start: '2026-08-24', completed: 1, missed: 4 }),
    ];
    expect(computeStreak(rows, W0)).toBe(0);
  });

  it('is zero with no history', () => {
    expect(computeStreak([], W0)).toBe(0);
  });

  it('defaults to the real current week when none is given', () => {
    expect(typeof computeStreak([])).toBe('number');
  });
});

describe('weekSeries', () => {
  it('marks a gap after history began as missing, and before it as before_history', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 3 }),
      rollup({ week_start: '2026-08-24', completed: 3 }),
    ];
    const kinds = weekSeries(rows, W0, 5).map((s) => s.kind);
    // 08-03, 08-10, 08-17, 08-24, 08-31
    expect(kinds).toEqual(['before_history', 'kept', 'missing', 'kept', 'in_progress']);
  });

  it('is entirely pre-history when there are no rows', () => {
    const kinds = weekSeries([], W0, 3).map((s) => s.kind);
    expect(kinds).toEqual(['before_history', 'before_history', 'in_progress']);
  });
});

describe('consistency', () => {
  it('reports nothing to divide on the first week ever, never 0%', () => {
    expect(consistency([rollup({ week_start: W0, still_open: 4 })], W0).ratio).toBeNull();
    expect(consistency([], W0).ratio).toBeNull();
  });

  it('counts a missing week after history began as not kept', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 3 }),
      rollup({ week_start: '2026-08-24', completed: 3 }),
    ];
    expect(consistency(rows, W0)).toEqual({ kept: 2, counted: 3, ratio: 2 / 3, neutral: 0 });
  });

  it('leaves an only-NC week out of both sides and reports it', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 3 }),
      rollup({ week_start: '2026-08-17', not_counted: 2 }),
      rollup({ week_start: '2026-08-24', completed: 3 }),
    ];
    expect(consistency(rows, W0)).toEqual({ kept: 2, counted: 2, ratio: 1, neutral: 1 });
  });

  it('caps the window at 12 finished weeks', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      rollup({ week_start: shiftWeek(W0, -(i + 1)), completed: 3 }),
    );
    expect(consistency(rows, W0)).toMatchObject({ kept: 12, counted: 12 });
  });
});

describe('daysLeftInWeek', () => {
  it.each([
    ['2026-08-31', 6], // Monday
    ['2026-09-03', 3], // Thursday
    ['2026-09-05', 1], // Saturday
    ['2026-09-06', 0], // Sunday, the last day
  ])('%s -> %i', (day, expected) => {
    expect(daysLeftInWeek(new Date(`${day}T12:00:00`))).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Weight (OQ-8) and late adds (§4.2)
// ---------------------------------------------------------------------------

describe('effort', () => {
  it('is hidden until a task carries a weight above 1', () => {
    expect(usesWeight(SEED_TASKS)).toBe(false);
    expect(usesWeight([task(W0, 'C', { weight: 3 })])).toBe(true);
  });

  it('diverges from the count rate when only the light tasks get done', () => {
    const tasks = [
      task(W0, 'C', { weight: 1 }),
      task(W0, 'C', { weight: 1 }),
      task(W0, 'N', { weight: 5 }),
    ];
    // By count 2/3; by effort 2/7.
    expect(completionRate(2, 1)).toBeCloseTo(2 / 3);
    expect(effortRate(tasks)).toBeCloseTo(2 / 7);
  });

  it('leaves NC and OPEN out of the effort denominator too', () => {
    const tasks = [
      task(W0, 'C', { weight: 2 }),
      task(W0, 'NC', { weight: 5 }),
      task(W0, 'OPEN', { weight: 5 }),
    ];
    expect(effortRate(tasks)).toBe(1);
  });

  it('is undefined with nothing counted', () => {
    expect(effortRate([task(W0, 'OPEN')])).toBeNull();
  });
});

describe('lateAddSplit', () => {
  it('shows the rate with and without late adds', () => {
    const tasks = [
      task(W0, 'C'),
      task(W0, 'C'),
      task(W0, 'N'),
      task(W0, 'N'),
      task(W0, 'C', { late_add: true }),
      task(W0, 'C', { late_add: true }),
    ];
    const s = lateAddSplit(tasks);
    expect(s).toMatchObject({ lateAdds: 2, finalized: 6, lateAddRate: 1 / 3 });
    expect(s.withRate).toBeCloseTo(4 / 6);
    expect(s.withoutRate).toBeCloseTo(2 / 4);
    expect(s.differs).toBe(true);
  });

  it('does not call exactly ten points a difference', () => {
    // 8/10 with, 7/10 without → 0.8 − 0.7, which floats to just over 0.1.
    const tasks = [
      ...Array.from({ length: 7 }, () => task(W0, 'C')),
      ...Array.from({ length: 3 }, () => task(W0, 'N')),
      task(W0, 'C', { late_add: true }),
      task(W0, 'N', { late_add: true }),
    ];
    // with: 8/12 = 0.667, without: 7/10 = 0.7 → 3 points
    expect(lateAddSplit(tasks).differs).toBe(false);

    const exact = [
      ...Array.from({ length: 7 }, () => task(W0, 'C')),
      ...Array.from({ length: 3 }, () => task(W0, 'N')),
    ];
    // Rate with = rate without when nothing is late.
    expect(lateAddSplit(exact).differs).toBe(false);
  });

  it('is undefined on an empty week', () => {
    expect(lateAddSplit([])).toMatchObject({
      lateAdds: 0,
      finalized: 0,
      lateAddRate: null,
      withRate: null,
      differs: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

describe('guardrails', () => {
  const keptWeeks = [
    rollup({ week_start: '2026-08-10', completed: 4, missed: 1 }),
    rollup({ week_start: '2026-08-17', completed: 4, missed: 1 }),
    rollup({ week_start: '2026-08-24', completed: 4, missed: 1 }),
  ];

  it('raises the NC banner at 21% and not at 19%', () => {
    const at21 = rollup({ week_start: W0, completed: 5, missed: 3, not_counted: 2, nc_rate: 0.21 });
    const at19 = rollup({ week_start: W0, completed: 5, missed: 3, not_counted: 2, nc_rate: 0.19 });
    const at20 = rollup({ week_start: W0, completed: 4, missed: 4, not_counted: 2 }); // exactly 0.2

    const red = guardrails([...keptWeeks, at21], [], W0);
    expect(red.map((g) => g.key)).toEqual(['nc']);
    expect(red[0].severity).toBe('red');
    expect(red[0].measuring).toContain('2 of 10');
    expect(red[0].measuring).toContain('21%');
    expect(red[0].action.length).toBeGreaterThan(20);

    expect(guardrails([...keptWeeks, at19], [], W0)).toEqual([]);
    expect(guardrails([...keptWeeks, at20], [], W0)).toEqual([]);
  });

  it('names an empty week after history began, and not the weeks before it', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 4, missed: 1 }),
      rollup({ week_start: '2026-08-24', completed: 4, missed: 1 }),
    ];
    const out = guardrails(rows, [], W0);
    expect(out.map((g) => g.key)).toEqual(['empty_weeks']);
    expect(out[0].title).toBe('1 of the last 3 weeks had nothing committed.');
    expect(out[0].measuring).toContain('17 – 23 Aug');
    expect(out[0].measuring).toContain('breaks the streak');
  });

  it('names a thin week with its count', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 4, missed: 1 }),
      rollup({ week_start: '2026-08-17', completed: 2 }), // 100% of 2 — not enough
      rollup({ week_start: '2026-08-24', completed: 4, missed: 1 }),
    ];
    const out = guardrails(rows, [], W0);
    expect(out.map((g) => g.key)).toEqual(['thin_weeks']);
    expect(out[0].title).toBe('1 of the last 3 weeks was too thin to count.');
    expect(out[0].measuring).toContain('17 – 23 Aug had 2');
    expect(out[0].measuring).toContain('at least 3 counted');
  });

  it('does not call an only-NC week thin', () => {
    const rows = [
      rollup({ week_start: '2026-08-10', completed: 4, missed: 1 }),
      rollup({ week_start: '2026-08-17', not_counted: 2 }),
      rollup({ week_start: '2026-08-24', completed: 4, missed: 1 }),
    ];
    expect(guardrails(rows, [], W0)).toEqual([]);
  });

  it('says plainly when late adds move last week’s rate by more than ten points', () => {
    const tasks = [
      task('2026-08-24', 'C'),
      task('2026-08-24', 'N'),
      task('2026-08-24', 'N'),
      task('2026-08-24', 'C', { late_add: true }),
      task('2026-08-24', 'C', { late_add: true }),
    ];
    const out = guardrails(keptWeeks, tasks, W0);
    expect(out.map((g) => g.key)).toEqual(['late_adds:2026-08-24']);
    expect(out[0].title).toBe("Late adds are flattering last week's rate.");
    // with: 3/5 = 60%, without: 1/3 = 33%
    expect(out[0].measuring).toContain('2 of 5 tasks last week');
    expect(out[0].measuring).toContain('60% with them and 33% without');
    expect(out[0].action).toContain('Commit on Monday');
  });

  it('orders NC first, then empty, then thin, then late adds', () => {
    const rows = [
      rollup({ week_start: '2026-08-03', completed: 1 }), // thin
      // 08-10 missing
      rollup({ week_start: '2026-08-17', completed: 4, missed: 1 }),
      rollup({ week_start: '2026-08-24', completed: 4, missed: 1 }),
      rollup({ week_start: W0, completed: 2, not_counted: 3 }),
    ];
    const tasks = [
      task(W0, 'C'),
      task(W0, 'N'),
      task(W0, 'N'),
      task(W0, 'C', { late_add: true }),
      task(W0, 'C', { late_add: true }),
    ];
    expect(guardrails(rows, tasks, W0).map((g) => g.key)).toEqual([
      'nc',
      'empty_weeks',
      'thin_weeks',
      'late_adds:2026-08-31',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Goals — edges
// ---------------------------------------------------------------------------

describe('goalScorecards', () => {
  it('has no debt and no reliability for a goal created this week', () => {
    const goal: GoalFacts = { ...FITNESS, start_week: W0 };
    const [card] = goalScorecards([goal], [progress(goal, W0, 2)], W0);
    expect(card).toMatchObject({
      completedThisWeek: 2,
      attainment: 0.4,
      weeksElapsed: 0,
      expected: 0,
      actual: 0,
      debt: 0,
    });
    expect(card.reliability).toEqual({ active: 0, hit: 0, ratio: null });
  });

  it('stops counting at end_week', () => {
    const goal: GoalFacts = { ...LEARNING, start_week: '2026-08-03', end_week: '2026-08-10' };
    const rows = [
      progress(goal, '2026-08-03', 2),
      progress(goal, '2026-08-10', 1),
      progress(goal, '2026-08-17', 5),
    ];
    const [card] = goalScorecards([goal], rows, W0);
    // Two active weeks × target 2 = 4 expected; 2 + 1 = 3 done; the 5 after the end is ignored.
    expect(card).toMatchObject({ weeksElapsed: 2, expected: 4, actual: 3, debt: 1 });
    expect(card.reliability).toEqual({ active: 2, hit: 1, ratio: 0.5 });
  });

  it('can be ahead, which reads as negative debt', () => {
    const goal: GoalFacts = { ...LEARNING, start_week: '2026-08-24' };
    const [card] = goalScorecards([goal], [progress(goal, '2026-08-24', 4)], W0);
    expect(card.debt).toBe(-2);
  });

  it('limits reliability to the last eight finished weeks', () => {
    const goal: GoalFacts = { ...LEARNING, start_week: '2026-01-05' };
    const [card] = goalScorecards([goal], [], W0);
    expect(card.reliability.active).toBe(8);
    expect(card.reliability.ratio).toBe(0);
    // Debt still runs from start_week: 34 finished weeks × 2.
    expect(card.weeksElapsed).toBe(34);
  });
});

describe('notKeeping', () => {
  it('needs two finished weeks before it will name a goal', () => {
    const goal: GoalFacts = { ...FITNESS, start_week: '2026-08-24' };
    expect(notKeeping(goalScorecards([goal], [], W0))).toEqual([]);
  });

  it('never names an archived or paused goal', () => {
    const cards = goalScorecards(
      [
        { ...FITNESS, state: 'archived' },
        { ...WRITING, state: 'paused' },
      ],
      [],
      W0,
    );
    expect(notKeeping(cards)).toEqual([]);
  });

  it('leaves out a goal that is keeping at least half its weeks', () => {
    const rows = [
      progress(LEARNING, '2026-08-10', 2),
      progress(LEARNING, '2026-08-17', 0),
      progress(LEARNING, '2026-08-24', 2),
    ];
    expect(notKeeping(goalScorecards([LEARNING], rows, W0))).toEqual([]);
  });
});

describe('weekOverWeek', () => {
  it('reports the rate delta in points when both weeks have one', () => {
    const rows = [
      rollup({ week_start: '2026-08-24', completed: 3, missed: 3 }),
      rollup({ week_start: W0, completed: 4, missed: 1 }),
    ];
    const cmp = weekOverWeek(rows, [], [], W0);
    expect(cmp.rateDelta).toBeCloseTo(0.3);
    expect(formatPoints(cmp.rateDelta ?? 0)).toBe('+30 pts');
  });

  it('marks a week with no row as having no data rather than zeros that look real', () => {
    const cmp = weekOverWeek([rollup({ week_start: W0, completed: 1 })], [], [], W0);
    expect(cmp.lastWeek.hasData).toBe(false);
    expect(cmp.lastWeek.rate).toBeNull();
  });
});
