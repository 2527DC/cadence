// The rows of the week list, and the line between them. P04.
//
//   DraftRow      dashed. Tap to edit in place, swipe left to delete, lock to commit.
//   CommittedRow  solid. Tap to open, long-press to close. Nothing else — no swipe
//                 handler is mounted at all, not a disabled one.
//
// That asymmetry is rule R1 made visible. A finalized task cannot be deleted or
// renamed and the database would refuse if asked, but the honest UI does not ask,
// and does not hint that asking is possible.
//
// Both rows are memoised because the screen holds fifty of them and re-renders on
// every keystroke in the add row. A row only re-renders when its own props change.

import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { Goal } from '@/api/goals';
import type { Task } from '@/api/tasks';
import { Button, Card, STATUS_META, StatusPill, Text } from '@/components/ui';
import { hapticWarn } from '@/lib/haptics';
import type { DateString } from '@/lib/week';

import { DayPicker, GoalPicker } from './chips';
import { describeDay, type PlannerSection } from './group';

const INPUT =
  'min-h-[46px] rounded-card border border-border bg-surface px-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

/** What an in-place edit can change. Everything else on a draft is fixed at creation. */
export type DraftPatch = Partial<Pick<Task, 'title' | 'planned_for' | 'goal_id'>>;

function goalTitleOf(goals: readonly Goal[], goalId: string | null): string | null {
  if (!goalId) return null;
  return goals.find((g) => g.id === goalId)?.title ?? 'Goal';
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

export function SectionHeader({ section }: { section: PlannerSection }) {
  if (section.day === null) {
    return (
      <View className="mt-6 gap-2 flex-row items-center">
        <Text variant="micro" className="tracking-wider uppercase">
          Unscheduled
        </Text>
        <Text variant="micro" className="ml-auto">
          {section.data.length}
        </Text>
      </View>
    );
  }

  const { weekday, date, isToday } = describeDay(section.day);
  return (
    <View className="mt-6 gap-2 flex-row items-center">
      <Text variant="micro" className="tracking-wider uppercase">
        {weekday} {date}
      </Text>
      {isToday ? (
        <View className="bg-accent px-2 py-0.5 dark:bg-accent-dark rounded-full">
          <Text className="text-micro font-semibold text-white">Today</Text>
        </View>
      ) : null}
      <Text variant="micro" className="ml-auto">
        {section.data.length}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Committed
// ---------------------------------------------------------------------------

export const CommittedRow = memo(function CommittedRow({
  task,
  goals,
  onPress,
  onLongPress,
}: {
  task: Task;
  goals: readonly Goal[];
  onPress: (task: Task) => void;
  onLongPress: (task: Task) => void;
}) {
  const goalTitle = goalTitleOf(goals, task.goal_id);
  return (
    <Pressable
      onPress={() => onPress(task)}
      onLongPress={() => onLongPress(task)}
      accessibilityRole="button"
      accessibilityHint={
        task.status === 'OPEN'
          ? 'Opens the task. Long press to close it.'
          : 'Opens the task and its full history.'
      }>
      <Card className={`gap-3 flex-row items-center border-l-4 ${STATUS_META[task.status].cardBorder}`}>
        <View className="flex-1">
          <Text
            numberOfLines={2}
            className={task.status === 'C' ? 'line-through opacity-60' : undefined}>
            {task.title}
          </Text>
          {goalTitle || task.late_add ? (
            <View className="mt-0.5 gap-x-2 flex-row flex-wrap">
              {goalTitle ? <Text variant="micro">{goalTitle}</Text> : null}
              {task.late_add ? (
                <Text variant="micro" className="text-warn dark:text-warn-dark">
                  Late add
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <StatusPill status={task.status} />
      </Card>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

type DraftRowProps = {
  task: Task;
  /** Every goal, active or not, so a draft's goal can be named even once archived. */
  goals: readonly Goal[];
  weekStart: DateString;
  editing: boolean;
  /** A past week. The draft is shown as it was left and cannot be touched. */
  readOnly: boolean;
  /** A delete, commit or save is in flight for this row. */
  busy: boolean;
  onBeginEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onSave: (id: string, patch: DraftPatch) => void;
  onDelete: (task: Task) => void;
  onCommit: (task: Task) => void;
};

export const DraftRow = memo(function DraftRow(props: DraftRowProps) {
  const { task, readOnly, editing, busy, onDelete } = props;

  if (editing && !readOnly) {
    return <DraftEditor {...props} />;
  }

  const card = <DraftCard {...props} />;

  // A past week gets the card and nothing else: no swipe, no lock, no edit. The
  // draft is part of the record of that week, and the record is closed.
  if (readOnly) return card;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      enabled={!busy}
      onSwipeableWillOpen={hapticWarn}
      renderRightActions={(_progress, _translation, methods) => (
        <DeleteAction
          onPress={() => {
            methods.close();
            onDelete(task);
          }}
        />
      )}>
      {/* The draft card is transparent by design (a dashed edge on the page), so it
          needs an opaque backing here or the delete pane shows through it mid-drag. */}
      <View className="rounded-card bg-bg dark:bg-bg-dark">{card}</View>
    </ReanimatedSwipeable>
  );
});

function DraftCard({ task, goals, readOnly, busy, onBeginEdit, onCommit }: DraftRowProps) {
  const goalTitle = goalTitleOf(goals, task.goal_id);
  return (
    <Card draft className="gap-3 flex-row items-center">
      <Pressable
        className="flex-1"
        onPress={() => onBeginEdit(task)}
        disabled={readOnly || busy}
        accessibilityRole="button"
        accessibilityLabel={`Draft: ${task.title}`}
        accessibilityHint={readOnly ? undefined : 'Tap to edit. Swipe left to delete.'}>
        <Text numberOfLines={2}>{task.title}</Text>
        {goalTitle ? (
          <Text variant="micro" className="mt-0.5">
            {goalTitle}
          </Text>
        ) : null}
      </Pressable>

      {readOnly ? (
        <Text variant="micro">Never committed</Text>
      ) : busy ? (
        <ActivityIndicator size="small" />
      ) : (
        // The lock. One tap, one confirmation, and the draft is a task for good.
        <Pressable
          onPress={() => onCommit(task)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Commit ${task.title}`}
          accessibilityHint="Makes this task permanent after a confirmation."
          className="border-border px-3 py-1.5 dark:border-border-dark rounded-full border active:opacity-70">
          <Text className="text-micro font-semibold text-accent dark:text-accent-dark">Commit</Text>
        </Pressable>
      )}
    </Card>
  );
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Delete this draft"
      className="ml-2 w-24 rounded-card bg-status-n dark:bg-status-n-dark items-center justify-center active:opacity-80">
      <Text className="text-base font-semibold text-white">Delete</Text>
    </Pressable>
  );
}

/**
 * Editing in place. Only the fields a draft can still change are offered, and only
 * the ones that actually changed are sent — a save that touches nothing is not a
 * save.
 */
function DraftEditor({ task, goals, weekStart, busy, onSave, onCancelEdit }: DraftRowProps) {
  const [title, setTitle] = useState(task.title);
  const [day, setDay] = useState<DateString | null>(task.planned_for);
  const [goalId, setGoalId] = useState<string | null>(task.goal_id);

  // Active goals are offered, plus this draft's own goal if it has since been paused
  // or archived. Opening the editor must never silently drop a goal.
  const pickable = useMemo(
    () => goals.filter((g) => g.state === 'active' || g.id === task.goal_id),
    [goals, task.goal_id],
  );

  const trimmed = title.trim();
  const titleOk = trimmed.length >= 3 && trimmed.length <= 200;

  const patch: DraftPatch = {};
  if (trimmed !== task.title) patch.title = trimmed;
  if (day !== task.planned_for) patch.planned_for = day;
  if (goalId !== task.goal_id) patch.goal_id = goalId;
  const dirty = Object.keys(patch).length > 0;

  function save() {
    if (!dirty || !titleOk || busy) return;
    onSave(task.id, patch);
  }

  return (
    <Card draft className="gap-3">
      <TextInput
        className={INPUT}
        value={title}
        onChangeText={setTitle}
        autoFocus
        maxLength={200}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Draft title"
      />
      <DayPicker weekStart={weekStart} value={day} onChange={setDay} />
      <GoalPicker goals={pickable} value={goalId} onChange={setGoalId} />
      <View className="gap-2 flex-row items-center">
        <Button
          label="Save"
          className="flex-1"
          onPress={save}
          loading={busy}
          disabled={!dirty || !titleOk}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancelEdit} disabled={busy} />
      </View>
    </Card>
  );
}
