// Closing a task. P05, and the most important screen in the app.
//
// The rule it exists to serve (R3): you cannot close anything without saying why. Not
// as a nag — as the thing that makes the record worth keeping. A completion rate with
// no explanations behind it is a number you can lie to yourself about.
//
// The validation here mirrors close_task() exactly so the person is told before they
// hit send. It is a courtesy, not the gate. The database rejects the same things, and
// if these two ever disagree the database wins.

import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, STATUS_META, Text } from '@/components/ui';
import {
  MIN_NOTE_LENGTH,
  noteProblem,
  useCloseTask,
  type NcReason,
  type Task,
  type TaskStatus,
} from '@/api/tasks';

const INPUT =
  'min-h-[120px] rounded-card border border-border bg-surface p-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

const CLOSABLE: Exclude<TaskStatus, 'OPEN'>[] = ['C', 'N', 'NC'];

const NC_REASONS: { key: NcReason; label: string }[] = [
  { key: 'illness', label: 'Illness' },
  { key: 'blocked_by_others', label: 'Blocked by others' },
  { key: 'cancelled_externally', label: 'Cancelled externally' },
  { key: 'plan_changed', label: 'Plan changed' },
  { key: 'other', label: 'Other' },
];

export function CloseTaskSheet({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const close = useCloseTask();
  const [status, setStatus] = useState<Exclude<TaskStatus, 'OPEN'> | null>(null);
  const [note, setNote] = useState('');
  const [ncReason, setNcReason] = useState<NcReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problem = noteProblem(note, false);
  const needsReason = status === 'NC' && !ncReason;
  const canSubmit = !!status && !problem && !needsReason;

  // Re-closing an already-closed task is the honest correction path, and it is worth
  // saying so out loud — people assume a closed task is finished with.
  const isCorrection = task?.status !== 'OPEN';

  function reset() {
    setStatus(null);
    setNote('');
    setNcReason(null);
    setError(null);
  }

  async function submit() {
    if (!task || !status) return;
    setError(null);
    try {
      await close.mutateAsync({
        taskId: task.id,
        status,
        note: note.trim(),
        ncReason: status === 'NC' ? ncReason : null,
        weekStart: task.week_start,
      });
      reset();
      onClose();
    } catch (e) {
      // close_task's messages are written to be read by a person, so they are shown
      // as they come rather than replaced with something vaguer.
      setError(e instanceof Error ? e.message : 'Could not close that task.');
    }
  }

  return (
    <Modal
      visible={!!task}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerClassName="px-gutter py-6" keyboardShouldPersistTaps="handled">
            <Text variant="micro" className="uppercase tracking-wider">
              {isCorrection ? `Correcting · currently ${task?.status}` : 'Closing'}
            </Text>
            <Text variant="title" className="mt-1">
              {task?.title}
            </Text>

            {isCorrection ? (
              <Text variant="meta" className="mt-2">
                The original close stays in the record. This adds a second entry rather than
                replacing the first.
              </Text>
            ) : null}

            {/* Status ------------------------------------------------------- */}
            <Text variant="heading" className="mt-7">
              What happened?
            </Text>
            <View className="mt-3 gap-2">
              {CLOSABLE.map((s) => {
                const meta = STATUS_META[s];
                const on = status === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setStatus(s);
                      if (s !== 'NC') setNcReason(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: task?.status === s }}
                    disabled={task?.status === s}
                    className={`flex-row items-center gap-3 rounded-card border p-card ${
                      on
                        ? 'border-accent bg-raised dark:border-accent-dark dark:bg-raised-dark'
                        : 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark'
                    } ${task?.status === s ? 'opacity-40' : ''}`}
                  >
                    <View className={`h-4 w-4 rounded-full ${meta.dot}`} />
                    <View className="flex-1">
                      <Text className="font-semibold">
                        {s} · {meta.label}
                        {task?.status === s ? ' (already)' : ''}
                      </Text>
                      <Text variant="micro">{meta.meaning}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* NC reason ---------------------------------------------------- */}
            {status === 'NC' ? (
              <View className="mt-5">
                <Text variant="heading">Why was it out of your control?</Text>
                <Text variant="meta" className="mt-1">
                  NC is left out of your completion rate, so it needs a category. This is the
                  one status that can make a bad week look good.
                </Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {NC_REASONS.map((r) => {
                    const on = ncReason === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setNcReason(r.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        className={`rounded-full px-3 py-2 ${
                          on ? 'bg-accent dark:bg-accent-dark' : 'bg-raised dark:bg-raised-dark'
                        }`}
                      >
                        <Text
                          className={`text-meta font-semibold ${
                            on ? 'text-white' : 'text-muted dark:text-muted-dark'
                          }`}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Note --------------------------------------------------------- */}
            <Text variant="heading" className="mt-7">
              In your own words
            </Text>
            <Text variant="meta" className="mt-1">
              At least {MIN_NOTE_LENGTH} characters. This is what you will actually read back
              in six months.
            </Text>
            <TextInput
              className={`${INPUT} mt-3`}
              value={note}
              onChangeText={setNote}
              placeholder={
                status === 'C'
                  ? 'What made it happen?'
                  : status === 'N'
                    ? 'What got in the way? Be honest, nobody else reads this.'
                    : 'What happened that was outside your control?'
              }
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            {note.length > 0 && problem ? (
              <Text variant="micro" className="mt-1.5 text-warn dark:text-warn-dark">
                {problem}
              </Text>
            ) : null}

            {error ? (
              <Text className="mt-4 text-meta text-status-n dark:text-status-n-dark">{error}</Text>
            ) : null}

            <View className="mt-8 gap-2">
              <Button
                label={isCorrection ? 'Record the correction' : 'Close this task'}
                onPress={submit}
                loading={close.isPending}
                disabled={!canSubmit}
              />
              <Button
                label="Not yet"
                variant="ghost"
                disabled={close.isPending}
                onPress={() => {
                  reset();
                  onClose();
                }}
              />
            </View>

            <Text variant="micro" className="mt-6 text-center">
              Once closed, this cannot be deleted. It can only be closed again with the truth.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
