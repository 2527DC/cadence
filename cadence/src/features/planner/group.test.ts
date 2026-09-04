// The planner's grouping and its "is the week ending?" logic.
//
// The screen shows a week as sections; if the sections are wrong the week reads
// wrong, quietly. These pin the order (calendar days, then Unscheduled), what goes
// where, and the weekend nudge, all without a device.

import type { Task } from '@/api/tasks';

import {
  buildSections,
  dayChipLabel,
  describeDay,
  draftsAtRisk,
  isPastWeek,
  isWeekEnd,
  UNSCHEDULED,
} from './group';

const WEEK = '2026-08-31'; // a Monday

let seq = 0;
function task(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: 'u1',
    goal_id: null,
    title: `Task ${seq}`,
    detail: null,
    week_start: WEEK,
    planned_for: null,
    weight: 1,
    is_finalized: false,
    finalized_at: null,
    late_add: false,
    status: 'OPEN',
    closed_at: null,
    nc_reason: null,
    created_at: `2026-08-30T10:00:${String(seq).padStart(2, '0')}+00:00`,
    updated_at: `2026-08-30T10:00:${String(seq).padStart(2, '0')}+00:00`,
    ...over,
  };
}

describe('buildSections', () => {
  it('is empty for an empty week', () => {
    expect(buildSections([], WEEK)).toEqual([]);
  });

  it('groups by planned_for in calendar order with Unscheduled last', () => {
    const wed = task({ planned_for: '2026-09-02' });
    const mon = task({ planned_for: '2026-08-31' });
    const none = task();
    const sun = task({ planned_for: '2026-09-06' });

    const keys = buildSections([wed, mon, none, sun], WEEK).map((s) => s.key);
    expect(keys).toEqual(['2026-08-31', '2026-09-02', '2026-09-06', UNSCHEDULED]);
  });

  it('leaves out days with nothing in them', () => {
    const sections = buildSections([task({ planned_for: '2026-09-03' })], WEEK);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.day).toBe('2026-09-03');
  });

  it('omits the Unscheduled group when every task has a day', () => {
    const sections = buildSections([task({ planned_for: '2026-09-01' })], WEEK);
    expect(sections.some((s) => s.key === UNSCHEDULED)).toBe(false);
  });

  it('puts committed tasks before drafts within a day, each in creation order', () => {
    const draftFirst = task({ planned_for: '2026-09-01' });
    const committedA = task({ planned_for: '2026-09-01', is_finalized: true });
    const draftSecond = task({ planned_for: '2026-09-01' });
    const committedB = task({ planned_for: '2026-09-01', is_finalized: true });

    const [tue] = buildSections([draftFirst, committedA, draftSecond, committedB], WEEK);
    expect(tue?.data.map((t) => t.id)).toEqual([
      committedA.id,
      committedB.id,
      draftFirst.id,
      draftSecond.id,
    ]);
  });

  it('treats a planned_for outside the week as unscheduled rather than dropping it', () => {
    // The database forbids this, so it is a belt-and-braces case, not a feature.
    const stray = task({ planned_for: '2026-09-08' });
    const sections = buildSections([stray], WEEK);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.key).toBe(UNSCHEDULED);
    expect(sections[0]?.data).toEqual([stray]);
  });

  it('never loses a task', () => {
    const tasks = Array.from({ length: 50 }, (_, i) =>
      task({
        planned_for: i % 4 === 0 ? null : `2026-09-0${(i % 6) + 1}`,
        is_finalized: i % 3 === 0,
      }),
    );
    const total = buildSections(tasks, WEEK).reduce((n, s) => n + s.data.length, 0);
    expect(total).toBe(50);
  });
});

describe('isPastWeek', () => {
  it('is true only for weeks before the current one', () => {
    expect(isPastWeek('2026-08-24', WEEK)).toBe(true);
    expect(isPastWeek(WEEK, WEEK)).toBe(false);
    expect(isPastWeek('2026-09-07', WEEK)).toBe(false);
  });

  it('compares across a year boundary', () => {
    expect(isPastWeek('2026-12-28', '2027-01-04')).toBe(true);
    expect(isPastWeek('2027-01-04', '2026-12-28')).toBe(false);
  });
});

describe('isWeekEnd', () => {
  it.each([
    ['2026-08-31', false], // Monday
    ['2026-09-04', false], // Friday
    ['2026-09-05', true], // Saturday
    ['2026-09-06', true], // Sunday
  ])('%s -> %s', (day, expected) => {
    expect(isWeekEnd(new Date(`${day}T09:00:00`))).toBe(expected);
  });
});

describe('draftsAtRisk', () => {
  const sunday = new Date('2026-09-06T09:00:00');
  const friday = new Date('2026-09-04T09:00:00');
  const rows = [task(), task(), task({ is_finalized: true })];

  it('counts the drafts of the current week at the weekend', () => {
    expect(draftsAtRisk(rows, WEEK, sunday)).toBe(2);
  });

  it('is zero before the weekend', () => {
    expect(draftsAtRisk(rows, WEEK, friday)).toBe(0);
  });

  it('is zero for a past week, whose drafts are already lost', () => {
    expect(draftsAtRisk(rows, '2026-08-24', sunday)).toBe(0);
  });

  it('is zero for a future week, which still has time', () => {
    expect(draftsAtRisk(rows, '2026-09-07', sunday)).toBe(0);
  });

  it('is zero when everything is committed', () => {
    expect(draftsAtRisk([task({ is_finalized: true })], WEEK, sunday)).toBe(0);
  });
});

describe('describeDay', () => {
  it('names the weekday and the date', () => {
    const h = describeDay('2026-08-31');
    expect(h.weekday).toBe('Monday');
    expect(h.date).toBe('31 Aug');
  });

  it('does not call a day in 2020 today', () => {
    expect(describeDay('2020-01-06').isToday).toBe(false);
  });
});

describe('dayChipLabel', () => {
  it('is short enough for a chip', () => {
    expect(dayChipLabel(new Date('2026-09-01T09:00:00'))).toBe('Tue 1');
  });
});
