// Goals on the dashboard. doc/05 §2.2 and §3.4.
//
// The number shown is debt, not attainment: "10 behind" drives action, "33%" does not.
// Attainment is drawn as the bar, capped at 1 by the view so that overdelivering on one
// goal cannot mask neglecting another.

import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { ProgressBar } from '@/features/analytics/charts';
import { notKeeping, type GoalScorecard } from '@/features/analytics/metrics';

export function GoalsSection({ cards }: { cards: GoalScorecard[] }) {
  // Archived and paused goals are excluded from the current-week view and included in
  // history (doc/05 §7). Their past shows up in the week-over-week goal moves.
  const active = cards.filter((c) => c.state === 'active');

  return (
    <View className="mt-6">
      <Text variant="micro" className="tracking-wider uppercase">
        Goals · this week
      </Text>
      {active.length === 0 ? (
        <Card className="mt-2">
          <Text variant="meta">
            No active goals. Tasks without a goal still count; they just do not add up to anything.
          </Text>
        </Card>
      ) : (
        <Card className="mt-2 gap-4">
          {active.map((c) => (
            <GoalRow key={c.goalId} card={c} />
          ))}
        </Card>
      )}
    </View>
  );
}

function GoalRow({ card }: { card: GoalScorecard }) {
  return (
    <View>
      <View className="gap-3 flex-row items-center justify-between">
        <View className="gap-2 flex-1 flex-row items-center">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: card.color ?? '#4F46E5' }}
          />
          <Text className="font-semibold flex-1" numberOfLines={1}>
            {card.title}
          </Text>
        </View>
        <Text variant="meta">
          {card.completedThisWeek}/{card.target}
        </Text>
      </View>

      <View className="mt-2">
        <ProgressBar fraction={card.attainment} color={card.color} />
      </View>

      <View className="mt-1.5 flex-row items-center justify-between">
        <Debt card={card} />
        {card.reliability.active > 0 ? (
          <Text variant="micro">
            hit target {card.reliability.hit} of last {card.reliability.active} wk
          </Text>
        ) : (
          <Text variant="micro">first week</Text>
        )}
      </View>
    </View>
  );
}

/** expected − actual over finished weeks. Positive is behind, and says so. */
function Debt({ card }: { card: GoalScorecard }) {
  if (card.weeksElapsed === 0) {
    return <Text variant="micro">no finished weeks yet</Text>;
  }
  if (card.debt > 0) {
    return (
      <Text variant="micro" className="font-semibold text-status-n dark:text-status-n-dark">
        {card.debt} behind
      </Text>
    );
  }
  if (card.debt < 0) {
    return (
      <Text variant="micro" className="font-semibold text-status-c dark:text-status-c-dark">
        {-card.debt} ahead
      </Text>
    );
  }
  return (
    <Text variant="micro" className="font-semibold text-status-c dark:text-status-c-dark">
      on track
    </Text>
  );
}

/**
 * doc/05 §3.4: "Goals you are not keeping". Ranked worst first, and only rendered when
 * there is something to say — an empty section titled "Not keeping" would be a small
 * lie in the other direction.
 */
export function NotKeepingSection({ cards }: { cards: GoalScorecard[] }) {
  const worst = notKeeping(cards);
  if (worst.length === 0) return null;

  return (
    <View className="mt-6">
      <Text variant="micro" className="tracking-wider uppercase">
        Not keeping
      </Text>
      <Card className="mt-2 gap-3">
        {worst.map((c) => (
          <View key={c.goalId}>
            <Text className="font-semibold text-status-n dark:text-status-n-dark">{c.title}</Text>
            <Text variant="meta" className="mt-0.5">
              Hit its target {c.reliability.hit} of the last {c.reliability.active} weeks
              {c.debt > 0 ? ` · ${c.debt} behind since it started` : ''}
            </Text>
          </View>
        ))}
        <Text variant="micro">
          Measured as weeks the target was met ÷ weeks the goal was active, over the last 8 finished
          weeks. A goal you keep saying yes to and keep not doing is either the wrong target or the
          wrong goal.
        </Text>
      </Card>
    </View>
  );
}
