// The review's data rules, checked by hand.
//
// The two that matter most: an uncommitted draft is not a failure but is not invisible
// either, and the stats snapshot does not move when the week does. The second one is a
// P11 acceptance criterion and is asserted directly.

import type { GoalScorecard, ThisWeek, WeekComparison } from '@/features/analytics/metrics';
import type { Tables } from '@/types/database.types';

import {
  REVIEW_STATS_VERSION,
  buildReviewStats,
  byClosedAt,
  groupReviewTasks,
  latestEvents,
  parseReviewStats,
  statsDrift,
} from './review-model';

type Task = Pick<Tables<'tasks'>, 'id' | 'status' | 'is_finalized' | 'late_add' | 'closed_at'>;

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, status: 'OPEN', is_finalized: true, late_add: false, closed_at: null, ...over };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe('groupReviewTasks', () => {
  const tasks: Task[] = [
    task('open-1'),
    task('done-1', { status: 'C', closed_at: '2026-09-03T10:00:00Z' }),
    task('missed-1', { status: 'N', closed_at: '2026-09-04T10:00:00Z' }),
    task('waived-1', { status: 'NC', closed_at: '2026-09-05T10:00:00Z' }),
    task('draft-1', { is_finalized: false }),
    task('late-1', { status: 'C', late_add: true, closed_at: '2026-09-06T10:00:00Z' }),
  ];

  it('separates the four groups the review reads out', () => {
    const g = groupReviewTasks(tasks);
    expect(g.stillOpen.map((t) => t.id)).toEqual(['open-1']);
    expect(g.closed.map((t) => t.id)).toEqual(['done-1', 'missed-1', 'waived-1', 'late-1']);
    expect(g.drafts.map((t) => t.id)).toEqual(['draft-1']);
    expect(g.lateAdds.map((t) => t.id)).toEqual(['late-1']);
  });

  it('never counts a draft as still open — it was never a commitment', () => {
    const g = groupReviewTasks([task('d', { is_finalized: false })]);
    expect(g.stillOpen).toEqual([]);
    expect(g.drafts).toHaveLength(1);
  });

  it('leaves an unfinalized row out of the late adds, whatever the column says', () => {
    // late_add is computed at finalization, so a draft should never carry it — but if
    // one ever did, calling it a late add would be wrong.
    const g = groupReviewTasks([task('d', { is_finalized: false, late_add: true })]);
    expect(g.lateAdds).toEqual([]);
  });

  it('lists a late add in both closed and lateAdds — it is one task, seen twice', () => {
    const g = groupReviewTasks([task('l', { status: 'N', late_add: true })]);
    expect(g.closed).toHaveLength(1);
    expect(g.lateAdds).toHaveLength(1);
  });

  it('handles an empty week', () => {
    expect(groupReviewTasks([])).toEqual({
      stillOpen: [],
      closed: [],
      drafts: [],
      lateAdds: [],
    });
  });
});

