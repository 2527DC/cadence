// The top of the week screen: which week, how to move, and what state it is in. P04.
//
// Three kinds of week pass through here and they are not treated alike:
//
//   PAST      read-only. The record of what was planned, drafts and all.
//   THIS WEEK where the work happens. At the weekend it also carries the nudge about
//             drafts that are about to be lost.
//   FUTURE    plannable, nothing more.

import { Pressable, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { formatWeekRange, type DateString } from '@/lib/week';

export function WeekHeader({
  weekStart,
  thisWeek,
  committedCount,
  draftCount,
  atRisk,
  committing,
  onShift,
  onJump,
  onCommitAll,
}: {
  weekStart: DateString;
  thisWeek: DateString;
  committedCount: number;
  draftCount: number;
  /** Drafts that will be lost when this week ends. Non-zero only at the weekend. */
  atRisk: number;
  committing: boolean;
  onShift: (weeks: -1 | 1) => void;
  onJump: () => void;
  onCommitAll: () => void;
}) {
  const isThisWeek = weekStart === thisWeek;
  const isPast = weekStart < thisWeek;

  const summary = [
    committedCount > 0 ? `${committedCount} committed` : null,
    draftCount > 0 ? `${draftCount} draft${draftCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      {/* Week switcher ------------------------------------------------- */}
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => onShift(-1)}
          className="h-10 w-10 bg-raised dark:bg-raised-dark items-center justify-center rounded-full">
          <Text className="text-lg">‹</Text>
        </Pressable>

        <View className="items-center">
          <Text variant="heading">{formatWeekRange(weekStart)}</Text>
          <Text variant="micro">
            {isThisWeek ? 'This week' : isPast ? 'Past week · read-only' : 'Upcoming'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => onShift(1)}
          className="h-10 w-10 bg-raised dark:bg-raised-dark items-center justify-center rounded-full">
          <Text className="text-lg">›</Text>
        </Pressable>
      </View>

      {/* Getting back. Paging through a month of history one arrow at a time is the
          kind of thing that makes people stop looking at history. */}
      {!isThisWeek ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to this week"
          onPress={onJump}
          className="mt-3 bg-raised px-3 py-1.5 dark:bg-raised-dark self-center rounded-full active:opacity-70">
          <Text className="text-meta font-semibold text-accent dark:text-accent-dark">
            {isPast ? 'This week ›' : '‹ This week'}
          </Text>
        </Pressable>
      ) : null}

      {summary ? (
        <Text variant="micro" className="mt-3 text-center">
          {summary}
        </Text>
      ) : null}

      {/* The weekend nudge --------------------------------------------- */}
      {atRisk > 0 ? (
        <Card className="mt-4 border-warn dark:border-warn-dark">
          <Text className="font-semibold">
            {atRisk} draft{atRisk === 1 ? '' : 's'} still uncommitted
          </Text>
          <Text variant="meta" className="mt-1">
            The week ends Sunday night. Anything still a draft then was never committed and will not
            count.
            {committedCount === 0 ? ' A week with nothing committed breaks the streak.' : ''}
          </Text>
          <Button
            label={atRisk === 1 ? 'Commit it' : `Commit all ${atRisk}`}
            variant="secondary"
            className="mt-3"
            loading={committing}
            onPress={onCommitAll}
          />
        </Card>
      ) : null}

      {/* What a past week's drafts mean. They are kept, not tidied away. */}
      {isPast && draftCount > 0 ? (
        <Card draft className="mt-4">
          <Text variant="meta">
            {draftCount === 1 ? 'One draft was' : `${draftCount} drafts were`} never committed. The
            week has passed, so {draftCount === 1 ? 'it stays' : 'they stay'} as{' '}
            {draftCount === 1 ? 'it was' : 'they were'}.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}
