// One task, and everything that ever happened to it. P05.
//
// This screen is the payoff for the whole design. Every close is a row in
// task_status_events, that table has no UPDATE policy and no DELETE policy, and so the
// timeline below cannot be edited, tidied, or made more flattering afterwards. A
// correction appends; it does not overwrite.
//
// There is deliberately no edit or delete affordance anywhere on this screen.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Loading, STATUS_META, StatusPill, Text } from '@/components/ui';
import { useTaskHistory, useWeekTasks, type StatusEvent, type Task } from '@/api/tasks';
import { CloseTaskSheet } from '@/features/tasks/close-task-sheet';
import { VoiceNotePlayer } from '@/features/voice';
import { formatWeekRange, weekStartOf } from '@/lib/week';

export default function TaskDetailScreen() {
  const { id, week } = useLocalSearchParams<{ id: string; week?: string }>();
  const router = useRouter();
  const [closing, setClosing] = useState<Task | null>(null);

  // The week's tasks are almost always in cache already, so opening this screen from
  // the planner costs no round trip.
  const weekStart = week ?? weekStartOf(new Date());
  const tasks = useWeekTasks(weekStart);
  const history = useTaskHistory(id);

  const task = tasks.data?.find((t) => t.id === id);

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1" edges={['top']}>
      <ScrollView contentContainerClassName="px-gutter pb-16 pt-2">
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text variant="meta" className="text-accent dark:text-accent-dark">
            ‹ Back
          </Text>
        </Pressable>

        {tasks.isPending ? (
          <Loading />
        ) : !task ? (
          <Card className="mt-6">
            <Text>That task is not in this week.</Text>
          </Card>
        ) : (
          <>
            <View className="mt-4 gap-3 flex-row items-start justify-between">
              <Text variant="title" className="flex-1">
                {task.title}
              </Text>
              <View className="mt-2">
                <StatusPill status={task.status} />
              </View>
            </View>

            <Text variant="meta" className="mt-2">
              {formatWeekRange(task.week_start)}
              {task.late_add ? ' · late add' : ''}
              {task.is_finalized ? ' · committed' : ' · still a draft'}
            </Text>

            {task.detail ? (
              <Card className="mt-4">
                <Text variant="meta">{task.detail}</Text>
              </Card>
            ) : null}

            {task.is_finalized ? (
              <Button
                label={task.status === 'OPEN' ? 'Close this task' : 'Correct the status'}
                className="mt-5"
                onPress={() => setClosing(task)}
              />
            ) : (
              <Card className="mt-5" draft>
                <Text variant="meta">
                  Still a draft, so it can be edited or removed from the week screen. Commit it
                  first and it becomes permanent.
                </Text>
              </Card>
            )}

            {/* The ledger ------------------------------------------------- */}
            <Text variant="micro" className="mt-8 tracking-wider uppercase">
              History
            </Text>

            {history.isPending ? (
              <Loading />
            ) : (history.data?.length ?? 0) === 0 ? (
              <Card className="mt-2">
                <Text variant="meta">
                  Nothing yet. The first time you close this, what you write is kept here for good.
                </Text>
              </Card>
            ) : (
              <View className="mt-2 gap-2">
                {history.data?.map((e, i) => (
                  <HistoryEntry key={e.id} event={e} isCorrection={i > 0} />
                ))}
              </View>
            )}

            <Text variant="micro" className="mt-6 text-center">
              Nothing on this screen can be edited or deleted. That is the point of it.
            </Text>
          </>
        )}
      </ScrollView>

      <CloseTaskSheet task={closing} onClose={() => setClosing(null)} />
    </SafeAreaView>
  );
}

function HistoryEntry({ event, isCorrection }: { event: StatusEvent; isCorrection: boolean }) {
  const to = STATUS_META[event.to_status];
  const when = new Date(event.created_at);

  return (
    <Card>
      <View className="gap-2 flex-row items-center">
        <View className={`h-3 w-3 rounded-full ${to.dot}`} />
        <Text className="font-semibold">
          {event.from_status} → {event.to_status}
        </Text>
        {isCorrection ? (
          <View className="bg-raised px-2 py-0.5 dark:bg-raised-dark rounded-full">
            <Text variant="micro">correction</Text>
          </View>
        ) : null}
      </View>

      <Text variant="micro" className="mt-1">
        {when.toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })}
        {event.nc_reason ? ` · ${event.nc_reason.replace(/_/g, ' ')}` : ''}
      </Text>

      {event.note ? <Text className="mt-2">{event.note}</Text> : null}

      {/* A spoken note plays back here. The recording is as permanent as the row
          that points at it — the voice module has no delete for that reason. */}
      {event.voice_note_id ? (
        <View className="mt-2">
          <VoiceNotePlayer voiceNoteId={event.voice_note_id} />
        </View>
      ) : null}
    </Card>
  );
}
