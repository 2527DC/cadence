// The weekly review. P11, and the screen the Sunday notification exists to open.
//
// The order down the page is the order the conversation should go in:
//
//   1. What is still open — the only thing here you can still change.
//   2. What the week actually was: rate, C/N/NC, late adds, goals.
//   3. How it compares with the week before.
//   4. What was closed, and what you said about each one.
//   5. What never got committed at all.
//   6. One question, answered in writing or out loud.
//
// Two rules shape it. First, nothing on this screen recomputes a rate: every number
// comes off v_week_rollup / v_goal_progress through the functions in
// features/analytics/metrics.ts, the same ones the dashboard uses. Second, nothing on
// this screen edits or deletes anything finalized. A still-open task can be closed —
// with its own note, through the same sheet as everywhere else — and that is the only
// mutation the screen offers besides writing the review itself.
//
// Any past week can be opened, by deep link or with the arrows in the header. A week
// with no review yet simply has no answer written under it.

import { parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGoalProgress, useStreakThreshold, useWeekRollups } from '@/api/analytics';
import { useGoals, type Goal } from '@/api/goals';
import { useSaveReview, useWeekCloseEvents, useWeekReview } from '@/api/reviews';
import { useWeekTasks, type Task } from '@/api/tasks';
import { Card, ErrorState, Loading, Text } from '@/components/ui';
import { WeekOverWeekCard } from '@/features/analytics/cards';
import { goalScorecards, thisWeek, weekOverWeek } from '@/features/analytics/metrics';
import {
  ClosedSection,
  DraftsSection,
  GoalAttainmentSection,
  LateAddsSection,
  ReminderSettings,
  ReviewAnswer,
  SnapshotCard,
  StillOpenSection,
  WeekNumbersCard,
  buildReviewStats,
  byClosedAt,
  groupReviewTasks,
  latestEvents,
  parseReviewStats,
  reviewHref,
  statsDrift,
  type ClosedEntry,
} from '@/features/notifications';
import { CloseTaskSheet } from '@/features/tasks/close-task-sheet';
import { hapticCommit, hapticReject } from '@/lib/haptics';
import {
  currentWeekStart,
  formatWeekRange,
  shiftWeek,
  todayInAppTimezone,
  weekStartOf,
  type DateString,
} from '@/lib/week';

// One bad screen must not take the app with it. expo-router wraps this route in the
// boundary below, so a throw here leaves the tab bar and every other tab alive.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/error-boundary';

// Stable empties, so a week still loading does not hand every memo a fresh array.
const NO_TASKS: Task[] = [];
const NO_GOALS: Goal[] = [];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The week this screen is about.
 *
 * The parameter arrives from a deep link, so it is not trusted: anything that is not a
 * date falls back to the week that just ended, and a date that is not a Monday is
 * snapped to the Monday of its week. `week_start` is a Monday by check constraint, and
 * a query for a Wednesday would silently return nothing at all.
 */
