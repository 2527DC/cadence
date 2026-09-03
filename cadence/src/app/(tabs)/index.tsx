// The Week. P04.
//
// Two halves, and the line between them is the whole idea:
//
//   DRAFTS   dashed border. Editable, deletable, not yet real.
//   COMMITTED solid border. Permanent. Only the status can still move.
//
// Finalizing is the one-way door, so it asks first and says plainly what it costs.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Loading, StatusPill, Text } from '@/components/ui';
import { useGoals } from '@/api/goals';
import {
  useCreateTask,
  useDeleteDraft,
  useFinalizeTasks,
  useWeekTasks,
  type Task,
} from '@/api/tasks';
import { CloseTaskSheet } from '@/features/tasks/close-task-sheet';
import { currentWeekStart, formatWeekRange, shiftWeek, wouldBeLateAdd } from '@/lib/week';

const INPUT =
  'min-h-[46px] flex-1 rounded-card border border-border bg-surface px-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

export default function WeekScreen() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [closing, setClosing] = useState<Task | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);

  const tasks = useWeekTasks(weekStart);
  const goals = useGoals('active');
  const createTask = useCreateTask();
  const finalize = useFinalizeTasks();
  const deleteDraft = useDeleteDraft();

  const drafts = tasks.data?.filter((t) => !t.is_finalized) ?? [];
  const committed = tasks.data?.filter((t) => t.is_finalized) ?? [];
  const isThisWeek = weekStart === currentWeekStart();

  async function addTask() {
    const title = draftTitle.trim();
    if (title.length < 3) return;
    setDraftTitle('');
    try {
      await createTask.mutateAsync({ title, weekStart, goalId });
    } catch (e) {
      Alert.alert('Could not add that', e instanceof Error ? e.message : 'Unknown error');
      setDraftTitle(title);
    }
  }

  function confirmFinalize() {
    const late = isThisWeek && wouldBeLateAdd();
    Alert.alert(
      `Commit ${drafts.length} task${drafts.length === 1 ? '' : 's'}?`,
      'After this they cannot be renamed, moved to another week, or deleted. They can only be ' +
        'closed with a status and a note.' +
        (late
          ? '\n\nIt is past Wednesday, so these will be recorded as late adds.'
          : ''),
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Commit',
          style: 'destructive',
          onPress: () => {
            finalize.mutate(drafts.map((d) => d.id), {
              onError: (e) =>
                Alert.alert('Could not commit', e instanceof Error ? e.message : 'Unknown error'),
            });
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-gutter pb-24 pt-2"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={tasks.isRefetching} onRefresh={() => void tasks.refetch()} />
        }
      >
        {/* Week switcher ------------------------------------------------- */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            onPress={() => setWeekStart(shiftWeek(weekStart, -1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-raised dark:bg-raised-dark"
          >
            <Text className="text-lg">‹</Text>
          </Pressable>

          <View className="items-center">
            <Text variant="heading">{formatWeekRange(weekStart)}</Text>
            <Text variant="micro">{isThisWeek ? 'This week' : 'Another week'}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next week"
            onPress={() => setWeekStart(shiftWeek(weekStart, 1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-raised dark:bg-raised-dark"
          >
            <Text className="text-lg">›</Text>
          </Pressable>
        </View>

        {tasks.isPending ? (
          <Loading label="Loading the week" />
        ) : tasks.error ? (
          <Card className="mt-6">
            <Text className="text-status-n dark:text-status-n-dark">
              {(tasks.error as Error).message}
            </Text>
          </Card>
        ) : (
          <>
            {/* Committed ---------------------------------------------------- */}
            {committed.length > 0 ? (
              <View className="mt-6">
                <Text variant="micro" className="uppercase tracking-wider">
                  Committed · {committed.length}
                </Text>
                <View className="mt-2 gap-2">
                  {committed.map((t) => (
                    <CommittedTask
                      key={t.id}
                      task={t}
                      onPress={() =>
                        router.push({ pathname: '/task/[id]', params: { id: t.id, week: weekStart } })
                      }
                      onLongPress={() => setClosing(t)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Drafts ------------------------------------------------------- */}
            <View className="mt-6">
              <Text variant="micro" className="uppercase tracking-wider">
                Drafts · {drafts.length}
              </Text>
              <Text variant="micro" className="mt-1">
                Editable and deletable until you commit them.
              </Text>

              <View className="mt-2 gap-2">
                {drafts.map((t) => (
                  <Card key={t.id} draft className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text>{t.title}</Text>
                      {t.goal_id ? (
                        <Text variant="micro" className="mt-0.5">
                          {goals.data?.find((g) => g.id === t.goal_id)?.title ?? 'Goal'}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete draft ${t.title}`}
                      hitSlop={8}
                      onPress={() =>
                        deleteDraft.mutate(t, {
                          onError: (e) =>
                            Alert.alert(
                              'Could not delete',
                              e instanceof Error ? e.message : 'Unknown error',
                            ),
                        })
                      }
                    >
                      <Text variant="meta" className="text-status-n dark:text-status-n-dark">
                        Remove
                      </Text>
                    </Pressable>
                  </Card>
                ))}
              </View>

              {/* Add ------------------------------------------------------- */}
              <View className="mt-3 flex-row gap-2">
                <TextInput
                  className={INPUT}
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="One thing you will actually do"
                  returnKeyType="done"
                  onSubmitEditing={addTask}
                  maxLength={200}
                />
                <Button
                  label="Add"
                  variant="secondary"
                  onPress={addTask}
                  disabled={draftTitle.trim().length < 3}
                  loading={createTask.isPending}
                />
              </View>

              {goals.data && goals.data.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  <GoalChip label="No goal" on={goalId === null} onPress={() => setGoalId(null)} />
                  {goals.data.map((g) => (
                    <GoalChip
                      key={g.id}
                      label={g.title}
                      on={goalId === g.id}
                      onPress={() => setGoalId(g.id)}
                    />
                  ))}
                </View>
              ) : null}

              {drafts.length > 0 ? (
                <Button
                  label={`Commit ${drafts.length} task${drafts.length === 1 ? '' : 's'}`}
                  className="mt-4"
                  loading={finalize.isPending}
                  onPress={confirmFinalize}
                />
              ) : null}
            </View>

            {committed.length === 0 && drafts.length === 0 ? (
              <EmptyState
                title="Nothing planned"
                body="Add a few things you will actually do this week, then commit them. After that the only way out is an honest status."
              />
            ) : null}
          </>
        )}
      </ScrollView>

      <CloseTaskSheet task={closing} onClose={() => setClosing(null)} />
    </SafeAreaView>
  );
}

function GoalChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`rounded-full px-3 py-1.5 ${
        on ? 'bg-accent dark:bg-accent-dark' : 'bg-raised dark:bg-raised-dark'
      }`}
    >
      <Text
        className={`text-micro font-semibold ${on ? 'text-white' : 'text-muted dark:text-muted-dark'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CommittedTask({
  task,
  onPress,
  onLongPress,
}: {
  task: Task;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityHint={
        task.status === 'OPEN'
          ? 'Opens the task. Long press to close it.'
          : 'Opens the task and its full history.'
      }
    >
      <Card className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className={task.status === 'C' ? 'line-through opacity-60' : undefined}>
            {task.title}
          </Text>
          {task.late_add ? (
            <Text variant="micro" className="mt-0.5 text-warn dark:text-warn-dark">
              Late add
            </Text>
          ) : null}
        </View>
        <StatusPill status={task.status} />
      </Card>
    </Pressable>
  );
}
