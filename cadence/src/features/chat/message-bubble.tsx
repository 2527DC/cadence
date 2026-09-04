// One message in the log, and the day separator above the first of each day. P08.
//
// Everything sits on the right, the way a chat with yourself does. There is no
// long-press menu: a message cannot be edited, deleted, forwarded or reacted to.
// It is what you thought at the time, with the time on it, and the only affordance
// is the chip that takes you to the task or goal it was about.

import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { useLinkedTask, type Message } from '@/api/chat';
import { StatusDot, Text } from '@/components/ui';
import { VoiceNotePlayer } from '@/features/voice';
import { hapticSelect } from '@/lib/haptics';

import { clockOf } from './model';

export function DaySeparator({ label }: { label: string }) {
  return (
    <View className="mb-2 mt-4 items-center">
      <View className="bg-raised px-3 py-1 dark:bg-raised-dark rounded-full">
        <Text variant="micro" className="font-semibold tracking-wider uppercase">
          {label}
        </Text>
      </View>
    </View>
  );
}

const CHIP =
  'mb-2 flex-row items-center gap-1.5 self-start rounded-full bg-raised px-2.5 py-1 dark:bg-raised-dark active:opacity-70';

/** "Task · title", tapping through to the task's history. */
function TaskChip({ taskId }: { taskId: string }) {
  const router = useRouter();
  const task = useLinkedTask(taskId);

  const title = task.data?.title ?? (task.isError ? 'A task that could not be loaded' : '…');

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Linked task: ${title}`}
      disabled={!task.data}
      hitSlop={6}
      onPress={() => {
        if (!task.data) return;
        hapticSelect();
        router.push({
          pathname: '/task/[id]',
          params: { id: task.data.id, week: task.data.week_start },
        });
      }}
      className={CHIP}>
      {task.data ? <StatusDot status={task.data.status} className="h-2 w-2" /> : null}
      <Text variant="micro" className="font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="micro">›</Text>
    </Pressable>
  );
}

/** "Goal · title", tapping across to that goal's thread. */
function GoalChip({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Linked goal: ${title}`}
      disabled={!onPress}
      hitSlop={6}
      onPress={() => {
        hapticSelect();
        onPress?.();
      }}
      className={CHIP}>
      <View className="h-2 w-2 bg-accent dark:bg-accent-dark rounded-full" />
      <Text variant="micro" className="font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {title}
      </Text>
      {onPress ? <Text variant="micro">›</Text> : null}
    </Pressable>
  );
}

export type MessageBubbleProps = {
  message: Message;
  /** Queued or in flight — the row is not on the server yet. */
  pending: boolean;
  /** The day separator to draw above this bubble, if it is the first of its day. */
  dayLabel: string | null;
  /** Resolved by the screen from the goals list, so each bubble does not look it up. */
  linkedGoalTitle: string | null;
  onOpenGoal?: (goalId: string) => void;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  pending,
  dayLabel,
  linkedGoalTitle,
  onOpenGoal,
}: MessageBubbleProps) {
  const voiceNoteId = message.kind === 'voice' ? message.voice_note_id : null;

  return (
    <View>
      {dayLabel ? <DaySeparator label={dayLabel} /> : null}
      <View className="mb-1.5 px-gutter items-end">
        <View
          accessible
          accessibilityLabel={
            voiceNoteId
              ? `Voice note, ${clockOf(message.created_at)}`
              : `${message.body ?? ''}, ${clockOf(message.created_at)}`
          }
          className={`rounded-2xl rounded-br-md border-border bg-surface px-3.5 py-2.5 dark:border-border-dark dark:bg-surface-dark border ${
            voiceNoteId ? 'w-[88%]' : 'max-w-[88%]'
          } ${pending ? 'opacity-70' : ''}`}>
          {message.linked_task_id ? <TaskChip taskId={message.linked_task_id} /> : null}
          {message.linked_goal_id ? (
            <GoalChip
              title={linkedGoalTitle ?? 'Goal'}
              onPress={onOpenGoal ? () => onOpenGoal(message.linked_goal_id ?? '') : undefined}
            />
          ) : null}

          {voiceNoteId ? (
            <VoiceNotePlayer voiceNoteId={voiceNoteId} />
          ) : (
            <Text selectable>{message.body}</Text>
          )}

          <View className="mt-1 gap-1 flex-row items-center justify-end">
            <Text variant="micro">{clockOf(message.created_at)}</Text>
            {pending ? <Text variant="micro">· sending</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
});
