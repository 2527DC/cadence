// Tasks: planning, finalizing, and closing. P04, P05 and, since P10, the outbox.
//
// Read src/lib/../../.claude/skills/cadence-domain if you are new to this. The short
// version, which shapes every function below:
//
//   * A DRAFT (is_finalized = false) is fully editable and deletable.
//   * FINALIZING is the commitment. After it, title/goal/week/weight are frozen, the
//     row can never be deleted, and only the status can still change.
//   * CLOSING goes through the close_task RPC and nowhere else. A direct status update
//     is rejected by a trigger, so there is deliberately no updateStatus() here.
//
// None of those rules are enforced in this file. They are enforced in Postgres, and
// this file would be unable to break them if it tried. What it does is avoid asking.
//
// Every mutation here is an outbox entry (src/lib/outbox.ts). Three things follow:
//
//   1. Each one is optimistic. The cache changes at the tap; the server is still the
//      authority, and a rejection puts the old rows back and surfaces the message.
//   2. Each one has a mutationKey and is registered with the query client so that a
//      mutation persisted while offline can be replayed after the app was killed —
//      at which point only what is registered here exists, not the hook that made it.
//   3. Each one is safe to replay. A kill between the request going out and the reply
//      being recorded means the same write runs twice, and the second run must find
//      "already done" and say so, not create a twin or block the queue.

