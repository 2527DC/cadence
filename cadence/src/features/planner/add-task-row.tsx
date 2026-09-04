// The inline add row. P04.
//
// A draft is cheap on purpose: a title, and optionally a day and a goal. Nothing here
// is a commitment — that happens at the lock, never at "Add" — which is why the row
// asks for so little and why the keyboard stays up between adds.
//
// The row owns its own text state so that typing re-renders this component and not
// the list of fifty rows above it.

import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import type { Goal } from '@/api/goals';
import { Button, Text } from '@/components/ui';
import { hapticReject } from '@/lib/haptics';
import type { DateString } from '@/lib/week';

import { DayPicker, GoalPicker } from './chips';

const INPUT =
  'min-h-[46px] flex-1 rounded-card border border-border bg-surface px-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

export type NewDraft = {
  title: string;
  plannedFor: DateString | null;
  goalId: string | null;
};

export function AddTaskRow({
  weekStart,
  goals,
  onAdd,
}: {
  weekStart: DateString;
  /** Only active goals are offered for new work. */
  goals: readonly Goal[];
  onAdd: (draft: NewDraft) => Promise<unknown>;
}) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<DateString | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Mirrors the check constraint on tasks.title: 3–200 characters after trimming.
  const trimmed = title.trim();
  const titleOk = trimmed.length >= 3 && trimmed.length <= 200;

  async function submit() {
    if (!titleOk || pending) return;
    // Cleared before the round trip so the next title can be typed straight away;
    // put back if the insert fails so nothing typed is lost. The day and goal are
    // kept: planning three things for Tuesday should not mean picking Tuesday thrice.
    setTitle('');
    setPending(true);
    try {
      await onAdd({ title: trimmed, plannedFor: day, goalId });
    } catch (e) {
      setTitle(trimmed);
      hapticReject();
      Alert.alert('Could not add that', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <Text variant="micro" className="tracking-wider uppercase">
        Add a draft
      </Text>

      <View className="mt-2 gap-2 flex-row">
        <TextInput
          className={INPUT}
          value={title}
          onChangeText={setTitle}
          placeholder="One thing you will actually do"
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={submit}
          maxLength={200}
          accessibilityLabel="New draft title"
        />
        <Button
          label="Add"
          variant="secondary"
          onPress={submit}
          disabled={!titleOk}
          loading={pending}
        />
      </View>

      <View className="mt-3">
        <DayPicker weekStart={weekStart} value={day} onChange={setDay} />
      </View>

      {goals.length > 0 ? (
        <View className="mt-3">
          <GoalPicker goals={goals} value={goalId} onChange={setGoalId} />
        </View>
      ) : null}

      <Text variant="micro" className="mt-3">
        Drafts can be edited and deleted until you commit them. Tap one to edit it, swipe it left to
        delete it.
      </Text>
    </View>
  );
}
