// The dashboard's cards: this week, consistency, week over week, and one recent week.
//
// The one rule that shapes every card here: NC is never folded away. It is excluded
// from the completion rate by design, so wherever a rate appears the NC count and
// share appear next to it — otherwise a 100% built on waived tasks reads as earned.

import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { NcBars, SegmentedBar, StatusLegend, WeekBars } from '@/features/analytics/charts';
import {
  formatPoints,
  formatRate,
  MIN_COUNTED_FOR_KEPT,
  NC_BANNER_THRESHOLD,
  type Consistency,
  type ThisWeek,
  type WeekComparison,
  type WeekSlot,
} from '@/features/analytics/metrics';
import { formatWeekRange } from '@/lib/week';

/** doc/05 §4.1: 0–10% small and grey, 10–20% amber, over 20% red. */
function ncTone(rate: number): string {
  if (rate > NC_BANNER_THRESHOLD) return 'text-status-n dark:text-status-n-dark';
  if (rate >= 0.1) return 'text-warn dark:text-warn-dark';
  return '';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// This week — doc/05 §2.1. The first thing on the screen because it is the only
// number you can still change.
// ---------------------------------------------------------------------------

export function ThisWeekCard({ week, threshold }: { week: ThisWeek; threshold: number }) {
  const nothing = week.total === 0;

  return (
    <Card className="mt-6">
      <View className="flex-row items-baseline justify-between">
        <Text variant="micro" className="tracking-wider uppercase">
          This week
        </Text>
        <Text variant="micro">{formatWeekRange(week.weekStart)}</Text>
      </View>

      <View className="mt-3">
        <SegmentedBar
          completed={week.completed}
          missed={week.missed}
          notCounted={week.notCounted}
          open={week.open}
        />
      </View>

      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text className="text-4xl font-bold">{formatRate(week.rate)}</Text>
          {week.usesWeight ? (
            // OQ-8: only once a task carries a weight. "By count" and "by effort"
            // diverge exactly when the easy things are the ones getting done.
            <Text variant="micro" className="mt-0.5">
              by count · {formatRate(week.effortRate)} by effort
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text variant="meta">
            C {week.completed} · N {week.missed} · NC {week.notCounted}
          </Text>
          <Text variant="micro" className="mt-0.5">
            {nothing ? 'nothing committed yet' : `${plural(week.open, 'task')} still open`}
            {' · '}
            {week.daysLeft === 0 ? 'last day' : `${plural(week.daysLeft, 'day')} left`}
          </Text>
        </View>
      </View>

      {week.notCounted > 0 ? (
        <Text variant="micro" className={`mt-2 ${ncTone(week.ncRate)}`}>
          {plural(week.notCounted, 'task')} not counted — {formatRate(week.ncRate)} of the week,
          left out of the rate above
        </Text>
      ) : null}

      {week.lateAdds.lateAdds > 0 ? (
        <Text variant="micro" className="mt-1">
          {plural(week.lateAdds.lateAdds, 'late add')} (committed after Wednesday)
          {week.lateAdds.withRate !== null && week.lateAdds.withoutRate !== null
            ? ` · ${formatRate(week.lateAdds.withRate)} with, ${formatRate(week.lateAdds.withoutRate)} without`
            : ''}
        </Text>
      ) : null}

      {/* Whether the week is on course to be kept, using the view's own verdict on
          the tasks closed so far. The two conditions are named because the second
          one — at least 3 counted — is the one people forget. */}
      <Text variant="micro" className="mt-2">
        {week.isKeptSoFar
          ? `Already a kept week on what is closed so far (${MIN_COUNTED_FOR_KEPT}+ counted at ${Math.round(threshold * 100)}% or better).`
          : week.keptShortfall > 0
            ? `Needs ${plural(week.keptShortfall, 'more counted task')} before it can be a kept week — a kept week is ${MIN_COUNTED_FOR_KEPT}+ counted at ${Math.round(threshold * 100)}% or better.`
            : `Below ${Math.round(threshold * 100)}% on what is closed so far. Not a kept week yet.`}
      </Text>

      <View className="mt-3">
        <StatusLegend />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Consistency — doc/05 §3. The 12-week ratio is the headline, the streak a badge.
// ---------------------------------------------------------------------------

export function ConsistencyCard({
  consistency,
  streak,
  slots,
  threshold,
}: {
  consistency: Consistency;
  streak: number;
  slots: WeekSlot[];
  threshold: number;
}) {
  const first = slots[0];
  const notEnough = consistency.ratio === null;

  return (
    <Card className="mt-3">
      <Text variant="micro" className="tracking-wider uppercase">
        Consistency
      </Text>

      <View className="mt-2 gap-3 flex-row items-end justify-between">
        {notEnough ? (
          <View className="flex-1">
            <Text variant="heading">Not enough data yet</Text>
            <Text variant="micro" className="mt-0.5">
              The first finished week decides this. A zero here would imply failure; there has been
              none.
            </Text>
          </View>
        ) : (
          <View>
            <Text className="text-3xl font-bold">
              {consistency.kept} of {consistency.counted}
            </Text>
            <Text variant="micro" className="mt-0.5">
              weeks kept in the last 12 ({formatRate(consistency.ratio)})
              {consistency.neutral > 0
                ? ` · ${plural(consistency.neutral, 'week')} of only NC skipped`
                : ''}
            </Text>
          </View>
        )}

        <View
          className={`px-3 py-1 rounded-full ${
            streak > 0 ? 'bg-status-c dark:bg-status-c-dark' : 'bg-raised dark:bg-raised-dark'
          }`}>
          <Text
            className={`text-meta font-semibold ${
              streak > 0 ? 'text-white' : 'text-muted dark:text-muted-dark'
            }`}>
            {streak > 0 ? `${plural(streak, 'week')} streak` : 'No streak'}
          </Text>
        </View>
      </View>

      <View className="mt-4">
        <WeekBars slots={slots} />
        <View className="mt-1 flex-row justify-between">
          <Text variant="micro">{first ? formatWeekRange(first.weekStart) : ''}</Text>
          <Text variant="micro">this week</Text>
        </View>
      </View>

      {/* The NC trend sits directly under the completion bars, on the same weeks.
          Rising grey under steady green is the pattern doc/05 §4.1 names. */}
      <View className="mt-3">
        <Text variant="micro">Share of each week marked NC</Text>
        <View className="mt-1">
          <NcBars slots={slots} />
        </View>
      </View>

      <Text variant="micro" className="mt-3">
        Kept = at least {MIN_COUNTED_FOR_KEPT} counted tasks and {Math.round(threshold * 100)}% or
        better. A dashed slot is a week with nothing committed; it counts as not kept and breaks the
        streak. A flat grey dash is a week of only NC, which is skipped.
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Week over week — doc/05 §5.3. Two columns, deltas coloured.
// ---------------------------------------------------------------------------

function Delta({ value, higherIsBetter = true }: { value: number; higherIsBetter?: boolean }) {
  const good = higherIsBetter ? value > 0 : value < 0;
  const bad = higherIsBetter ? value < 0 : value > 0;
  const tone = good
    ? 'text-status-c dark:text-status-c-dark'
    : bad
      ? 'text-status-n dark:text-status-n-dark'
      : '';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <Text variant="meta" className={`w-14 font-semibold text-right ${tone}`}>
      {sign}
      {Math.abs(value)}
    </Text>
  );
}

function CompareRow({
  label,
  before,
  after,
  delta,
}: {
  label: string;
  before: string;
  after: string;
  delta: React.ReactNode;
}) {
  return (
    <View className="py-1 flex-row items-center">
      <Text variant="meta" className="flex-1">
        {label}
      </Text>
      <Text variant="meta" className="w-14 text-right">
        {before}
      </Text>
      <Text className="w-14 font-semibold text-right">{after}</Text>
      {delta}
    </View>
  );
}

export function WeekOverWeekCard({ comparison }: { comparison: WeekComparison }) {
  const { thisWeek: now, lastWeek: prev, rateDelta, goalMoves } = comparison;

  return (
    <View className="mt-6">
      <Text variant="micro" className="tracking-wider uppercase">
        Week over week
      </Text>
      <Card className="mt-2">
        {!prev.hasData ? (
          <Text variant="meta" className="mb-2">
            Nothing was committed last week, so there is no rate to compare with. That is a data
            point too.
          </Text>
        ) : null}

        <View className="pb-1 flex-row items-center">
          <View className="flex-1" />
          <Text variant="micro" className="w-14 text-right">
            last
          </Text>
          <Text variant="micro" className="w-14 text-right">
            this
          </Text>
          <Text variant="micro" className="w-14 text-right">
            change
          </Text>
        </View>

        <CompareRow
          label="Completion rate"
          before={formatRate(prev.rate)}
          after={formatRate(now.rate)}
          delta={
            rateDelta === null ? (
              <Text variant="meta" className="w-14 text-right">
                —
              </Text>
            ) : (
              <Text
                variant="meta"
                className={`w-14 font-semibold text-right ${
                  rateDelta > 0
                    ? 'text-status-c dark:text-status-c-dark'
                    : rateDelta < 0
                      ? 'text-status-n dark:text-status-n-dark'
                      : ''
                }`}>
                {formatPoints(rateDelta)}
              </Text>
            )
          }
        />
        <CompareRow
          label="Completed"
          before={String(prev.completed)}
          after={String(now.completed)}
          delta={<Delta value={now.completed - prev.completed} />}
        />
        <CompareRow
          label="Not completed"
          before={String(prev.missed)}
          after={String(now.missed)}
          delta={<Delta value={now.missed - prev.missed} higherIsBetter={false} />}
        />
        <CompareRow
          label="Not counted"
          before={String(prev.notCounted)}
          after={String(now.notCounted)}
          delta={<Delta value={now.notCounted - prev.notCounted} higherIsBetter={false} />}
        />
        <CompareRow
          label="Still open"
          before={String(prev.open)}
          after={String(now.open)}
          delta={
            <Text variant="meta" className="w-14 text-right">
              {now.open - prev.open > 0 ? '+' : ''}
              {now.open - prev.open}
            </Text>
          }
        />

        <View className="mt-3 border-border pt-3 dark:border-border-dark border-t">
          <Text variant="micro" className="tracking-wider uppercase">
            Goals that moved
          </Text>
          {goalMoves.length === 0 ? (
            <Text variant="meta" className="mt-1">
              No goal moved: every completed count is the same as last week.
            </Text>
          ) : (
            goalMoves.map((m) => (
              <View key={m.goalId} className="mt-1.5 gap-2 flex-row items-center">
                <View
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.color ?? '#4F46E5' }}
                />
                <Text variant="meta" className="flex-1" numberOfLines={1}>
                  {m.title}
                </Text>
                <Text variant="meta">
                  {m.before} → {m.after}
                </Text>
                <Delta value={m.delta} />
              </View>
            ))
          )}
        </View>
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------
// One recent week
// ---------------------------------------------------------------------------

/**
 * A row for a finished or current week. Missing weeks get a row too — a list that
 * silently skips them would make a gap invisible, which is the one thing the streak
 * logic goes out of its way to avoid.
 */
export function WeekRow({ slot, effort }: { slot: WeekSlot; effort: number | null }) {
  const { row, kind } = slot;

  if (kind === 'missing' || !row) {
    return (
      <Card className="border-dashed">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold">{formatWeekRange(slot.weekStart)}</Text>
          <Text variant="micro" className="text-status-n dark:text-status-n-dark">
            Not kept
          </Text>
        </View>
        <Text variant="micro" className="mt-1">
          Nothing committed. An empty week is not skipped; it breaks the streak.
        </Text>
      </Card>
    );
  }

  const open = row.still_open ?? 0;
  const ncRate = row.nc_rate ?? 0;
  const notCounted = row.not_counted ?? 0;
  const lateAdds = row.late_adds ?? 0;

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">{formatWeekRange(slot.weekStart)}</Text>
        {kind === 'in_progress' ? (
          <Text variant="micro">{open > 0 ? `${open} still open` : 'in progress'}</Text>
        ) : kind === 'neutral' ? (
          <Text variant="micro">Only NC — skipped</Text>
        ) : (
          <Text
            variant="micro"
            className={
              kind === 'kept'
                ? 'text-status-c dark:text-status-c-dark'
                : 'text-status-n dark:text-status-n-dark'
            }>
            {kind === 'kept' ? 'Kept' : 'Not kept'}
            {open > 0 ? ` · ${open} never closed` : ''}
          </Text>
        )}
      </View>

      <View className="mt-2 gap-4 flex-row items-baseline">
        <Text className="text-2xl font-bold">{formatRate(row.completion_rate)}</Text>
        <Text variant="micro">
          {row.completed ?? 0} of {row.counted_total ?? 0} counted
          {effort !== null && effort !== row.completion_rate
            ? ` · ${formatRate(effort)} by effort`
            : ''}
        </Text>
      </View>

      {/* NC is shown whenever it is present, never folded away. It is excluded from
          the rate above, so leaving it out would make the rate look earned when it
          was partly waived. */}
      {notCounted > 0 ? (
        <Text variant="micro" className={`mt-1 ${ncTone(ncRate)}`}>
          {notCounted} not counted ({formatRate(ncRate)} of the week)
          {ncRate > NC_BANNER_THRESHOLD ? ' — that is a lot to waive' : ''}
        </Text>
      ) : null}

      {lateAdds > 0 ? (
        <Text variant="micro" className="mt-0.5">
          {plural(lateAdds, 'late add')}
        </Text>
      ) : null}
    </Card>
  );
}
