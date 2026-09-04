// Which thread you are in. P08, OQ-4 accepted: the daily log plus one per goal.
//
// A row of chips rather than a list screen, so switching is one tap and the log
// itself stays on screen. Goal threads are created the first time their chip is
// tapped (see useThread); there is no thread-management screen and no way to make
// one that is not tied to a goal, on purpose — deciding where a thought belongs
// must never be the thing that stops you writing it down.

import { ScrollView } from 'react-native';

import type { Goal } from '@/api/goals';
import { Chip } from '@/features/planner/chips';

import { DAILY_LOG, sameSelection, type ThreadSelection } from './model';

export function ThreadBar({
  goals,
  selection,
  onSelect,
}: {
  /** Active goals, plus the selected goal if it is no longer active. */
  goals: readonly Goal[];
  selection: ThreadSelection | null;
  onSelect: (selection: ThreadSelection) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="flex-row gap-2 px-gutter py-2">
      <Chip
        label="Daily log"
        on={sameSelection(selection, DAILY_LOG)}
        onPress={() => onSelect(DAILY_LOG)}
      />
      {goals.map((g) => {
        const sel: ThreadSelection = { kind: 'goal', goalId: g.id, goalTitle: g.title };
        return (
          <Chip
            key={g.id}
            label={g.title}
            on={sameSelection(selection, sel)}
            onPress={() => onSelect(sel)}
          />
        );
      })}
    </ScrollView>
  );
}