describe('byClosedAt', () => {
  it('reads the week in the order it happened', () => {
    const rows = [
      task('c', { closed_at: '2026-09-05T10:00:00Z' }),
      task('a', { closed_at: '2026-09-01T10:00:00Z' }),
      task('b', { closed_at: '2026-09-03T10:00:00Z' }),
    ];
    expect([...rows].sort(byClosedAt).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts a row with no close time first rather than crashing', () => {
    const rows = [task('a', { closed_at: '2026-09-01T10:00:00Z' }), task('none')];
    expect([...rows].sort(byClosedAt).map((t) => t.id)).toEqual(['none', 'a']);
  });
});

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

type Event = Pick<Tables<'task_status_events'>, 'task_id' | 'created_at'>;

describe('latestEvents', () => {
  it('keeps the entry that stands, and counts the corrections behind it', () => {
    const events: Event[] = [
      { task_id: 't1', created_at: '2026-09-01T10:00:00Z' },
      { task_id: 't1', created_at: '2026-09-04T10:00:00Z' },
      { task_id: 't2', created_at: '2026-09-02T10:00:00Z' },
    ];
    const map = latestEvents(events);
    expect(map.get('t1')?.event.created_at).toBe('2026-09-04T10:00:00Z');
    expect(map.get('t1')?.corrections).toBe(1);
    expect(map.get('t2')?.corrections).toBe(0);
  });

  it('does not depend on the rows arriving in order', () => {
    const events: Event[] = [
      { task_id: 't1', created_at: '2026-09-04T10:00:00Z' },
      { task_id: 't1', created_at: '2026-09-01T10:00:00Z' },
    ];
    expect(latestEvents(events).get('t1')?.event.created_at).toBe('2026-09-04T10:00:00Z');
  });

  it('says nothing about a task with no ledger entry', () => {
    expect(latestEvents([]).get('t1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

const WEEK: ThisWeek = {
  weekStart: '2026-08-31',
  completed: 6,
  missed: 2,
  notCounted: 1,
  open: 1,
  total: 10,
  counted: 8,
  rate: 0.75,
  ncRate: 0.1,
  usesWeight: false,
  effortRate: 0.75,
  lateAdds: {
    lateAdds: 2,
    finalized: 10,
    lateAddRate: 0.2,
    withRate: 0.75,
    withoutRate: 0.6,
    differs: true,
  },
  daysLeft: 0,
  isKeptSoFar: true,
  keptShortfall: 0,
};

const COMPARISON: WeekComparison = {
  thisWeek: {
    weekStart: '2026-08-31',
    hasData: true,
    completed: 6,
    missed: 2,
    notCounted: 1,
    open: 1,
    counted: 8,
    rate: 0.75,
    ncRate: 0.1,
  },
  lastWeek: {
    weekStart: '2026-08-24',
    hasData: true,
    completed: 4,
    missed: 4,
    notCounted: 0,
    open: 0,
    counted: 8,
    rate: 0.5,
    ncRate: 0,
  },
  rateDelta: 0.25,
  goalMoves: [],
};

const GOALS: GoalScorecard[] = [
  {
    goalId: 'g1',
    title: 'Ship the app',
    color: null,
    state: 'active',
    target: 3,
    completedThisWeek: 2,
    attainment: 2 / 3,
    weeksElapsed: 4,
    expected: 12,
    actual: 9,
    debt: 3,
    reliability: { active: 4, hit: 2, ratio: 0.5 },
  },
];

const CAPTURED = new Date('2026-09-06T14:44:00.000Z');

describe('buildReviewStats', () => {
  const stats = buildReviewStats({
    week: WEEK,
    comparison: COMPARISON,
    goals: GOALS,
    draftCount: 3,
    capturedAt: CAPTURED,
  });

  it('records the counts and the rate the week actually had', () => {
    expect(stats).toMatchObject({
      version: REVIEW_STATS_VERSION,
      week_start: '2026-08-31',
      captured_at: '2026-09-06T14:44:00.000Z',
      total: 10,
      completed: 6,
      missed: 2,
      not_counted: 1,
      still_open: 1,
      counted: 8,
      completion_rate: 0.75,
      nc_rate: 0.1,
      is_kept_week: true,
    });
  });

  it('records the rate both with and without late adds', () => {
    expect(stats.late_adds).toBe(2);
    expect(stats.rate_with_late_adds).toBe(0.75);
    expect(stats.rate_without_late_adds).toBe(0.6);
  });

  it('records the week it was compared against, not just the delta', () => {
    expect(stats.previous_week_start).toBe('2026-08-24');
    expect(stats.previous_completion_rate).toBe(0.5);
    expect(stats.rate_delta).toBe(0.25);
  });

  it('records the drafts that were never committed', () => {
    expect(stats.drafts_not_committed).toBe(3);
  });

  it('records per-goal attainment', () => {
    expect(stats.goals).toEqual([
      { goal_id: 'g1', title: 'Ship the app', target: 3, completed: 2, attainment: 2 / 3 },
    ]);
  });

  it('keeps an undefined rate as null, never as 0', () => {
    const empty = buildReviewStats({
      week: { ...WEEK, completed: 0, missed: 0, counted: 0, rate: null },
      comparison: { ...COMPARISON, rateDelta: null },
      goals: [],
      draftCount: 0,
      capturedAt: CAPTURED,
    });
    expect(empty.completion_rate).toBeNull();
    expect(empty.rate_delta).toBeNull();
  });

  it('survives a round trip through JSON, which is how it is stored', () => {
    expect(parseReviewStats(JSON.parse(JSON.stringify(stats)))).toEqual(stats);
  });
});

describe('parseReviewStats', () => {
  it('refuses anything that is not a stats object', () => {
    expect(parseReviewStats(null)).toBeNull();
    expect(parseReviewStats({})).toBeNull();
    expect(parseReviewStats([])).toBeNull();
    expect(parseReviewStats('{}')).toBeNull();
    expect(parseReviewStats({ week_start: '' })).toBeNull();
  });

  it('fills in what an older snapshot did not have rather than showing NaN', () => {
    const parsed = parseReviewStats({ week_start: '2026-08-31' });
    expect(parsed).toMatchObject({ version: 0, total: 0, completed: 0, is_kept_week: false });
    expect(parsed?.completion_rate).toBeNull();
    expect(parsed?.goals).toEqual([]);
  });

  it('drops a goal entry it cannot identify', () => {
    const parsed = parseReviewStats({
      week_start: '2026-08-31',
      goals: [{ title: 'no id' }, { goal_id: 'g1' }],
    });
    expect(parsed?.goals).toEqual([
      { goal_id: 'g1', title: 'Untitled goal', target: 0, completed: 0, attainment: 0 },
    ]);
  });
});

describe('statsDrift — the acceptance criterion', () => {
  const stats = buildReviewStats({
    week: WEEK,
    comparison: COMPARISON,
    goals: GOALS,
    draftCount: 0,
    capturedAt: CAPTURED,
  });

  it('does not change when a task from that week is reopened later', () => {
    // The snapshot is a value, not a query. Reopening a task changes the live counts
    // and cannot reach back into what was already written.
    const before = JSON.stringify(stats);
    statsDrift(stats, { completed: 5, missed: 2, notCounted: 1, open: 2 });
    expect(JSON.stringify(stats)).toBe(before);
  });

  it('says nothing while the week still matches', () => {
    expect(statsDrift(stats, { completed: 6, missed: 2, notCounted: 1, open: 1 })).toBeNull();
  });

  it('names exactly what moved when it does', () => {
    expect(statsDrift(stats, { completed: 5, missed: 2, notCounted: 1, open: 2 })).toBe(
      'C 6 → 5 · open 1 → 2',
    );
  });

  it('says nothing at all when there is no snapshot to compare against', () => {
    expect(statsDrift(null, { completed: 0, missed: 0, notCounted: 0, open: 0 })).toBeNull();
  });
});
