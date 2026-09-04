// The chat log: threads, messages, search. P08.
//
// Two things the database decided that shape this file:
//
//   * threads and messages have SELECT, INSERT and UPDATE grants and no DELETE
//     (0010/0014), and nothing here updates either. A message is a timestamped
//     thought; editing it later would make the log say something you did not think
//     at the time. There is no edit function and no delete function, and the
//     cadence-domain skill says not to add one.
//   * `body_matches_kind` (0008): a text message has a body and no voice note, a
//     voice message has a voice note. The client derives the kind from what it is
//     given (features/chat/model.ts) rather than asking the caller to keep them in
//     step.
//
// Sends are outbox entries, the same shape as src/api/tasks.ts: optimistic, keyed,
// registered, safe to replay. Read the header there for why.

import {
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  type MutationOptions,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import {
  PAGE_SIZE,
  bodyFor,
  kindFor,
  nextPageCursor,
  normalizeSearch,
  type ThreadSelection,
} from '@/features/chat/model';
import { checked, sessionUserId } from '@/features/sync/session';
import { clientId, isUniqueViolation } from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database.types';

export type Thread = Tables<'threads'>;
export type Message = Tables<'messages'>;
export type Task = Tables<'tasks'>;

/** What a linked-task chip needs. Fetched by id because the task may be in any week. */
export type LinkedTask = Pick<Task, 'id' | 'title' | 'week_start' | 'status' | 'is_finalized'>;

export const chatKeys = {
  all: ['chat'] as const,
  threads: ['chat', 'threads'] as const,
  thread: (selection: ThreadSelection) =>
    selection.kind === 'daily_log'
      ? (['chat', 'thread', 'daily-log'] as const)
      : (['chat', 'thread', 'goal', selection.goalId] as const),
  messages: (threadId: string) => ['chat', 'messages', threadId] as const,
  search: (query: string, threadId: string | null) =>
    ['chat', 'search', query, threadId ?? 'all'] as const,
  linkedTask: (taskId: string) => ['chat', 'linked-task', taskId] as const,
};

/** Outbox op names. Stable across releases while a queue could still be on disk. */
export const chatMutationKeys = {
  send: ['chat', 'send'] as const,
};

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** Every thread this user has. Small — one per goal plus the log — and search results need a title per thread. */
export function useThreads() {
  return useQuery({
    queryKey: chatKeys.threads,
    queryFn: async (): Promise<Thread[]> => {
      const { data, error } = await supabase
        .from('threads')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The daily log, oldest first.
 *
 * `unique (user_id, goal_id)` does not protect this row: in Postgres two NULLs are
 * distinct, so the constraint never fires for goal_id = null, and two devices
 * opening the tab at the same moment could each insert one. Reading the oldest
 * back after the insert — rather than trusting the row the insert returned — makes
 * both of them converge on the same thread. A stray twin, if one ever exists, is
 * simply never opened.
 */
async function findDailyLog(): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('kind', 'daily_log')
    .is('goal_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureDailyLog(): Promise<Thread> {
  const existing = await findDailyLog();
  if (existing) return existing;

  const userId = await sessionUserId();
  const row: TablesInsert<'threads'> = { user_id: userId, title: 'Daily log', kind: 'daily_log' };
  const { error } = await supabase.from('threads').insert(row);
  if (error && !isUniqueViolation(error)) throw error;

  const after = await findDailyLog();
  if (!after) throw new Error('The daily log could not be opened. Try again in a moment.');
  return after;
}

/**
 * The thread for a goal, created on first open. Here the unique constraint does
 * hold, so a race resolves as a unique violation and the loser reads the winner's
 * row. `on delete restrict` on goals means the thread outlives an archive, which is
 * right: the conversation about an abandoned goal is part of the record.
 */
async function findGoalThread(goalId: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('goal_id', goalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Returns null when the goal is not this account's to open a thread about.
 *
 * The id can come off disk from a previous session (features/chat/last-thread.ts), and
 * the foreign key to goals is checked by the system, which does not apply RLS — so an
 * insert naming a goal this user cannot read would succeed, filing the conversation and
 * every message in it under someone else's goal. The title is taken from the goal that
 * was actually read back rather than from the selection, for the same reason.
 */
async function ensureGoalThread(goalId: string, goalTitle: string): Promise<Thread | null> {
  const existing = await findGoalThread(goalId);
  if (existing) return existing;

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, title')
    .eq('id', goalId)
    .maybeSingle();
  if (goalError) throw goalError;
  if (!goal) return null;

  const userId = await sessionUserId();
  const row: TablesInsert<'threads'> = {
    user_id: userId,
    goal_id: goalId,
    title: goal.title.trim() || goalTitle.trim() || 'Goal',
    kind: 'goal',
  };
  const inserted = await supabase.from('threads').insert(row).select().single();
  if (!inserted.error) return inserted.data;
  if (!isUniqueViolation(inserted.error)) throw inserted.error;

  const winner = await findGoalThread(goalId);
  if (!winner) throw new Error('That goal’s thread could not be opened. Try again in a moment.');
  return winner;
}

/**
 * The thread behind a selection, made if it does not exist yet. A read that may
 * write, deliberately: the tab must open on the log without a separate "create
 * your log" step, and the write is idempotent.
 */
export function useThread(selection: ThreadSelection | null) {
  return useQuery({
    queryKey: selection ? chatKeys.thread(selection) : ['chat', 'thread', 'none'],
    enabled: !!selection,
    // A thread row never changes once it exists; the goal's title is read from the
    // goal, not from here.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Thread> => {
      if (!selection) throw new Error('No thread selected.');
      // A goal that cannot be read is not an error — it is a stale remembered
      // selection — so the log is opened instead, which is where a first open lands.
      const thread =
        selection.kind === 'daily_log'
          ? await ensureDailyLog()
          : ((await ensureGoalThread(selection.goalId, selection.goalTitle)) ??
            (await ensureDailyLog()));
      // The thread list is what search uses for titles; keep it in step without a
      // refetch when a new goal thread appears.
      queryClient.setQueryData<Thread[]>(chatKeys.threads, (old) =>
        old && !old.some((t) => t.id === thread.id) ? [...old, thread] : old,
      );
      return thread;
    },
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type MessagePages = { pages: Message[][]; pageParams: (string | null)[] };

/**
 * A thread's messages, newest first, fifty at a time, keyset-paginated on
 * created_at so a message sent while scrolling cannot shift a page and repeat a
 * row. The (thread_id, created_at desc) index from 0008 serves every page.
 */
export function useThreadMessages(threadId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(threadId ?? ''),
    enabled: !!threadId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<Message[]> => {
      if (!threadId) return [];
      let q = supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage) => nextPageCursor(lastPage),
  });
}

/** Prepend to page one: the newest end of the log, where an optimistic row belongs. */
function prependMessage(threadId: string, message: Message): void {
  queryClient.setQueryData<MessagePages>(chatKeys.messages(threadId), (old) => {
    if (!old) return { pages: [[message]], pageParams: [null] };
    const [first = [], ...rest] = old.pages;
    return { ...old, pages: [[message, ...first], ...rest] };
  });
}

function removeMessage(threadId: string, id: string): void {
  queryClient.setQueryData<MessagePages>(chatKeys.messages(threadId), (old) =>
    old ? { ...old, pages: old.pages.map((p) => p.filter((m) => m.id !== id)) } : old,
  );
}

function invalidateThread(threadId: string): void {
  void queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
}

export type SendMessageInput = {
  threadId: string;
  /** The typed message. Ignored when a voice note is given — see kindFor(). */
  text?: string | null;
  /** A voice_notes id from VoiceRecorderButton.onRecorded. Makes this a voice message. */
  voiceNoteId?: string | null;
  linkedTaskId?: string | null;
  linkedGoalId?: string | null;
  /**
   * Minted on the device by useSendMessage, in the variables and not in mutationFn,
   * so that a replay after a restart reuses it and a message that already landed
   * is found rather than inserted twice.
   */
  id?: string;
  /**
   * When it was written, not when it landed. A thought queued on a train and
   * flushed an hour later belongs at the moment of the thought, and it keeps the
   * optimistic bubble exactly where the real row will be.
   */
  createdAt?: string;
  /** Who was signed in when this was written, for the same reason as NewTask.userId. */
  userId?: string;
};

const sendMessageOptions = {
  mutationKey: chatMutationKeys.send,
  mutationFn: async (input: SendMessageInput): Promise<Message> => {
    const id = input.id ?? clientId();
    const userId = await sessionUserId(input.userId);

    const row: TablesInsert<'messages'> = {
      id,
      user_id: userId,
      thread_id: input.threadId,
      kind: kindFor(input),
      body: bodyFor(input),
      voice_note_id: input.voiceNoteId ?? null,
      linked_task_id: input.linkedTaskId ?? null,
      linked_goal_id: input.linkedGoalId ?? null,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };

    const res = await supabase.from('messages').insert(row).select().single();
    if (res.error && isUniqueViolation(res.error)) {
      // This insert already landed — the app was killed after the request went out
      // and before the reply was recorded. Same id, same message: fetch it.
      return checked(await supabase.from('messages').select('*').eq('id', id).single());
    }
    return checked(res);
  },
  // A rejected send is removed by id rather than by restoring a snapshot, so a
  // later message that landed in the meantime is not taken down with it.
  onError: (_error, input) => {
    if (input.id) removeMessage(input.threadId, input.id);
  },
  onSettled: (_data, _error, input) => invalidateThread(input.threadId),
} satisfies MutationOptions<Message, Error, SendMessageInput, void>;

/**
 * Post a message. The bubble appears at once; the row is written when the network
 * allows, in order behind everything else queued (src/lib/outbox.ts).
 *
 * `onRejected` fires when the server refuses the row — not for a dropped
 * connection, which is retried silently. It is an option on the hook rather than
 * on each mutate() call because per-call callbacks only fire for the observer's
 * latest mutation, and two quick sends would lose the first one's message.
 *
 * It is handed the variables as well as the message. A refused row takes its
 * optimistic bubble down with it, and the words in that bubble exist nowhere else —
 * the composer emptied itself the moment they were sent. The screen puts them back.
 */
export function useSendMessage(
  options: { onRejected?: (message: string, input: SendMessageInput) => void } = {},
) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { onRejected } = options;

  const result = useMutation({
    ...sendMessageOptions,
    onMutate: (input) => {
      const now = input.createdAt ?? new Date().toISOString();
      prependMessage(input.threadId, {
        id: input.id ?? '',
        user_id: userId,
        thread_id: input.threadId,
        kind: kindFor(input),
        body: bodyFor(input),
        voice_note_id: input.voiceNoteId ?? null,
        linked_task_id: input.linkedTaskId ?? null,
        linked_goal_id: input.linkedGoalId ?? null,
        created_at: now,
        body_tsv: null,
      });
    },
    onError: (error, input) => {
      sendMessageOptions.onError(error, input);
      onRejected?.(error.message, input);
    },
  });

  // The id, the timestamp and the owner are fixed at the tap, in the variables, for
  // the reasons on SendMessageInput.
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = result;
  const stamp = useCallback(
    (input: SendMessageInput): SendMessageInput => ({
      ...input,
      id: input.id ?? clientId(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      userId: input.userId ?? userId,
    }),
    [userId],
  );
  const mutate = useCallback<typeof rawMutate>(
    (input, opts) => rawMutate(stamp(input), opts),
    [rawMutate, stamp],
  );
  const mutateAsync = useCallback<typeof rawMutateAsync>(
    (input, opts) => rawMutateAsync(stamp(input), opts),
    [rawMutateAsync, stamp],
  );

  return { ...result, mutate, mutateAsync };
}

/**
 * The ids of messages that have not reached the server yet — paused offline or in
 * flight — so their bubbles can say "sending". Read from the mutation cache rather
 * than a flag on the row: the row type is the database's, and the database has no
 * such state.
 */
export function usePendingMessageIds(): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: chatMutationKeys.send, status: 'pending' },
    select: (m) => (m.state.variables as SendMessageInput | undefined)?.id ?? '',
  });
  return useMemo(() => new Set(ids.filter((id) => id.length > 0)), [ids]);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Search results are capped rather than paged: a log search is a recall, not a listing. */
const SEARCH_LIMIT = 100;

/**
 * Full-text search over typed messages, newest first.
 *
 * `body_tsv` is a generated tsvector over `body` with a GIN index (0008), and
 * websearch syntax lets a query say "slept -well" or "\"gave up\"" the way a person
 * types it. A voice message has no body, so its tsvector is empty and it never
 * matches — transcripts are P07's, and P07 is blocked. The search screen says so
 * once; nothing here pretends otherwise.
 */
export function useSearchMessages(query: string, threadId: string | null) {
  const q = normalizeSearch(query);
  return useQuery({
    queryKey: chatKeys.search(q, threadId),
    enabled: q.length > 0,
    queryFn: async (): Promise<Message[]> => {
      let req = supabase
        .from('messages')
        .select('*')
        .textSearch('body_tsv', q, { type: 'websearch', config: 'english' })
        .order('created_at', { ascending: false })
        .limit(SEARCH_LIMIT);
      if (threadId) req = req.eq('thread_id', threadId);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Linked tasks
// ---------------------------------------------------------------------------

/** A task already sitting in some cached week, so the chip needs no round trip for it. */
function cachedTask(taskId: string): LinkedTask | undefined {
  for (const [, rows] of queryClient.getQueriesData<Task[]>({ queryKey: ['tasks', 'week'] })) {
    const hit = rows?.find((t) => t.id === taskId);
    if (hit) return hit;
  }
  return undefined;
}

/** The title and week behind a linked-task chip. */
export function useLinkedTask(taskId: string | null) {
  return useQuery({
    queryKey: chatKeys.linkedTask(taskId ?? ''),
    enabled: !!taskId,
    initialData: () => (taskId ? cachedTask(taskId) : undefined),
    // A finalized task's title is frozen (0006). A draft's can change, but a chip
    // that is an hour behind on a draft's rename is not worth a refetch per bubble.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<LinkedTask> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, week_start, status, is_finalized')
        .eq('id', taskId ?? '')
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Outbox registration
// ---------------------------------------------------------------------------

/**
 * Makes a queued send replayable after a restart. See registerTaskMutationDefaults
 * in src/api/tasks.ts; called from setupOutbox() beside it.
 */
export function registerChatMutationDefaults(): void {
  queryClient.setMutationDefaults(chatMutationKeys.send, sendMessageOptions);
}
