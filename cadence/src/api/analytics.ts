// Analytics. The read side of P09.
//
// Every formula lives in the database (v_week_rollup, 0011) rather than here, so that
// the numbers cannot drift between the app and anything else that ever reads them.
// This file fetches and orders; it does not compute rates.

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { currentWeekStart, shiftWeek } from '@/lib/week';
import type { Tables } from '@/types/database.types';

export type WeekRollup = Tables<'v_week_rollup'>;

export const analyticsKeys = {
  all: ['analytics'] as const,
  rollups: (weeks: number) => ['analytics', 'rollups', weeks] as const,
};

export function useWeekRollups(weeks = 12) {
  return useQuery({
    queryKey: analyticsKeys.rollups(weeks),
    queryFn: async (): Promise<WeekRollup[]> => {
      const since = shiftWeek(currentWeekStart(), -(weeks - 1));
      const { data, error } = await supabase
        .from('v_week_rollup')
        .select('*')
        .gte('week_start', since)
        .order('week_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The current streak of kept weeks, counting back from the most recently finished week.
 *
 * The subtle half of OQ-2 is handled here and nowhere else: **a week with no finalized
 * tasks breaks the streak.** Such a week produces no row in v_week_rollup at all, so
 * walking only the returned rows would silently skip it — and that would make "stop
 * planning entirely" the cheapest way to protect a streak, which is the exact behaviour
 * the app exists to catch. So this walks the calendar, not the data.
 *
 * The week in progress is excluded. It is not finished, so it has not been kept or lost
 * yet, and counting it would make the number flicker as the week goes on.
 */
export function computeStreak(rollups: WeekRollup[]): number {
  const byWeek = new Map(rollups.map((r) => [r.week_start as string, r]));
  let streak = 0;
  let cursor = shiftWeek(currentWeekStart(), -1);

  // Bounded so a bad clock or an empty dataset cannot spin here.
  for (let i = 0; i < 520; i++) {
    const row = byWeek.get(cursor);
    if (!row || !row.is_kept_week) break;
    streak++;
    cursor = shiftWeek(cursor, -1);
  }
  return streak;
}
