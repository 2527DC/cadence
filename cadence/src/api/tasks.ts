// Tasks: planning, finalizing, and closing. P04 and P05.
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
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
// Drafting
// ---------------------------------------------------------------------------

export type NewTask = {
  title: string;
  weekStart: string;
  goalId?: string | null;
  detail?: string | null;
  plannedFor?: string | null;
};

export function useCreateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewTask): Promise<Task> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Not signed in.');

      const row: TablesInsert<'tasks'> = {
        user_id: auth.user.id,
        title: input.title.trim(),
        week_start: input.weekStart,
        goal_id: input.goalId ?? null,
        detail: input.detail?.trim() || null,
        planned_for: input.plannedFor ?? null,
        // Never sent: status, is_finalized, late_add. A task is born OPEN and a draft,
        // and 0006's guard rejects an insert that says otherwise.
      };

      const { data, error } = await supabase.from('tasks').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: taskKeys.week(task.week_start) });
    },
  });
}

/** Only ever reaches a draft. On a finalized task the database raises. */
export function useUpdateDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Task, 'title' | 'detail' | 'goal_id' | 'planned_for' | 'weight'>>): Promise<Task> => {
      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: taskKeys.week(task.week_start) });
    },
  });
}

/**
 * Deleting is legitimate for a draft and impossible for anything else — the RLS policy
 * is scoped to `is_finalized = false` and a trigger raises independently of it.
 *
 * Note what a blocked delete looks like from here: RLS does not raise, it filters. The
 * call returns success having removed nothing. So this checks the row is gone rather
 * than trusting the absence of an error.
 */
export function useDeleteDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (task: Task): Promise<void> => {
      const { data, error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'That task is already finalized, so it cannot be deleted. Close it with a status instead.',
        );
      }
    },
    onSuccess: (_v, task) => {
      void qc.invalidateQueries({ queryKey: taskKeys.week(task.week_start) });
    },
  });
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
 */
export function useFinalizeTasks() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]): Promise<Task[]> => {
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from('tasks')
        .update({ is_finalized: true, finalized_at: new Date().toISOString() })
        .in('id', taskIds)
        .select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (tasks) => {
      for (const t of tasks) {
        void qc.invalidateQueries({ queryKey: taskKeys.week(t.week_start) });
      }
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
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
 */
export function useCloseTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CloseTaskInput): Promise<Task> => {
      const { data, error } = await supabase.rpc('close_task', {
        p_task_id: input.taskId,
        p_to_status: input.status,
        p_note: input.note ?? undefined,
        p_voice_note_id: input.voiceNoteId ?? undefined,
        p_nc_reason: input.ncReason ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as Task;
    },
    onSuccess: (_task, input) => {
      void qc.invalidateQueries({ queryKey: taskKeys.week(input.weekStart) });
      void qc.invalidateQueries({ queryKey: taskKeys.history(input.taskId) });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
