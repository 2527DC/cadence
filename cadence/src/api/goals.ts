// Goals. P03.
//
// Goals are never deleted. There is no delete function here, and there could not be
// one: migration 0010/0013 gives `authenticated` no DELETE policy and 0014 gives it no
// DELETE privilege either. Archiving is the operation, and it keeps every historical
// task and its analytics intact.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { currentWeekStart } from '@/lib/week';
import type { Database, Tables, TablesInsert } from '@/types/database.types';

export type Goal = Tables<'goals'>;
export type GoalState = Database['public']['Enums']['goal_state'];

export const goalKeys = {
  all: ['goals'] as const,
  list: (state?: GoalState) => ['goals', 'list', state ?? 'all'] as const,
  detail: (id: string) => ['goals', 'detail', id] as const,
};

export function useGoals(state: GoalState | 'all' = 'active') {
  return useQuery({
    queryKey: goalKeys.list(state === 'all' ? undefined : state),
    queryFn: async (): Promise<Goal[]> => {
      let q = supabase.from('goals').select('*').order('created_at', { ascending: true });
      if (state !== 'all') q = q.eq('state', state);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type NewGoal = {
  title: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  target_per_week: number;
};

export function useCreateGoal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewGoal): Promise<Goal> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Not signed in.');

      const row: TablesInsert<'goals'> = {
        user_id: auth.user.id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        // A goal starts counting from the Monday of the week it was created in.
        // The database enforces that this is a Monday; sending anything else is
        // rejected by start_week_is_monday rather than quietly accepted.
        start_week: currentWeekStart(),
        target_per_week: input.target_per_week,
        ...(input.color ? { color: input.color } : {}),
      };

      const { data, error } = await supabase.from('goals').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: goalKeys.all });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Goal, 'title' | 'description' | 'category' | 'target_per_week' | 'color'>>): Promise<Goal> => {
      const { data, error } = await supabase
        .from('goals')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: goalKeys.all });
    },
  });
}

/**
 * Archive, the closest thing to deletion this app has.
 *
 * Every task that ever pointed at this goal stays exactly where it is, and so does
 * every number derived from them. That is the whole reason there is no delete: a goal
 * you abandoned is part of the record, and erasing it would make the history lie about
 * what you were actually trying to do.
 */
export function useSetGoalState() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, state }: { id: string; state: GoalState }): Promise<Goal> => {
      const { data, error } = await supabase
        .from('goals')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: goalKeys.all });
    },
  });
}
