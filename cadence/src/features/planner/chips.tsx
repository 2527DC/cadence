// Chips for the planner: a day of the week, a goal. P04.
//
// Both are radio groups drawn as pills, the same shape the goals screen uses for its
// filter row. A tap is a selection, so it gets the selection haptic and nothing
// louder — the loud haptics are reserved for the things that become permanent.

import { Pressable, View } from 'react-native';

import type { Goal } from '@/api/goals';
import { Text } from '@/components/ui';
import { hapticSelect } from '@/lib/haptics';
import { daysOfWeek, isToday, toDateString, type DateString } from '@/lib/week';

import { dayChipLabel } from './group';

export function Chip({
  label,
  on,
  onPress,
  dot = false,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** A small marker in front of the label. Used to point out today. */
  dot?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel}
      className={`gap-1.5 px-3 py-1.5 flex-row items-center rounded-full ${
        on ? 'bg-accent dark:bg-accent-dark' : 'bg-raised dark:bg-raised-dark'
      }`}>
      {dot ? (
        <View
          className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'}`}
        />
      ) : null}
      <Text
        className={`text-micro font-semibold ${on ? 'text-white' : 'text-muted dark:text-muted-dark'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Any day" plus the seven days of the week, Monday first. `null` means unscheduled,
 * which is the default and is a perfectly good answer: a task does not need a day to
 * be a real commitment, it needs to be committed.
 */
export function DayPicker({
  weekStart,
  value,
  onChange,
}: {
  weekStart: DateString;
  value: DateString | null;
  onChange: (day: DateString | null) => void;
}) {
  return (
    <View className="gap-2 flex-row flex-wrap">
      <Chip label="Any day" on={value === null} onPress={() => onChange(null)} />
      {daysOfWeek(weekStart).map((d) => {
        const key = toDateString(d);
        return (
          <Chip
            key={key}
            label={dayChipLabel(d)}
            on={value === key}
            dot={isToday(d)}
            accessibilityLabel={`${dayChipLabel(d)}${isToday(d) ? ', today' : ''}`}
            onPress={() => onChange(key)}
          />
        );
      })}
    </View>
  );
}

/** "No goal" plus whatever goals are passed in. Renders nothing when there are none. */
export function GoalPicker({
  goals,
  value,
  onChange,
}: {
  goals: readonly Goal[];
  value: string | null;
  onChange: (goalId: string | null) => void;
}) {
  if (goals.length === 0) return null;
  return (
    <View className="gap-2 flex-row flex-wrap">
      <Chip label="No goal" on={value === null} onPress={() => onChange(null)} />
      {goals.map((g) => (
        <Chip key={g.id} label={g.title} on={value === g.id} onPress={() => onChange(g.id)} />
      ))}
    </View>
  );
}
