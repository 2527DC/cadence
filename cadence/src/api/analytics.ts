// Analytics. The read side of P09.
//
// Every formula that can live in the database does (v_week_rollup and v_goal_progress,
// migration 0011), so the numbers cannot drift between this app and anything else that
// ever reads them. What the views cannot express — the calendar of weeks, weight, late
// adds split by status, goal debt — is derived in src/features/analytics/metrics.ts,
// which is pure and tested. This file fetches and orders; it does not compute rates.

import { useQuery } from '@tanstack/react-query';

import type { GoalProgressRow, TaskFacts, WeekRollup } from '@/features/analytics/metrics';
import { supabase } from '@/lib/supabase';
import { currentWeekStart, shiftWeek } from '@/lib/week';

// The streak walker moved to metrics.ts so it can be tested without a network client.
// Re-exported so nothing that imported it from here has to change.
export { computeStreak } from '@/features/analytics/metrics';
export type { GoalProgressRow, TaskFacts, WeekRollup } from '@/features/analytics/metrics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  rollups: ['analytics', 'rollups'] as const,
  goalProgress: ['analytics', 'goal-progress'] as const,
  taskFacts: (weeks: number) => ['analytics', 'task-facts', weeks] as const,
  streakThreshold: ['analytics', 'streak-threshold'] as const,
};

/**
 * Every week that has a row, oldest first — the whole history, not a window.
 *
 * All of it, because the streak and the consistency ratio need to know where history
 * begins. A week with no row is "nothing committed" if it comes after the first
 * finalized task and "before you started" if it comes before, and the two are scored
 * differently (metrics.ts, weekSeries). One row per week is a few dozen rows a year;
 * a window would save nothing and would cost that distinction.
 */
export function useWeekRollups() {
  return useQuery({
    queryKey: analyticsKeys.rollups,
    queryFn: async (): Promise<WeekRollup[]> => {
      const { data, error } = await supabase
        .from('v_week_rollup')
        .select('*')
        .order('week_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * One row per goal per week that had finalized tasks for it. Also the whole history:
 * a goal's debt runs from its start_week, which can be older than any window.
 *
 * The view's left join emits a row with a null week_start for a goal that has never
 * had a finalized task. It carries nothing the goals table does not, so it is filtered
 * out here rather than special-cased everywhere downstream.
 */
export function useGoalProgress() {
  return useQuery({
    queryKey: analyticsKeys.goalProgress,
    queryFn: async (): Promise<GoalProgressRow[]> => {
      const { data, error } = await supabase
        .from('v_goal_progress')
        .select('goal_id, week_start, completed, attainment')
        .not('week_start', 'is', null)
        .order('week_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The four columns of a finalized task the views do not surface: weight (OQ-8, for
 * "by effort"), and late_add alongside status (doc/05 §4.2, the rate with and without
 * late adds). Only the recent window; both metrics are about recent weeks.
 */
export function useTaskFacts(weeks = 12) {
  return useQuery({
    queryKey: analyticsKeys.taskFacts(weeks),
    queryFn: async (): Promise<TaskFacts[]> => {
      const since = shiftWeek(currentWeekStart(), -(weeks - 1));
      const { data, error } = await supabase
        .from('tasks')
        .select('week_start, status, weight, late_add')
        .eq('is_finalized', true)
        .gte('week_start', since);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * profiles.streak_threshold, for the sentence that explains what "kept" means.
 *
 * Display only. The view already applies the threshold when it computes
 * is_kept_week, and nothing in the app re-derives that. Falls back to the schema
 * default so the sentence still reads correctly while the row is loading.
 */
export function useStreakThreshold() {
  return useQuery({
    queryKey: analyticsKeys.streakThreshold,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('streak_threshold')
        .maybeSingle();
      if (error) throw error;
      return data?.streak_threshold ?? 0.7;
    },
  });
}
