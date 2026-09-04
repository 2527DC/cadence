// Goals. P03, and since P10 every write here is an outbox entry.
//
// Goals are never deleted. There is no delete function here, and there could not be
// one: migration 0010/0013 gives `authenticated` no DELETE policy and 0014 gives it no
// DELETE privilege either. Archiving is the operation, and it keeps every historical
// task and its analytics intact.
//
// The outbox shape is the same as src/api/tasks.ts: optimistic, keyed, registered,
// and safe to replay. Read the header there for why.

import { useMutation, useQuery, type MutationOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { checked, sessionUserId } from '@/features/sync/session';
import { clientId, isUniqueViolation } from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';
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

/** Outbox op names. Stable across releases while a queue could still be on disk. */
export const goalMutationKeys = {
  create: ['goals', 'create'] as const,
  update: ['goals', 'update'] as const,
  setState: ['goals', 'set-state'] as const,
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

// ---------------------------------------------------------------------------
// Optimistic cache helpers
// ---------------------------------------------------------------------------

/**
 * Every cached goal list, so a rejection can put all of them back. Persisted with the
 * mutation, hence plain data. There are at most four lists (active, paused, archived,
 * all), each a handful of rows.
 */
type GoalsSnapshot = [readonly unknown[], Goal[] | undefined][];

const LIST_PREFIX = [...goalKeys.all, 'list'] as const;

async function snapshotGoals(): Promise<GoalsSnapshot> {
  await queryClient.cancelQueries({ queryKey: LIST_PREFIX });
  return queryClient.getQueriesData<Goal[]>({ queryKey: LIST_PREFIX });
}

function restoreGoals(ctx: GoalsSnapshot | undefined): void {
  ctx?.forEach(([key, rows]) => {
    if (rows) queryClient.setQueryData(key, rows);
  });
}

/**
 * Apply `fn` to every cached list. `filter` is the third key segment — a state, or
 * 'all' — so a goal can be moved between lists rather than left showing the wrong
 * state in the wrong list until the refetch.
 */
function patchGoalLists(fn: (rows: Goal[], filter: string) => Goal[]): void {
  for (const [key, rows] of queryClient.getQueriesData<Goal[]>({ queryKey: LIST_PREFIX })) {
    if (rows) queryClient.setQueryData<Goal[]>(key, fn(rows, String(key[2])));
  }
}

function cachedGoal(id: string): Goal | undefined {
  for (const [, rows] of queryClient.getQueriesData<Goal[]>({ queryKey: LIST_PREFIX })) {
    const hit = rows?.find((g) => g.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function byCreatedAt(a: Goal, b: Goal): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

function invalidateGoals(): void {
  void queryClient.invalidateQueries({ queryKey: goalKeys.all });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type NewGoal = {
  title: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  target_per_week: number;
  /** Minted on the device by useCreateGoal, for the same reason as NewTask.id. */
  id?: string;
  /** Who was signed in when this was typed, for the same reason as NewTask.userId. */
  userId?: string;
};

const createGoalOptions = {
  mutationKey: goalMutationKeys.create,
  mutationFn: async (input: NewGoal): Promise<Goal> => {
    const id = input.id ?? clientId();
    const userId = await sessionUserId(input.userId);

    const row: TablesInsert<'goals'> = {
      id,
      user_id: userId,
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

    const res = await supabase.from('goals').insert(row).select().single();
    if (res.error && isUniqueViolation(res.error)) {
      // A replay of an insert that already landed. Same id, same goal.
      return checked(await supabase.from('goals').select('*').eq('id', id).single());
    }
    return checked(res);
  },
  onError: (_error, _input, ctx) => restoreGoals(ctx),
  onSettled: invalidateGoals,
} satisfies MutationOptions<Goal, Error, NewGoal, GoalsSnapshot>;

export function useCreateGoal() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const result = useMutation({
    ...createGoalOptions,
    onMutate: async (input) => {
      const ctx = await snapshotGoals();
      const now = new Date().toISOString();
      const optimistic: Goal = {
        id: input.id ?? '',
        user_id: userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        color: input.color ?? null,
        target_per_week: input.target_per_week,
        start_week: currentWeekStart(),
        end_week: null,
        state: 'active',
        created_at: now,
        updated_at: now,
      };
      // A new goal is active, so it belongs in the 'active' and 'all' lists only.
      patchGoalLists((rows, filter) =>
        filter === 'all' || filter === 'active' ? [...rows, optimistic] : rows,
      );
      return ctx;
    },
  });

  // The id and the owner are fixed at the tap, in the variables, for the reasons on
  // NewTask.id and NewTask.userId.
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = result;
  const stamp = useCallback(
    (input: NewGoal): NewGoal => ({
      ...input,
      id: input.id ?? clientId(),
      userId: input.userId ?? userId,
    }),
    [userId],
  );
  const mutate = useCallback<typeof rawMutate>(
    (input, options) => rawMutate(stamp(input), options),
    [rawMutate, stamp],
  );
  const mutateAsync = useCallback<typeof rawMutateAsync>(
    (input, options) => rawMutateAsync(stamp(input), options),
    [rawMutateAsync, stamp],
  );

  return { ...result, mutate, mutateAsync };
}

type GoalPatch = { id: string } & Partial<
  Pick<Goal, 'title' | 'description' | 'category' | 'target_per_week' | 'color'>
>;

const updateGoalOptions = {
  mutationKey: goalMutationKeys.update,
  mutationFn: async ({ id, ...patch }: GoalPatch): Promise<Goal> =>
    checked(
      await supabase
        .from('goals')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    ),
  onMutate: async ({ id, ...patch }) => {
    const ctx = await snapshotGoals();
    const now = new Date().toISOString();
    patchGoalLists((rows) =>
      rows.map((g) => (g.id === id ? { ...g, ...patch, updated_at: now } : g)),
    );
    return ctx;
  },
  onError: (_error, _patch, ctx) => restoreGoals(ctx),
  onSettled: invalidateGoals,
} satisfies MutationOptions<Goal, Error, GoalPatch, GoalsSnapshot>;

export function useUpdateGoal() {
  return useMutation(updateGoalOptions);
}

/**
 * Archive, the closest thing to deletion this app has.
 *
 * Every task that ever pointed at this goal stays exactly where it is, and so does
 * every number derived from them. That is the whole reason there is no delete: a goal
 * you abandoned is part of the record, and erasing it would make the history lie about
 * what you were actually trying to do.
 *
 * Archiving also closes the goal's window. `end_week` is what every consumer reads to
 * know which weeks a goal was live in — goalsThatWeek in the review, and the debt in
 * goalScorecards() — and leaving it null makes an abandoned goal look active forever:
 * "0 / 3" in every later week's review, frozen into that week's weekly_reviews.stats,
 * and a debt that grows by the target every week for something you stopped doing. The
 * Monday of the current week is the honest answer, and it satisfies both
 * `end_week_is_monday` and `end_after_start`. Un-archiving clears it again.
 *
 * Replaying this is harmless — setting the same state twice is the same state, and the
 * end week is recomputed from the same Monday.
 */
const setGoalStateOptions = {
  mutationKey: goalMutationKeys.setState,
  mutationFn: async ({ id, state }: { id: string; state: GoalState }): Promise<Goal> =>
    checked(
      await supabase
        .from('goals')
        .update({
          state,
          end_week: state === 'archived' ? currentWeekStart() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single(),
    ),
  onMutate: async ({ id, state }) => {
    const ctx = await snapshotGoals();
    const goal = cachedGoal(id);
    if (!goal) return ctx;
    const moved: Goal = {
      ...goal,
      state,
      end_week: state === 'archived' ? currentWeekStart() : null,
      updated_at: new Date().toISOString(),
    };
    // Move it between filtered lists, so archiving from the Active tab makes it leave
    // that tab now rather than sit there with an "Archive" button that does nothing.
    patchGoalLists((rows, filter) => {
      const belongs = filter === 'all' || filter === state;
      const without = rows.filter((g) => g.id !== id);
      return belongs ? [...without, moved].sort(byCreatedAt) : without;
    });
    return ctx;
  },
  onError: (_error, _input, ctx) => restoreGoals(ctx),
  onSettled: invalidateGoals,
} satisfies MutationOptions<Goal, Error, { id: string; state: GoalState }, GoalsSnapshot>;

export function useSetGoalState() {
  return useMutation(setGoalStateOptions);
}

// ---------------------------------------------------------------------------
// Outbox registration
// ---------------------------------------------------------------------------

/** See registerTaskMutationDefaults in src/api/tasks.ts. */
export function registerGoalMutationDefaults(): void {
  queryClient.setMutationDefaults(goalMutationKeys.create, createGoalOptions);
  queryClient.setMutationDefaults(goalMutationKeys.update, updateGoalOptions);
  queryClient.setMutationDefaults(goalMutationKeys.setState, setGoalStateOptions);
}
