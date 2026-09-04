// The Week. P04.
//
// Two halves, and the line between them is the whole idea:
//
//   DRAFTS    dashed border. Editable, deletable, not yet real.
//   COMMITTED solid border. Permanent. Only the status can still move.
//
// Finalizing is the one-way door, so it asks first and says plainly what it costs.
// It can be crossed one task at a time (the lock on each draft) or all at once
// (the button under the add row) — OQ-3, both.
//
// The screen is a SectionList grouped by day, with Unscheduled last. The rows, the
// header and the add row live in src/features/planner; this file wires them to the
// queries and owns the little state there is: which week, which draft is being
// edited, which task is being closed.

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  SectionList,
  View,
  type SectionListData,
  type SectionListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGoals, type Goal } from '@/api/goals';
import {
  useCreateTask,
  useDeleteDraft,
  useFinalizeTasks,
  useUpdateDraft,
  useWeekTasks,
  type Task,
} from '@/api/tasks';
import { Button, Card, EmptyState, Loading, Text } from '@/components/ui';
import { AddTaskRow, type NewDraft } from '@/features/planner/add-task-row';
import {
  buildSections,
  draftsAtRisk,
  isPastWeek,
  type PlannerSection,
} from '@/features/planner/group';
import { CommittedRow, DraftRow, SectionHeader, type DraftPatch } from '@/features/planner/rows';
import { WeekHeader } from '@/features/planner/week-header';
import { CloseTaskSheet } from '@/features/tasks/close-task-sheet';
import { hapticCommit, hapticReject } from '@/lib/haptics';
import { currentWeekStart, shiftWeek, wouldBeLateAdd } from '@/lib/week';

// Stable empties, so a week with no rows yet does not hand the memoised rows a fresh
// array on every render.
const NO_TASKS: Task[] = [];
const NO_GOALS: Goal[] = [];
const NO_IDS: string[] = [];

// SectionList is not one of the components NativeWind registers for className
// mapping (FlatList and ScrollView are), so contentContainerClassName would be
// silently dropped here. Plain style, with the same values as px-gutter pb-24 pt-2.
const CONTENT = { paddingHorizontal: 16, paddingBottom: 96, paddingTop: 8 } as const;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

