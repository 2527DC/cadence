// Choosing what a message is about. P08.
//
// This week's tasks and the active goals, one tap each. The link is set on the
// message at send time and never changed afterwards, so this is the composer's
// picker and not a menu on an existing bubble. Drafts are offered too: a thought
// about something you have not committed to yet is still worth keeping next to it.

import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGoals, type Goal } from '@/api/goals';
import { useWeekTasks, type Task } from '@/api/tasks';
import { Button, Loading, StatusDot, STATUS_META, Text } from '@/components/ui';
import { hapticSelect } from '@/lib/haptics';
import { currentWeekStart, formatWeekRange } from '@/lib/week';

import type { MessageLink } from './composer';

const ROW =
  'flex-row items-center gap-3 rounded-card border border-border bg-surface p-card dark:border-border-dark dark:bg-surface-dark active:opacity-70';

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`${ROW} border-l-4 ${STATUS_META[task.status].cardBorder}`}>
      <StatusDot status={task.status} />
      <View className="flex-1">
        <Text numberOfLines={2}>{task.title}</Text>
        <Text variant="micro" className="mt-0.5">
          {task.is_finalized ? task.status : 'draft'}
          {task.planned_for ? ` · ${task.planned_for.slice(5)}` : ''}
        </Text>
      </View>
      <Text variant="meta">›</Text>
    </Pressable>
  );
}

function GoalRow({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={ROW}>
      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: goal.color ?? '#4F46E5' }} />
      <View className="flex-1">
        <Text numberOfLines={2}>{goal.title}</Text>
        <Text variant="micro" className="mt-0.5">
          {goal.target_per_week}× a week
        </Text>
      </View>
      <Text variant="meta">›</Text>
    </Pressable>
  );
}

export function AttachSheet({
  visible,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: MessageLink | null;
  onPick: (link: MessageLink | null) => void;
  onClose: () => void;
}) {
  const weekStart = currentWeekStart();
  const tasks = useWeekTasks(weekStart);
  const goals = useGoals('active');

  function pick(link: MessageLink | null) {
    hapticSelect();
    onPick(link);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1">
        <ScrollView contentContainerClassName="px-gutter py-6" keyboardShouldPersistTaps="handled">
          <Text variant="title">Link to</Text>
          <Text variant="meta" className="mt-1">
            The chip on the message will take you back to it later. Optional.
          </Text>

          <Text variant="heading" className="mt-6">
            This week
          </Text>
          <Text variant="micro" className="mt-0.5">
            {formatWeekRange(weekStart)}
          </Text>
          <View className="mt-3 gap-2">
            {tasks.isPending ? (
              <Loading />
            ) : tasks.data && tasks.data.length > 0 ? (
              tasks.data.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onPress={() => pick({ kind: 'task', id: t.id, title: t.title })}
                />
              ))
            ) : (
              <Text variant="meta">Nothing planned this week yet.</Text>
            )}
          </View>

          <Text variant="heading" className="mt-7">
            Goals
          </Text>
          <View className="mt-3 gap-2">
            {goals.isPending ? (
              <Loading />
            ) : goals.data && goals.data.length > 0 ? (
              goals.data.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  onPress={() => pick({ kind: 'goal', id: g.id, title: g.title })}
                />
              ))
            ) : (
              <Text variant="meta">No active goals.</Text>
            )}
          </View>

          <View className="mt-8 gap-2">
            {current ? (
              <Button label="Remove the link" variant="secondary" onPress={() => pick(null)} />
            ) : null}
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
