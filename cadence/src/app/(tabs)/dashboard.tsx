// Dashboard. The first slice of P09, plus the account controls.
//
// What it deliberately does not do: flatter you. The NC rate sits next to the
// completion rate because NC is the one status that can make a bad week look good,
// and a dashboard that hid it would be the thing this app was built to avoid.

import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Loading, Text } from '@/components/ui';
import { computeStreak, useWeekRollups, type WeekRollup } from '@/api/analytics';
import { useAuth } from '@/features/auth/auth-provider';
import { formatWeekRange } from '@/lib/week';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const rollups = useWeekRollups(12);

  const weeks = rollups.data ?? [];
  const finished = weeks.filter((w) => (w.still_open ?? 0) === 0 && (w.total ?? 0) > 0);
  const streak = computeStreak(weeks);
  const kept = finished.filter((w) => w.is_kept_week).length;

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your record stays on the server. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-gutter pb-24 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={rollups.isRefetching}
            onRefresh={() => void rollups.refetch()}
          />
        }
      >
        <Text variant="title">Dashboard</Text>
        <Text variant="meta" className="mt-1">
          Whether you are actually consistent.
        </Text>

        {rollups.isPending ? (
          <Loading label="Reading your weeks" />
        ) : rollups.error ? (
          <Card className="mt-6">
            <Text className="text-status-n dark:text-status-n-dark">
              {(rollups.error as Error).message}
            </Text>
          </Card>
        ) : weeks.length === 0 ? (
          <EmptyState
            title="Nothing to measure yet"
            body="Plan a week, commit it, and close the tasks honestly. The numbers become interesting after about three weeks."
          />
        ) : (
          <>
            <View className="mt-6 flex-row gap-3">
              <Stat label="Streak" value={streak === 0 ? '—' : `${streak}`} hint="kept weeks in a row" />
              <Stat
                label="Kept"
                value={`${kept}/${finished.length}`}
                hint="of finished weeks"
              />
            </View>

            <Text variant="micro" className="mt-6 uppercase tracking-wider">
              Recent weeks
            </Text>
            <View className="mt-2 gap-2">
              {[...weeks].reverse().map((w) => (
                <WeekRow key={String(w.week_start)} week={w} />
              ))}
            </View>
          </>
        )}

        {/* Account -------------------------------------------------------- */}
        <View className="mt-10 border-t border-border pt-6 dark:border-border-dark">
          <Text variant="micro" className="uppercase tracking-wider">
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

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="flex-1">
      <Text variant="micro" className="uppercase tracking-wider">
        {label}
      </Text>
      <Text className="mt-1 text-3xl font-bold">{value}</Text>
      <Text variant="micro" className="mt-0.5">
        {hint}
      </Text>
    </Card>
  );
}

function WeekRow({ week }: { week: WeekRollup }) {
  const open = week.still_open ?? 0;
  const ncRate = week.nc_rate ?? 0;

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">{formatWeekRange(String(week.week_start))}</Text>
        {open > 0 ? (
          <Text variant="micro">{open} still open</Text>
        ) : (
          <Text
            variant="micro"
            className={
              week.is_kept_week
                ? 'text-status-c dark:text-status-c-dark'
                : 'text-status-n dark:text-status-n-dark'
            }
          >
            {week.is_kept_week ? 'Kept' : 'Not kept'}
          </Text>
        )}
      </View>

      <View className="mt-2 flex-row items-baseline gap-4">
        <Text className="text-2xl font-bold">{pct(week.completion_rate)}</Text>
        <Text variant="micro">
          {week.completed ?? 0} of {week.counted_total ?? 0} counted
        </Text>
      </View>

      {/* NC is shown whenever it is present, never folded away. It is excluded from
          the rate above, so leaving it out entirely would make the rate look earned
          when it was partly waived. */}
      {(week.not_counted ?? 0) > 0 ? (
        <Text variant="micro" className={`mt-1 ${ncRate > 0.3 ? 'text-warn dark:text-warn-dark' : ''}`}>
          {week.not_counted} not counted ({pct(ncRate)} of the week)
          {ncRate > 0.3 ? ' — that is a lot to waive' : ''}
        </Text>
      ) : null}

      {(week.late_adds ?? 0) > 0 ? (
        <Text variant="micro" className="mt-0.5">
          {week.late_adds} late add{week.late_adds === 1 ? '' : 's'}
        </Text>
      ) : null}
    </Card>
  );
}