export default function WeekScreen() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [closing, setClosing] = useState<Task | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const tasks = useWeekTasks(weekStart);
  // All goals, not just active ones: a committed task keeps pointing at its goal after
  // the goal is archived, and the row should still be able to name it.
  const goals = useGoals('all');
  const createTask = useCreateTask();
  const updateDraft = useUpdateDraft();
  const finalize = useFinalizeTasks();
  const deleteDraft = useDeleteDraft();

  // Re-read on every render rather than memoised, so a screen left open across
  // Sunday midnight starts treating the week as past the next time anything changes.
  const thisWeek = currentWeekStart();
  const isThisWeek = weekStart === thisWeek;
  const readOnly = isPastWeek(weekStart, thisWeek);

  const rows = tasks.data ?? NO_TASKS;
  const sections = useMemo(() => buildSections(rows, weekStart), [rows, weekStart]);
  const drafts = useMemo(() => rows.filter((t) => !t.is_finalized), [rows]);
  const committedCount = rows.length - drafts.length;
  const atRisk = draftsAtRisk(rows, weekStart);

  const allGoals = goals.data ?? NO_GOALS;
  const activeGoals = useMemo(() => allGoals.filter((g) => g.state === 'active'), [allGoals]);

  // Which rows are mid-flight, so only those show a spinner and lose their swipe.
  const deletingId = deleteDraft.isPending ? (deleteDraft.variables?.id ?? null) : null;
  const savingId = updateDraft.isPending ? (updateDraft.variables?.id ?? null) : null;
  const committingIds = finalize.isPending ? (finalize.variables ?? NO_IDS) : NO_IDS;

  // ---- Finalizing --------------------------------------------------------

  const { mutate: finalizeMutate } = finalize;
  const confirmCommit = useCallback(
    (targets: readonly Task[]) => {
      const [first] = targets;
      if (!first) return;
      const one = targets.length === 1;
      const late = isThisWeek && wouldBeLateAdd();

      Alert.alert(
        one ? `Commit “${first.title}”?` : `Commit ${targets.length} tasks?`,
        (one
          ? 'It becomes permanent. It can never be deleted or renamed'
          : 'They become permanent. They can never be deleted or renamed') +
          ' — only closed with a status and a note.' +
          (late
            ? one
              ? '\n\nIt is past Wednesday, so this will be recorded as a late add.'
              : '\n\nIt is past Wednesday, so these will be recorded as late adds.'
            : ''),
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Commit',
            style: 'destructive',
            onPress: () => {
              setEditingId(null);
              finalizeMutate(
                targets.map((t) => t.id),
                {
                  onSuccess: () => hapticCommit(),
                  onError: (e) => {
                    hapticReject();
                    Alert.alert('Could not commit', messageOf(e));
                  },
                },
              );
            },
          },
        ],
      );
    },
    [isThisWeek, finalizeMutate],
  );

  const commitOne = useCallback((task: Task) => confirmCommit([task]), [confirmCommit]);
  const commitAll = useCallback(() => confirmCommit(drafts), [confirmCommit, drafts]);

  // ---- Drafting ----------------------------------------------------------

  const { mutateAsync: createAsync } = createTask;
  const handleAdd = useCallback(
    (draft: NewDraft) =>
      createAsync({
        title: draft.title,
        weekStart,
        goalId: draft.goalId,
        plannedFor: draft.plannedFor,
      }),
    [createAsync, weekStart],
  );

  const { mutateAsync: updateAsync } = updateDraft;
  const handleSave = useCallback(
    async (id: string, patch: DraftPatch) => {
      try {
        await updateAsync({ id, ...patch });
        setEditingId(null);
      } catch (e) {
        hapticReject();
        Alert.alert('Could not save', messageOf(e));
      }
    },
    [updateAsync],
  );

  const { mutate: deleteMutate } = deleteDraft;
  const handleDelete = useCallback(
    (task: Task) => {
      setEditingId((id) => (id === task.id ? null : id));
      deleteMutate(task, {
        onError: (e) => {
          hapticReject();
          Alert.alert('Could not delete', messageOf(e));
        },
      });
    },
    [deleteMutate],
  );

  const beginEdit = useCallback((task: Task) => setEditingId(task.id), []);
  const endEdit = useCallback(() => setEditingId(null), []);

  // ---- Navigation --------------------------------------------------------

  const openTask = useCallback(
    (task: Task) =>
      router.push({ pathname: '/task/[id]', params: { id: task.id, week: weekStart } }),
    [router, weekStart],
  );

  function goToWeek(next: string) {
    setEditingId(null);
    setWeekStart(next);
  }

  // ---- List --------------------------------------------------------------

  const renderItem = useCallback<SectionListRenderItem<Task, PlannerSection>>(
    ({ item }) => (
      <View className="mt-2">
        {item.is_finalized ? (
          <CommittedRow task={item} goals={allGoals} onPress={openTask} onLongPress={setClosing} />
        ) : (
          <DraftRow
            task={item}
            goals={allGoals}
            weekStart={weekStart}
            editing={editingId === item.id}
            readOnly={readOnly}
            busy={deletingId === item.id || savingId === item.id || committingIds.includes(item.id)}
            onBeginEdit={beginEdit}
            onCancelEdit={endEdit}
            onSave={handleSave}
            onDelete={handleDelete}
            onCommit={commitOne}
          />
        )}
      </View>
    ),
    [
      allGoals,
      openTask,
      weekStart,
      editingId,
      readOnly,
      deletingId,
      savingId,
      committingIds,
      beginEdit,
      endEdit,
      handleSave,
      handleDelete,
      commitOne,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Task, PlannerSection> }) => (
      <SectionHeader section={section} />
    ),
    [],
  );

  const loaded = !tasks.isPending && !tasks.error;

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={CONTENT}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={7}
        refreshControl={
          <RefreshControl refreshing={tasks.isRefetching} onRefresh={() => void tasks.refetch()} />
        }
        ListHeaderComponent={
          <WeekHeader
            weekStart={weekStart}
            thisWeek={thisWeek}
            committedCount={committedCount}
            draftCount={drafts.length}
            atRisk={atRisk}
            committing={finalize.isPending}
            onShift={(weeks) => goToWeek(shiftWeek(weekStart, weeks))}
            onJump={() => goToWeek(thisWeek)}
            onCommitAll={commitAll}
          />
        }
        ListEmptyComponent={
          tasks.isPending ? (
            <Loading label="Loading the week" />
          ) : tasks.error ? (
            <Card className="mt-6">
              <Text className="text-status-n dark:text-status-n-dark">
                {messageOf(tasks.error)}
              </Text>
            </Card>
          ) : (
            <EmptyState
              title="Nothing planned"
              body={
                readOnly
                  ? 'Nothing was planned for this week. The record shows that too.'
                  : 'Add a few things you will actually do this week, then commit them. After that the only way out is an honest status.'
              }
            />
          )
        }
        ListFooterComponent={
          // A past week takes nothing new and commits nothing. Keyed by week so that
          // a day picked for one week is not silently carried into the next.
          loaded && !readOnly ? (
            <View className="mt-8">
              <AddTaskRow
                key={weekStart}
                weekStart={weekStart}
                goals={activeGoals}
                onAdd={handleAdd}
              />
              {drafts.length > 0 ? (
                <Button
                  label={`Commit ${drafts.length} task${drafts.length === 1 ? '' : 's'}`}
                  className="mt-4"
                  loading={finalize.isPending}
                  onPress={commitAll}
                />
              ) : null}
            </View>
          ) : null
        }
      />

      <CloseTaskSheet task={closing} onClose={() => setClosing(null)} />
    </SafeAreaView>
  );
}