function resolveWeek(param: string | undefined): DateString {
  const fallback = shiftWeek(currentWeekStart(), -1);
  if (!param || !ISO_DATE.test(param)) return fallback;
  // The shape can be right and the date still impossible ("2026-02-31"). date-fns
  // throws when asked to format an invalid date, so this is checked before, not after.
  if (Number.isNaN(parseISO(param).getTime())) return fallback;
  return weekStartOf(param);
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

export default function WeeklyReviewScreen() {
  const params = useLocalSearchParams<{ week?: string }>();
  const router = useRouter();
  const weekStart = resolveWeek(params.week);

  const [closing, setClosing] = useState<Task | null>(null);

  const tasks = useWeekTasks(weekStart);
  const rollups = useWeekRollups();
  const goals = useGoals('all');
  const progress = useGoalProgress();
  const threshold = useStreakThreshold();
  const review = useWeekReview(weekStart);

  const rows = tasks.data ?? NO_TASKS;
  const groups = useMemo(() => groupReviewTasks(rows), [rows]);

  // The notes live in the ledger, not on the task. Fetched for the week's closed tasks
  // only; the key carries their ids, and closing or correcting one from this screen
  // invalidates the ledger (see closeTaskOptions), so the note that stands is the one
  // shown.
  const closedIds = useMemo(() => groups.closed.map((t) => t.id), [groups.closed]);
  const events = useWeekCloseEvents(weekStart, closedIds);

  /**
   * Everything numeric on this page, in one memo, built entirely out of metrics.ts.
   *
   * `thisWeek` is named for the dashboard's use of it but takes the week as an
   * argument, so it answers for any week. Same for `weekOverWeek`, which compares
   * whatever week it is handed against the one before — which is exactly the
   * week-over-week the review wants.
   */
  const model = useMemo(() => {
    if (!rollups.data) return null;
    const rollupRows = rollups.data;
    const allGoals = goals.data ?? NO_GOALS;
    const progressRows = progress.data ?? [];
    const row = rollupRows.find((r) => String(r.week_start) === weekStart) ?? null;

    // Only finalized tasks reach the metrics: a draft was never a commitment, and
    // counting one in the late-add denominator would understate the share.
    const facts = rows.filter((t) => t.is_finalized);

    // Goals that existed during this week. An archived goal still counts for the weeks
    // it was live in; a goal started afterwards has nothing to say about it.
    const goalsThatWeek = allGoals.filter(
      (g) => g.start_week <= weekStart && (!g.end_week || g.end_week >= weekStart),
    );

    return {
      week: thisWeek(row, facts, weekStart, todayInAppTimezone()),
      comparison: weekOverWeek(rollupRows, goalsThatWeek, progressRows, weekStart),
      goals: goalScorecards(goalsThatWeek, progressRows, weekStart),
    };
  }, [rollups.data, goals.data, progress.data, rows, weekStart]);

  const closedEntries: ClosedEntry[] = useMemo(() => {
    const byTask = latestEvents(events.data ?? []);
    return [...groups.closed].sort(byClosedAt).map((task) => {
      const hit = byTask.get(task.id);
      return { task, event: hit?.event ?? null, corrections: hit?.corrections ?? 0 };
    });
  }, [groups.closed, events.data]);

  // The frozen numbers, if this week has been reviewed before. Parsed defensively: the
  // column is jsonb and there is no migration for it.
  const snapshot = useMemo(() => parseReviewStats(review.data?.stats), [review.data?.stats]);
  const drift = model
    ? statsDrift(snapshot, {
        completed: model.week.completed,
        missed: model.week.missed,
        notCounted: model.week.notCounted,
        open: model.week.open,
      })
    : null;

  const save = useSaveReview();
  const { mutate: saveMutate } = save;

  const onSave = useCallback(
    (input: { summary: string | null; voiceNoteId: string | null }) => {
      if (!model) return;
      saveMutate(
        {
          weekStart,
          summary: input.summary,
          voiceNoteId: input.voiceNoteId,
          // The snapshot is taken here, at the tap, from the same model the screen is
          // showing. That is what makes the review a record of a moment.
          stats: buildReviewStats({
            week: model.week,
            comparison: model.comparison,
            goals: model.goals,
            draftCount: groups.drafts.length,
            capturedAt: new Date(),
          }),
        },
        {
          onSuccess: () => hapticCommit(),
          onError: (e) => {
            hapticReject();
            Alert.alert('Could not save the review', messageOf(e));
          },
        },
      );
    },
    [model, saveMutate, weekStart, groups.drafts.length],
  );

  const thisWeekStart = currentWeekStart();
  const isCurrentWeek = weekStart === thisWeekStart;
  const canGoForward = weekStart < thisWeekStart;

  const refreshing =
    tasks.isRefetching || rollups.isRefetching || review.isRefetching || events.isRefetching;

  function refetchAll() {
    void tasks.refetch();
    void rollups.refetch();
    void progress.refetch();
    void review.refetch();
    void events.refetch();
  }

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-gutter pb-24 pt-2"
        // The review ends in a text field, and this page is long. Persisting taps means
        // Save works on the first tap while the keyboard is up rather than the second;
        // adjusting the inset keeps the field above the keys as the answer grows.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text variant="meta" className="text-accent dark:text-accent-dark">
            ‹ Back
          </Text>
        </Pressable>

        {/* Any past week is reachable from here, not only the one that was linked to. */}
        <View className="mt-4 gap-3 flex-row items-center justify-between">
          <WeekArrow
            label="‹"
            hint="Previous week"
            onPress={() => router.replace(reviewHref(shiftWeek(weekStart, -1)))}
          />
          <View className="flex-1 items-center">
            <Text variant="micro" className="tracking-wider uppercase">
              Weekly review
            </Text>
            <Text variant="heading" className="mt-0.5">
              {formatWeekRange(weekStart)}
            </Text>
          </View>
          <WeekArrow
            label="›"
            hint="Next week"
            disabled={!canGoForward}
            onPress={() => router.replace(reviewHref(shiftWeek(weekStart, 1)))}
          />
        </View>

        {isCurrentWeek ? (
          <Card className="mt-3" draft>
            <Text variant="meta">
              This week is still running, so these numbers are not final. Reviewing it now is fine —
              the snapshot records what it looked like today.
            </Text>
          </Card>
        ) : null}

        {/* The numbers come from v_week_rollup, and a screen opened from the Sunday
            notification on a phone with no signal has to say so rather than spin. The
            dashboard answers the same two failures the same way. */}
        {rollups.error && !rollups.data ? (
          <ErrorState
            title="The week’s numbers could not be loaded"
            message={messageOf(rollups.error)}
            onRetry={() => void rollups.refetch()}
          />
        ) : rollups.fetchStatus === 'paused' && !rollups.data ? (
          <Card className="mt-6">
            <Text variant="meta">
              The week’s numbers have not been fetched on this device yet, and there is no
              connection to fetch them with. This page fills in once you are back online.
            </Text>
          </Card>
        ) : tasks.isPending || !model ? (
          <Loading label="Reading the week" />
        ) : (
          <>
            <StillOpenSection tasks={groups.stillOpen} onClose={setClosing} />

            <Text variant="micro" className="mt-6 tracking-wider uppercase">
              The week
            </Text>
            <WeekNumbersCard week={model.week} threshold={threshold.data ?? 0.7} />

            {snapshot ? <SnapshotCard stats={snapshot} drift={drift} /> : null}

            <LateAddsSection week={model.week} tasks={groups.lateAdds} />

            <WeekOverWeekCard comparison={model.comparison} />

            <GoalAttainmentSection goals={model.goals} />

            {events.isPending && closedIds.length > 0 ? (
              <Loading label="Reading what you wrote" />
            ) : (
              <ClosedSection
                entries={closedEntries}
                onOpen={(task) =>
                  router.push({
                    pathname: '/task/[id]',
                    params: { id: task.id, week: task.week_start },
                  })
                }
              />
            )}

            <DraftsSection drafts={groups.drafts} />

            <Text variant="micro" className="mt-6 tracking-wider uppercase">
              Your answer
            </Text>
            {review.isPending ? (
              <Loading />
            ) : (
              <ReviewAnswer
                // Remounted when the stored review arrives or the week changes, so the
                // fields are seeded from what is actually saved rather than from an
                // empty first render.
                key={`${weekStart}:${review.data?.id ?? 'new'}`}
                initialSummary={review.data?.summary ?? null}
                initialVoiceNoteId={review.data?.voice_note_id ?? null}
                savedAt={review.data ? new Date(review.data.created_at) : null}
                // `isPaused` and not just `isPending`: an outbox write made offline
                // stays pending until there is a network, and a spinner that never
                // stops would read as "it did not save". The optimistic row has
                // already landed in the cache, the sync banner reports the queue, and
                // the button goes back to rest.
                saving={save.isPending && !save.isPaused}
                onSave={onSave}
              />
            )}

            <ReminderSettings />

            <Text variant="micro" className="mt-6 text-center">
              Nothing on this page can be edited or deleted. A task closed wrongly is closed again
              with the truth, and both are kept.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Each still-open task is closed on its own, with its own note. The sheet is the
          same one the Week screen uses, so the rules cannot differ between them. */}
      <CloseTaskSheet task={closing} onClose={() => setClosing(null)} />
    </SafeAreaView>
  );
}

function WeekArrow({
  label,
  hint,
  disabled = false,
  onPress,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      className={`bg-raised dark:bg-raised-dark h-10 w-10 items-center justify-center rounded-full ${
        disabled ? 'opacity-30' : ''
      }`}>
      <Text variant="heading">{label}</Text>
    </Pressable>
  );
}
