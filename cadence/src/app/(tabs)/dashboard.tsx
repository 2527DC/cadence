// Dashboard. P09, plus the account controls.
//
// The order is doc/05 §6: current state, then trajectory, then warnings, then detail.
// The number you see first is the one you can still change — this week's.
//
// What this screen deliberately does not do: flatter you. The NC rate sits next to
// every completion rate, an empty week is drawn rather than skipped, and the banners
// say what they measured. A dashboard that hid any of that would be the thing this
// app was built to avoid.

import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGoalProgress, useStreakThreshold, useTaskFacts, useWeekRollups } from '@/api/analytics';
import { useGoals } from '@/api/goals';
import { Button, EmptyState, ErrorState, Loading, Text, errorText } from '@/components/ui';
import {
  ConsistencyCard,
  ThisWeekCard,
  WeekOverWeekCard,
  WeekRow,
} from '@/features/analytics/cards';
import { GoalsSection, NotKeepingSection } from '@/features/analytics/goals-section';
import { GuardrailBanners } from '@/features/analytics/guardrail-banners';
import {
  computeStreak,
  consistency,
  effortRate,
  goalScorecards,
  guardrails,
  thisWeek,
  usesWeight,
  weekOverWeek,
  weekSeries,
} from '@/features/analytics/metrics';
import { useAuth } from '@/features/auth/auth-provider';
import { ReviewPrompt } from '@/features/notifications';
import { currentWeekStart, shiftWeek, toDateString, todayInAppTimezone } from '@/lib/week';

// One bad screen must not take the app with it. expo-router wraps this route in the
// boundary below, so a throw here leaves the tab bar and every other tab alive.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/error-boundary';

const WINDOW = 12;

export default function DashboardScreen() {
  const { user, signOut } = useAuth();

  const rollups = useWeekRollups();
  const facts = useTaskFacts(WINDOW);
  const goals = useGoals('all');
  const progress = useGoalProgress();
  const threshold = useStreakThreshold();

  const currentWeek = currentWeekStart();
  // The IST date as a string, so the memo below re-runs exactly when the calendar
  // moves — at midnight in Asia/Kolkata — and not on every render.
  const todayKey = toDateString(todayInAppTimezone());

  // Every number below comes from a view or from one named function in metrics.ts.
  // Nothing is computed inline here, so there is nothing here to get wrong.
  const model = useMemo(() => {
    if (!rollups.data) return null;
    const rows = rollups.data;
    const tasks = facts.data ?? [];
    const goalRows = goals.data ?? [];
    const progressRows = progress.data ?? [];

    const slots = weekSeries(rows, currentWeek, WINDOW);
    const current = slots[slots.length - 1];

    return {
      slots,
      week: thisWeek(current?.row ?? null, tasks, currentWeek, parseISO(todayKey)),
      streak: computeStreak(rows, currentWeek),
      consistency: consistency(rows, currentWeek, WINDOW),
      guardrails: guardrails(rows, tasks, currentWeek),
      goals: goalScorecards(goalRows, progressRows, currentWeek),
      comparison: weekOverWeek(rows, goalRows, progressRows, currentWeek),
      weighted: usesWeight(tasks),
      tasks,
    };
  }, [rollups.data, facts.data, goals.data, progress.data, currentWeek, todayKey]);

  // Offline, or the refetch failed: the cached numbers are still shown, labelled with
  // when they were true. Showing them unlabelled would be a quiet lie of a different
  // kind; hiding them would make the app useless on a train.
  const stale =
    rollups.data && (rollups.fetchStatus === 'paused' || rollups.isError)
      ? format(rollups.dataUpdatedAt, 'd MMM, HH:mm')
      : null;

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your record stays on the server. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-gutter pb-24 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={rollups.isRefetching}
            onRefresh={() => {
              void rollups.refetch();
              void facts.refetch();
              void progress.refetch();
            }}
          />
        }>
        <Text variant="title">Dashboard</Text>
        <Text variant="meta" className="mt-1">
          Whether you are actually consistent.
        </Text>

        {stale ? (
          <Text variant="micro" className="mt-2 text-warn dark:text-warn-dark">
            As of {stale} — offline, showing the last numbers that were fetched.
          </Text>
        ) : null}

        {rollups.isPending ? (
          <Loading label="Reading your weeks" />
        ) : rollups.error && !rollups.data ? (
          <ErrorState
            title="The numbers could not be loaded"
            message={errorText(rollups.error)}
            onRetry={() => void rollups.refetch()}
          />
        ) : !model || rollups.data.length === 0 ? (
          <EmptyState
            title="Nothing to measure yet"
            body="Plan a week, commit it, and close the tasks honestly. There is no 0% here because nothing has been failed yet. The numbers become interesting after about three weeks."
          />
        ) : (
          <>
            {/* 1. Current state ------------------------------------------- */}
            <ThisWeekCard week={model.week} threshold={threshold.data ?? 0.7} />

            {/* The week that just ended, offered for review. It belongs with the
                current-state block rather than down in the detail, and it is the
                in-app route into the review — the one that still exists when
                notification permission was refused. Renders null while loading and
                softens to "Read it again" once the review is written. */}
            <ReviewPrompt weekStart={shiftWeek(currentWeek, -1)} />

            {/* 2. Trajectory ---------------------------------------------- */}
            <ConsistencyCard
              consistency={model.consistency}
              streak={model.streak}
              slots={model.slots}
              threshold={threshold.data ?? 0.7}
            />

            {/* 3. Warnings — only rendered when triggered ----------------- */}
            <GuardrailBanners items={model.guardrails} />

            {/* 4. Detail -------------------------------------------------- */}
            {goals.isPending || progress.isPending ? (
              <Loading label="Loading goals" />
            ) : (
              <>
                <GoalsSection cards={model.goals} />
                <NotKeepingSection cards={model.goals} />
              </>
            )}

            <WeekOverWeekCard comparison={model.comparison} />

            <Text variant="micro" className="mt-6 tracking-wider uppercase">
              Recent weeks
            </Text>
            <View className="mt-2 gap-2">
              {[...model.slots]
                .reverse()
                .filter((s) => s.kind !== 'before_history')
                .map((s) => (
                  <WeekRow
                    key={s.weekStart}
                    slot={s}
                    // OQ-8: the effort rate only exists once a weight has been used.
                    effort={
                      model.weighted
                        ? effortRate(model.tasks.filter((t) => t.week_start === s.weekStart))
                        : null
                    }
                  />
                ))}
            </View>
          </>
        )}

        {/* Account -------------------------------------------------------- */}
        <View className="mt-10 border-border pt-6 dark:border-border-dark border-t">
          <Text variant="micro" className="tracking-wider uppercase">
            Account
          </Text>
          <Text variant="meta" className="mt-1">
            {user?.email ?? 'Not signed in'}
          </Text>
          <Button label="Sign out" variant="secondary" className="mt-3" onPress={confirmSignOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
