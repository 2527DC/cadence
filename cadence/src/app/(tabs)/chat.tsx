// The chat log. P08.
//
// A running record of what you were thinking at the time, and the one screen in the
// app with no ceremony: no draft state, no confirmation, no finalize. You type or
// speak and it is written down.
//
// Three decisions this file makes, and why:
//
//   * The tab opens on the last thread you used, not on a thread list (P08). The
//     list is a row of chips instead — one tap to switch, and the log never leaves
//     the screen. Goal threads are created the first time their chip is tapped.
//   * The list is inverted, so index 0 is the newest message at the bottom and an
//     optimistic bubble lands exactly where the real row will. Day separators are
//     drawn by the bubble itself, from startsDay() — see model.ts for why that
//     reads *forwards* in an inverted list.
//   * There is no long-press menu and no swipe. A message cannot be edited,
//     deleted, forwarded or reacted to. That is the point of keeping it: the log
//     is only worth reading later because it cannot be tidied afterwards.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGoals, type Goal } from '@/api/goals';
import { EmptyState, ErrorState, Loading, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import {
  AttachSheet,
  Composer,
  DAILY_LOG,
  MessageBubble,
  SearchView,
  ThreadBar,
  dayKeyOf,
  dayLabel,
  flattenPages,
  loadLastThread,
  rememberLastThread,
  sameSelection,
  startsDay,
  useSendMessage,
  useThread,
  useThreadMessages,
  usePendingMessageIds,
  type Message,
  type MessageLink,
  type RestoreText,
  type Thread,
  type ThreadSelection,
} from '@/features/chat';
import { hapticReject } from '@/lib/haptics';
import { toDateString, todayInAppTimezone } from '@/lib/week';

// One bad screen must not take the app with it. expo-router wraps this route in the
// boundary below, so a throw here leaves the tab bar and every other tab alive.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/error-boundary';

// Stable empties, so a thread with nothing in it yet does not hand the memoised
// rows a fresh array on every render.
const NO_GOALS: Goal[] = [];

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

export default function ChatScreen() {
  // null while the remembered thread is still being read off disk. The screen shows
  // a spinner rather than opening the daily log and switching a beat later, which
  // would fetch two threads and flash the wrong title.
  const [selection, setSelection] = useState<ThreadSelection | null>(null);
  const [searching, setSearching] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [link, setLink] = useState<MessageLink | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [restore, setRestore] = useState<RestoreText | null>(null);

  // Per account, not per device: the remembered thread names a goal, and a goal
  // belongs to one person. See features/chat/last-thread.ts.
  const { user } = useAuth();
  const userId = user?.id ?? '';

  useEffect(() => {
    let cancelled = false;
    void loadLastThread(userId).then((remembered) => {
      if (!cancelled) setSelection(remembered);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // All goals, not just active ones: a thread outlives the goal being archived
  // (`on delete restrict`), and a message linked to an archived goal still has to
  // be able to name it.
  const goals = useGoals('all');
  const allGoals = goals.data ?? NO_GOALS;

  const thread = useThread(selection);
  const threadId = thread.data?.id ?? null;
  const messages = useThreadMessages(threadId);
  const pending = usePendingMessageIds();

  const send = useSendMessage({
    onRejected: (message, input) => {
      hapticReject();
      setSendError(message);
      // The optimistic bubble has just been removed, so a refused sentence would
      // otherwise exist nowhere. A refused voice message keeps its recording —
      // voice_notes rows are permanent — so there is nothing to hand back there.
      const words = input.text?.trim() ? input.text : null;
      if (words) setRestore((prev) => ({ text: words, token: (prev?.token ?? 0) + 1 }));
    },
  });

  const choose = useCallback(
    (next: ThreadSelection) => {
      setSelection((prev) => (sameSelection(prev, next) ? prev : next));
      setSearching(false);
      // A link picked for one thread has no meaning in another, and a rejection
      // belongs to the thread it was rejected in.
      setLink(null);
      setSendError(null);
      void rememberLastThread(userId, next);
    },
    [userId],
  );

  // Active goals get a chip. The one you are currently reading keeps its chip even
  // after it is archived — otherwise switching away from it would be a one-way door
  // out of a conversation that still exists.
  const barGoals = useMemo(() => {
    const active = allGoals.filter((g) => g.state === 'active');
    if (selection?.kind !== 'goal') return active;
    if (active.some((g) => g.id === selection.goalId)) return active;
    const archived = allGoals.find((g) => g.id === selection.goalId);
    return archived ? [...active, archived] : active;
  }, [allGoals, selection]);

  // Resolved once per render rather than once per bubble: a linked-goal chip only
  // needs a title, and the goals are already in hand.
  const goalTitles = useMemo(
    () => new Map(allGoals.map((g) => [g.id, g.title] as const)),
    [allGoals],
  );

  const rows = useMemo(() => flattenPages(messages.data?.pages), [messages.data?.pages]);
  const dayKeys = useMemo(() => rows.map((m) => dayKeyOf(m.created_at)), [rows]);
  // Read on every render rather than memoised, so a screen left open across midnight
  // starts saying "Yesterday" the next time anything changes.
  const today = toDateString(todayInAppTimezone());

  const openGoalThread = useCallback(
    (goalId: string) => {
      const goal = allGoals.find((g) => g.id === goalId);
      if (goal) choose({ kind: 'goal', goalId: goal.id, goalTitle: goal.title });
    },
    [allGoals, choose],
  );

  const openThread = useCallback(
    (t: Thread) => {
      if (!t.goal_id) return choose(DAILY_LOG);
      // The thread row carries the title it was created with; the goal's current
      // title is better if we have it.
      choose({
        kind: 'goal',
        goalId: t.goal_id,
        goalTitle: goalTitles.get(t.goal_id) ?? t.title,
      });
    },
    [choose, goalTitles],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <MessageBubble
        message={item}
        pending={pending.has(item.id)}
        dayLabel={startsDay(dayKeys, index) ? dayLabel(dayKeys[index] ?? '', today) : null}
        linkedGoalTitle={item.linked_goal_id ? (goalTitles.get(item.linked_goal_id) ?? null) : null}
        onOpenGoal={openGoalThread}
      />
    ),
    [dayKeys, goalTitles, openGoalThread, pending, today],
  );

  // ---- Sending -----------------------------------------------------------

  // The link is attached at send time and never afterwards: messages are insert-only,
  // so there is no "attach later" to offer.
  const { mutate: sendMessage } = send;
  const post = useCallback(
    (input: { text?: string; voiceNoteId?: string }) => {
      if (!threadId) return;
      setSendError(null);
      sendMessage({
        threadId,
        text: input.text ?? null,
        voiceNoteId: input.voiceNoteId ?? null,
        linkedTaskId: link?.kind === 'task' ? link.id : null,
        linkedGoalId: link?.kind === 'goal' ? link.id : null,
      });
      setLink(null);
    },
    [link, sendMessage, threadId],
  );

  const sendText = useCallback((text: string) => post({ text }), [post]);
  const sendVoice = useCallback((voiceNoteId: string) => post({ voiceNoteId }), [post]);

  // ---- Pagination --------------------------------------------------------

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = messages;
  // The "end" of an inverted list is the top of the screen, which is the oldest
  // message — so reaching it loads the page before.
  const loadOlder = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ---- Search ------------------------------------------------------------

  if (searching) {
    return (
      <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
        <SearchView
          currentThread={thread.data ?? null}
          onOpenThread={openThread}
          onClose={() => setSearching(false)}
        />
      </SafeAreaView>
    );
  }

  // ---- The log -----------------------------------------------------------

  const log = thread.isError ? (
    <View className="px-gutter flex-1 justify-center">
      <ErrorState
        title="This thread could not be opened"
        message={messageOf(thread.error)}
        onRetry={() => void thread.refetch()}
      />
    </View>
  ) : !threadId || messages.isPending ? (
    <Loading label="Opening" />
  ) : messages.isError ? (
    <View className="px-gutter flex-1 justify-center">
      <ErrorState
        title="The log could not be loaded"
        message={messageOf(messages.error)}
        onRetry={() => void messages.refetch()}
      />
    </View>
  ) : rows.length === 0 ? (
    // Rendered instead of ListEmptyComponent: an inverted FlatList flips its empty
    // component upside down along with everything else.
    <View className="flex-1 justify-center">
      <EmptyState
        title="Nothing here yet"
        body={
          selection?.kind === 'goal'
            ? 'Thoughts, blockers and wins about this goal. Type one, or hold the mic.'
            : 'Whatever you were thinking. Type it, or hold the mic and say it.'
        }
      />
    </View>
  ) : (
    <FlatList
      data={rows}
      inverted
      keyExtractor={(m) => m.id}
      renderItem={renderItem}
      onEndReached={loadOlder}
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerClassName="pb-2 pt-3"
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={11}
      removeClippedSubviews
      ListFooterComponent={isFetchingNextPage ? <Loading /> : null}
    />
  );

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="gap-3 px-gutter pt-2 flex-row items-start justify-between">
          <View className="flex-1">
            <Text variant="title">Chat</Text>
            <Text variant="meta" className="mt-0.5" numberOfLines={1}>
              {thread.data?.title ?? 'A running log of what you were thinking at the time.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search the log"
            hitSlop={8}
            onPress={() => setSearching(true)}
            className="mt-1.5 bg-raised px-3 py-1.5 dark:bg-raised-dark rounded-full active:opacity-70">
            <Text variant="micro" className="font-semibold text-ink dark:text-ink-dark">
              Search
            </Text>
          </Pressable>
        </View>

        <ThreadBar goals={barGoals} selection={selection} onSelect={choose} />

        <View className="flex-1">{log}</View>

        <Composer
          disabled={!threadId}
          link={link}
          onPickLink={() => setAttaching(true)}
          onClearLink={() => setLink(null)}
          onSendText={sendText}
          onSendVoice={sendVoice}
          error={sendError}
          restore={restore}
          placeholder={selection?.kind === 'goal' ? 'About this goal' : 'Write it down'}
        />
      </KeyboardAvoidingView>

      <AttachSheet
        visible={attaching}
        current={link}
        onPick={setLink}
        onClose={() => setAttaching(false)}
      />
    </SafeAreaView>
  );
}
