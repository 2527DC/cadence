// Weekly reviews. P11.
//
// One row per week, unique on (user_id, week_start), holding a written or spoken answer
// to one question and a frozen copy of the week's numbers.
//
// Two things shape this file:
//
//   1. Re-review is an update, not a second row. The table has a unique constraint on
//      (user_id, week_start) and both an insert and an update policy, so the write is
//      an upsert on that constraint. That also makes it trivially replay-safe: running
//      the same upsert twice leaves the same row.
//   2. The write goes through the outbox like every other mutation in the app —
//      optimistic, keyed, registered, oldest-first. The shape is copied from
//      src/api/goals.ts; read the header there for why each part exists.
//
// A review is never deleted and there is no delete here. weekly_reviews has no DELETE
// policy and no DELETE grant, the same as every other record in this app.

import { useMutation, useQuery, type MutationOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import type { ReviewStats } from '@/features/notifications/review-model';
import { checked, sessionUserId } from '@/features/sync/session';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Json, Tables, TablesInsert } from '@/types/database.types';

export type WeeklyReview = Tables<'weekly_reviews'>;
export type StatusEvent = Tables<'task_status_events'>;

export const reviewKeys = {
  all: ['reviews'] as const,
  week: (weekStart: string) => ['reviews', 'week', weekStart] as const,
  /**
   * The ledger entries behind a week's closes, keyed by the tasks they belong to.
   *
   * By the ids themselves and not by how many there are: correcting a close re-closes a
   * task that was already closed, so the count never moves and a key built from it goes
   * on serving the superseded note beside the status that replaced it. Freshness is not
   * the key's job either — closeTaskOptions invalidates reviewKeys.all — but the ids at
   * least make the key honest about which question it answers.
   */
  events: (weekStart: string, taskIds: readonly string[]) =>
    ['reviews', 'events', weekStart, [...taskIds].sort().join(',')] as const,
};

/** Outbox op names. Stable across releases while a queue could still be on disk. */
export const reviewMutationKeys = {
  save: ['reviews', 'save'] as const,
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The review for one week, or null if it has not been written yet.
 *
 * Any past week can be asked for — that is the "reviews are viewable from any past
 * week" requirement, and it needs nothing more than this, because the row is keyed by
 * the week and RLS scopes it to the signed-in user.
 */
export function useWeekReview(weekStart: string) {
  return useQuery({
    queryKey: reviewKeys.week(weekStart),
    queryFn: async (): Promise<WeeklyReview | null> => {
      const { data, error } = await supabase
        .from('weekly_reviews')
        .select('*')
        .eq('week_start', weekStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Every ledger entry for the given tasks, oldest first.
 *
 * The notes live in task_status_events, not on the task, because a correction appends
 * rather than overwrites. The review shows the entry that stands and says how many are
 * behind it — see latestEvents() in features/notifications/review-model.ts.
 */
export function useWeekCloseEvents(weekStart: string, taskIds: readonly string[]) {
  return useQuery({
    queryKey: reviewKeys.events(weekStart, taskIds),
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<StatusEvent[]> => {
      const { data, error } = await supabase
        .from('task_status_events')
        .select('*')
        .in('task_id', taskIds as string[])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type SaveReviewInput = {
  weekStart: string;
  summary: string | null;
  voiceNoteId: string | null;
  /**
   * The numbers as they were at the moment Save was tapped. Built by
   * buildReviewStats(); never recomputed on read. If you reopen a task from this week
   * three weeks from now, this is what keeps the review honest about what you saw.
   */
  stats: ReviewStats;
  /** Who was signed in when Save was tapped, for the same reason as NewTask.userId. */
  userId?: string;
};

/** What onMutate hands to onError: the one week's row, as it was before. */
type ReviewSnapshot = { weekStart: string; previous: WeeklyReview | null | undefined };

async function snapshotReview(weekStart: string): Promise<ReviewSnapshot> {
  // A refetch landing after the optimistic write would overwrite it with the older
  // row; cancel it and let onSettled's invalidate do the refetch instead.
  await queryClient.cancelQueries({ queryKey: reviewKeys.week(weekStart) });
  return {
    weekStart,
    previous: queryClient.getQueryData<WeeklyReview | null>(reviewKeys.week(weekStart)),
  };
}

function restoreReview(ctx: ReviewSnapshot | undefined): void {
  if (ctx && ctx.previous !== undefined) {
    queryClient.setQueryData(reviewKeys.week(ctx.weekStart), ctx.previous);
  }
}

/**
 * Upsert on the (user_id, week_start) unique constraint.
 *
 * `onConflict` names that constraint's columns, so a second review of the same week
 * updates the first rather than colliding — which is both the "handle re-review as an
 * update" requirement and what makes this safe for the outbox to replay after the app
 * was killed mid-request.
 *
 * The id is not sent. Postgres either inserts with a fresh one or updates the row that
 * is already there, and sending a client-minted id would collide on the primary key
 * for the second review of a week rather than on the constraint we want.
 */
const saveReviewOptions = {
  mutationKey: reviewMutationKeys.save,
  mutationFn: async (input: SaveReviewInput): Promise<WeeklyReview> => {
    const userId = await sessionUserId(input.userId);
    const row: TablesInsert<'weekly_reviews'> = {
      user_id: userId,
      week_start: input.weekStart,
      summary: input.summary,
      voice_note_id: input.voiceNoteId,
      stats: input.stats as unknown as Json,
    };
    return checked(
      await supabase
        .from('weekly_reviews')
        .upsert(row, { onConflict: 'user_id,week_start' })
        .select()
        .single(),
    );
  },
  onError: (_error, _input, ctx) => restoreReview(ctx),
  onSettled: (_data, _error, input) => {
    void queryClient.invalidateQueries({ queryKey: reviewKeys.week(input.weekStart) });
  },
} satisfies MutationOptions<WeeklyReview, Error, SaveReviewInput, ReviewSnapshot>;

export function useSaveReview() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const result = useMutation({
    ...saveReviewOptions,
    // Optimistic, so the screen can say "saved" at the tap and the answer survives
    // being written on a train. The server is still the authority: a rejection puts
    // the previous row back and the screen shows the message.
    onMutate: async (input) => {
      const ctx = await snapshotReview(input.weekStart);
      queryClient.setQueryData<WeeklyReview | null>(reviewKeys.week(input.weekStart), (old) => ({
        id: old?.id ?? '',
        user_id: userId,
        week_start: input.weekStart,
        summary: input.summary,
        voice_note_id: input.voiceNoteId,
        stats: input.stats as unknown as Json,
        // A re-review keeps the original creation time; the freshness a reader cares
        // about is stats.captured_at, which is rewritten every save.
        created_at: old?.created_at ?? new Date().toISOString(),
      }));
      return ctx;
    },
  });

  // The owner is fixed at the tap, in the variables, for the reason on
  // SaveReviewInput.userId.
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = result;
  const stamp = useCallback(
    (input: SaveReviewInput): SaveReviewInput => ({ ...input, userId: input.userId ?? userId }),
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

// ---------------------------------------------------------------------------
// Outbox registration
// ---------------------------------------------------------------------------

/**
 * See registerTaskMutationDefaults in src/api/tasks.ts. Called from setupOutbox() in
 * src/features/sync/outbox-setup.ts, before the persisted cache is hydrated — a review
 * offline and left on disk over a restart can only be replayed if its mutationFn is
 * registered by the time hydration looks for it.
 */
export function registerReviewMutationDefaults(): void {
  queryClient.setMutationDefaults(reviewMutationKeys.save, saveReviewOptions);
}