import { useMutation, useQuery, type MutationOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { reviewKeys } from '@/api/reviews';
import { useAuth } from '@/features/auth/auth-provider';
import { checked, sessionUserId } from '@/features/sync/session';
import { clientId, isAlreadyClosedTo, isUniqueViolation } from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { wouldBeLateAdd } from '@/lib/week';
import type { Database, Tables, TablesInsert } from '@/types/database.types';

export type Task = Tables<'tasks'>;
export type TaskStatus = Database['public']['Enums']['task_status'];
export type NcReason = Database['public']['Enums']['nc_reason'];
export type StatusEvent = Tables<'task_status_events'>;

// The mandatory-note rule is pure and lives in src/lib/note.ts so its tests do not
// need an API key. Re-exported here because every caller of close wants both.
export { MIN_NOTE_LENGTH, noteProblem } from '@/lib/note';

export const taskKeys = {
  all: ['tasks'] as const,
  week: (weekStart: string) => ['tasks', 'week', weekStart] as const,
  history: (taskId: string) => ['tasks', 'history', taskId] as const,
};

/**
 * Mutation keys double as the outbox's op names. They are what a persisted mutation
 * is looked up by after a restart, so they must not change between releases while a
 * queue could still be on disk.
 */
export const taskMutationKeys = {
  create: ['tasks', 'create'] as const,
  updateDraft: ['tasks', 'update-draft'] as const,
  deleteDraft: ['tasks', 'delete-draft'] as const,
  finalize: ['tasks', 'finalize'] as const,
  close: ['tasks', 'close'] as const,
};

export function useWeekTasks(weekStart: string) {
  return useQuery({
    queryKey: taskKeys.week(weekStart),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('week_start', weekStart)
        .order('is_finalized', { ascending: true })
        .order('planned_for', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The full ledger for one task. Both sides of a correction, in order. */
export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: taskKeys.history(taskId),
    queryFn: async (): Promise<StatusEvent[]> => {
      const { data, error } = await supabase
        .from('task_status_events')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Optimistic cache helpers
// ---------------------------------------------------------------------------

/**
 * What onMutate hands to onError. It is persisted with the mutation, so it has to be
 * plain data — no functions, no class instances — and it is kept to the one week the
 * mutation touched rather than the whole cache.
 */
type WeekSnapshot = { weekStart: string | null; previous: Task[] | undefined };

/** For a mutation whose task is not in any cached week: nothing to change, nothing to restore. */
const NO_WEEK: WeekSnapshot = { weekStart: null, previous: undefined };

async function snapshotWeek(weekStart: string): Promise<WeekSnapshot> {
  // A refetch landing after the optimistic write would overwrite it with the server's
  // older rows; cancel it and let onSettled's invalidate do the refetch instead.
  await queryClient.cancelQueries({ queryKey: taskKeys.week(weekStart) });
  return { weekStart, previous: queryClient.getQueryData<Task[]>(taskKeys.week(weekStart)) };
}

function restoreWeek(ctx: WeekSnapshot | undefined): void {
  if (ctx?.weekStart && ctx.previous) {
    queryClient.setQueryData(taskKeys.week(ctx.weekStart), ctx.previous);
  }
}

function patchWeek(weekStart: string, fn: (rows: Task[]) => Task[]): void {
  queryClient.setQueryData<Task[]>(taskKeys.week(weekStart), (old) => (old ? fn(old) : old));
}

function invalidateWeek(weekStart: string | null | undefined): void {
  if (weekStart) void queryClient.invalidateQueries({ queryKey: taskKeys.week(weekStart) });
}

/** The cached week that holds this task, for mutations whose input has only an id. */
function cachedWeekOf(taskId: string): string | undefined {
  for (const [, rows] of queryClient.getQueriesData<Task[]>({
    queryKey: [...taskKeys.all, 'week'],
  })) {
    const hit = rows?.find((t) => t.id === taskId);
    if (hit) return hit.week_start;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

export type NewTask = {
  title: string;
  weekStart: string;
  goalId?: string | null;
  detail?: string | null;
  plannedFor?: string | null;
  /**
   * Minted on the device by useCreateTask. It has to be part of the variables, not
   * generated inside mutationFn, so that a replay after a restart reuses it and a
   * task that already landed is found rather than inserted a second time.
   */
  id?: string;
  /**
   * Who was signed in when this was typed, stamped by useCreateTask. A write replayed
   * from disk has no identity of its own; without this it would be filed under whoever
   * is signed in when the queue finally flushes. See sessionUserId().
   */
  userId?: string;
};

const createTaskOptions = {
  mutationKey: taskMutationKeys.create,
  mutationFn: async (input: NewTask): Promise<Task> => {
    const id = input.id ?? clientId();
    const userId = await sessionUserId(input.userId);

    const row: TablesInsert<'tasks'> = {
      id,
      user_id: userId,
      title: input.title.trim(),
      week_start: input.weekStart,
      goal_id: input.goalId ?? null,
      detail: input.detail?.trim() || null,
      planned_for: input.plannedFor ?? null,
      // Never sent: status, is_finalized, late_add. A task is born OPEN and a draft,
      // and 0006's guard rejects an insert that says otherwise.
    };

    const res = await supabase.from('tasks').insert(row).select().single();
    if (res.error && isUniqueViolation(res.error)) {
      // This insert already landed — the app was killed after the request went out
      // and before the reply was recorded. Same id, same task: fetch it, do not fail.
      return checked(await supabase.from('tasks').select('*').eq('id', id).single());
    }
    return checked(res);
  },
  onError: (_error, _input, ctx) => restoreWeek(ctx),
  onSettled: (_data, _error, input) => invalidateWeek(input.weekStart),
} satisfies MutationOptions<Task, Error, NewTask, WeekSnapshot>;

export function useCreateTask() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const result = useMutation({
    ...createTaskOptions,
    // The optimistic row. Everything the database would fill in is guessed with the
    // defaults from 0004; the refetch in onSettled replaces it with the real row.
    onMutate: async (input) => {
      const ctx = await snapshotWeek(input.weekStart);
      const now = new Date().toISOString();
      patchWeek(input.weekStart, (rows) => [
        ...rows,
        {
          id: input.id ?? '',
          user_id: userId,
          goal_id: input.goalId ?? null,
          title: input.title.trim(),
          detail: input.detail?.trim() || null,
          week_start: input.weekStart,
          planned_for: input.plannedFor ?? null,
          weight: 1,
          is_finalized: false,
          finalized_at: null,
          late_add: false,
          status: 'OPEN',
          closed_at: null,
          nc_reason: null,
          created_at: now,
          updated_at: now,
        },
      ]);
      return ctx;
    },
  });

  // The id and the owner are fixed at the tap, in the variables, for the reasons on
  // NewTask.id and NewTask.userId.
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = result;
  const stamp = useCallback(
    (input: NewTask): NewTask => ({
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

type DraftPatch = { id: string } & Partial<
  Pick<Task, 'title' | 'detail' | 'goal_id' | 'planned_for' | 'weight'>
>;

/**
 * Only ever reaches a draft. On a finalized task the database raises, the rows go
 * back, and the trigger's message is shown — the server wins, and the client never
 * overwrites a finalized task even if its cache was behind.
 */
const updateDraftOptions = {
  mutationKey: taskMutationKeys.updateDraft,
  mutationFn: async ({ id, ...patch }: DraftPatch): Promise<Task> =>
    checked(await supabase.from('tasks').update(patch).eq('id', id).select().single()),
  onMutate: async ({ id, ...patch }) => {
    const weekStart = cachedWeekOf(id);
    if (!weekStart) return NO_WEEK;
    const ctx = await snapshotWeek(weekStart);
    const now = new Date().toISOString();
    patchWeek(weekStart, (rows) =>
      rows.map((t) => (t.id === id ? { ...t, ...patch, updated_at: now } : t)),
    );
    return ctx;
  },
  onError: (_error, _patch, ctx) => restoreWeek(ctx),
  onSettled: (data, _error, _patch, ctx) => {
    invalidateWeek(ctx?.weekStart);
    if (data && data.week_start !== ctx?.weekStart) invalidateWeek(data.week_start);
  },
} satisfies MutationOptions<Task, Error, DraftPatch, WeekSnapshot>;

export function useUpdateDraft() {
  return useMutation(updateDraftOptions);
}

/**
 * Deleting is legitimate for a draft and impossible for anything else — the RLS policy
 * is scoped to `is_finalized = false` and a trigger raises independently of it.
 *
 * Note what a blocked delete looks like from here: RLS does not raise, it filters. The
 * call returns success having removed nothing. So this checks what is left rather than
 * trusting the absence of an error — and "nothing is left" is itself a success, because
 * it is what a replayed delete finds.
 */
const deleteDraftOptions = {
  mutationKey: taskMutationKeys.deleteDraft,
  mutationFn: async (task: Task): Promise<void> => {
    const deleted = checked(await supabase.from('tasks').delete().eq('id', task.id).select('id'));
    if (deleted.length > 0) return;

    const remaining = checked(
      await supabase.from('tasks').select('id, is_finalized').eq('id', task.id).maybeSingle(),
    );
    if (!remaining) return; // already gone: this delete landed the first time
    throw new Error(
      'That task is already finalized, so it cannot be deleted. Close it with a status instead.',
    );
  },
  onMutate: async (task) => {
    const ctx = await snapshotWeek(task.week_start);
    patchWeek(task.week_start, (rows) => rows.filter((t) => t.id !== task.id));
    return ctx;
  },
  onError: (_error, _task, ctx) => restoreWeek(ctx),
  onSettled: (_data, _error, task) => invalidateWeek(task.week_start),
} satisfies MutationOptions<void, Error, Task, WeekSnapshot>;

export function useDeleteDraft() {
  return useMutation(deleteDraftOptions);
}

// ---------------------------------------------------------------------------
// Finalizing — the commitment
// ---------------------------------------------------------------------------

/**
 * The one-way door. After this the task cannot be renamed, moved, or deleted.
 *
 * `finalized_at` and `late_add` are deliberately not sent: mark_late_add() computes
 * both, and anything the client supplied for `late_add` would be overwritten. That is
 * the point — finalizing on a Thursday to pad the week is visible in the data.
 *
 * `.eq('is_finalized', false)` is what makes a replay a no-op. Without it, a second
 * run of the same update would re-stamp `finalized_at` with the time the queue
 * happened to flush; with it, a task that is already committed is not touched at all
 * and the update simply reports zero rows.
 */
const finalizeOptions = {
  mutationKey: taskMutationKeys.finalize,
  mutationFn: async (taskIds: string[]): Promise<Task[]> => {
    if (taskIds.length === 0) return [];
    return (
      checked(
        await supabase
          .from('tasks')
          .update({ is_finalized: true })
          .in('id', taskIds)
          .eq('is_finalized', false)
          .select(),
      ) ?? []
    );
  },
  onMutate: async (taskIds) => {
    const ids = new Set(taskIds);
    const weeks = new Set<string>();
    for (const id of taskIds) {
      const w = cachedWeekOf(id);
      if (w) weeks.add(w);
    }
    const snapshots: WeekSnapshot[] = [];
    const now = new Date().toISOString();
    for (const weekStart of weeks) {
      // A preview of what the database will decide, asked per week: the rule is
      // "after Wednesday of its own week", so committing to a week that has not
      // started yet is never late. The real answer comes back with the refetch; this
      // only stops the row flickering between "draft" and "late" states.
      const late = wouldBeLateAdd(weekStart);
      snapshots.push(await snapshotWeek(weekStart));
      patchWeek(weekStart, (rows) =>
        rows.map((t) =>
          ids.has(t.id) && !t.is_finalized
            ? { ...t, is_finalized: true, finalized_at: now, late_add: late, updated_at: now }
            : t,
        ),
      );
    }
    return snapshots;
  },
  onError: (_error, _ids, ctx) => ctx?.forEach(restoreWeek),
  onSettled: (data, _error, _ids, ctx) => {
    ctx?.forEach((s) => invalidateWeek(s.weekStart));
    data?.forEach((t) => invalidateWeek(t.week_start));
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
  },
} satisfies MutationOptions<Task[], Error, string[], WeekSnapshot[]>;

export function useFinalizeTasks() {
  return useMutation(finalizeOptions);
}

// ---------------------------------------------------------------------------
// Closing — the only door
// ---------------------------------------------------------------------------

export type CloseTaskInput = {
  taskId: string;
  status: Exclude<TaskStatus, 'OPEN'>;
  note?: string;
  voiceNoteId?: string | null;
  ncReason?: NcReason | null;
  /** For cache invalidation only; the RPC does not need it. */
  weekStart: string;
};

/**
 * Closing always goes through the RPC, because the RPC is the only thing that writes
 * the ledger row and the status flip in one transaction. There is no window in which a
 * task is closed without a note behind it.
 *
 * The validation the RPC performs — note length, placeholder notes, NC needing a
 * reason, a draft not being closeable, a task not being closed to the status it already
 * has — is not duplicated here. Its error messages are written to be shown to a person,
 * so they are surfaced as-is.
 *
 * The one message that is *not* surfaced is "already <status>" for this exact task
 * and status: that is what a replayed close finds when its first run landed, and the
 * right answer is the current row, not a second ledger entry.
 */
const closeTaskOptions = {
  mutationKey: taskMutationKeys.close,
  mutationFn: async (input: CloseTaskInput): Promise<Task> => {
    const res = await supabase.rpc('close_task', {
      p_task_id: input.taskId,
      p_to_status: input.status,
      p_note: input.note ?? undefined,
      p_voice_note_id: input.voiceNoteId ?? undefined,
      p_nc_reason: input.ncReason ?? undefined,
    });
    if (res.error && isAlreadyClosedTo(res.error.message, input.taskId, input.status)) {
      return checked(await supabase.from('tasks').select('*').eq('id', input.taskId).single());
    }
    return checked(res) as Task;
  },

  // Optimistic: the status flips in the cache before the round trip, so the sheet
  // can close immediately. The RPC is still the authority — it validates the note,
  // the NC reason and the draft check, and any of those rejecting rolls this back.
  onMutate: async (input) => {
    const ctx = await snapshotWeek(input.weekStart);
    patchWeek(input.weekStart, (rows) =>
      rows.map((t) =>
        t.id === input.taskId
          ? {
              ...t,
              status: input.status,
              closed_at: new Date().toISOString(),
              nc_reason: input.status === 'NC' ? (input.ncReason ?? null) : null,
            }
          : t,
      ),
    );
    return ctx;
  },

  // Put the old rows back and let the caller show the database's message. A silent
  // rollback would leave the user believing a task closed when it did not.
  onError: (_error, _input, ctx) => restoreWeek(ctx),

  onSettled: (_data, _error, input) => {
    invalidateWeek(input.weekStart);
    void queryClient.invalidateQueries({ queryKey: taskKeys.history(input.taskId) });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    // The weekly review reads the notes out of the ledger, and a correction appends a
    // row to a task that was already closed. Without this the review would keep showing
    // the superseded note next to the status that replaced it — a task marked N above
    // the sentence explaining why it was completed, which is the exact quiet lie the
    // append-only ledger exists to prevent.
    void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
  },
} satisfies MutationOptions<Task, Error, CloseTaskInput, WeekSnapshot>;

export function useCloseTask() {
  return useMutation(closeTaskOptions);
}

// ---------------------------------------------------------------------------
// Outbox registration
// ---------------------------------------------------------------------------

/**
 * Makes every mutation above replayable after a restart.
 *
 * A mutation restored from disk is rebuilt from its key, its variables and whatever
 * setMutationDefaults registered for that key — the hook that created it is gone. So
 * the same option objects the hooks use are registered here, and the behaviour is
 * identical whether a write runs seconds after the tap or a day later on relaunch.
 *
 * Called from setupOutbox() in src/features/sync/outbox-setup.ts, which the root
 * layout runs before the persisted cache is restored. Order matters: hydration looks
 * the defaults up at that moment.
 */
export function registerTaskMutationDefaults(): void {
  queryClient.setMutationDefaults(taskMutationKeys.create, createTaskOptions);
  queryClient.setMutationDefaults(taskMutationKeys.updateDraft, updateDraftOptions);
  queryClient.setMutationDefaults(taskMutationKeys.deleteDraft, deleteDraftOptions);
  queryClient.setMutationDefaults(taskMutationKeys.finalize, finalizeOptions);
  queryClient.setMutationDefaults(taskMutationKeys.close, closeTaskOptions);
}
