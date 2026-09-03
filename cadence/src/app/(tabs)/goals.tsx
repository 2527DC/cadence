// Goals. P03.
//
// There is no delete button on this screen and there never will be. Archiving is the
// operation — see the note on useSetGoalState, and the cadence-domain skill.

import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Loading, Text } from '@/components/ui';
import {
  useCreateGoal,
  useGoals,
  useSetGoalState,
  type Goal,
  type GoalState,
} from '@/api/goals';

const INPUT =
  'min-h-[46px] rounded-card border border-border bg-surface px-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

const FILTERS: { key: GoalState | 'all'; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

export default function GoalsScreen() {
  const [filter, setFilter] = useState<GoalState | 'all'>('active');
  const [composing, setComposing] = useState(false);

  const goals = useGoals(filter);
  const setState = useSetGoalState();

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-gutter pb-24 pt-2"
        refreshControl={
          <RefreshControl refreshing={goals.isRefetching} onRefresh={() => void goals.refetch()} />
        }
      >
        <Text variant="title">Goals</Text>
        <Text variant="meta" className="mt-1">
          What the weeks are supposed to add up to.
        </Text>

        <View className="mt-5 flex-row gap-2">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`rounded-full px-3 py-1.5 ${
                  on ? 'bg-accent dark:bg-accent-dark' : 'bg-raised dark:bg-raised-dark'
                }`}
              >
                <Text
                  className={`text-meta font-semibold ${
                    on ? 'text-white' : 'text-muted dark:text-muted-dark'
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-4 gap-3">
          {goals.isPending ? (
            <Loading label="Loading goals" />
          ) : goals.error ? (
            <Card>
              <Text className="text-status-n dark:text-status-n-dark">
                {(goals.error as Error).message}
              </Text>
            </Card>
          ) : goals.data && goals.data.length > 0 ? (
            goals.data.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                busy={setState.isPending}
                onSetState={(state) => setState.mutate({ id: g.id, state })}
              />
            ))
          ) : (
            <EmptyState
              title={filter === 'active' ? 'No goals yet' : `Nothing ${filter}`}
              body={
                filter === 'active'
                  ? 'A goal is the thing a week of tasks is meant to serve. Two or three is plenty.'
                  : 'Goals you pause or archive show up here. Nothing is ever deleted.'
              }
              action={
                filter === 'active' ? (
                  <Button label="Add a goal" onPress={() => setComposing(true)} />
                ) : undefined
              }
            />
          )}
        </View>

        {goals.data && goals.data.length > 0 ? (
          <Button
            label="Add a goal"
            variant="secondary"
            className="mt-4"
            onPress={() => setComposing(true)}
          />
        ) : null}
      </ScrollView>

      <NewGoalSheet visible={composing} onClose={() => setComposing(false)} />
    </SafeAreaView>
  );
}

function GoalCard({
  goal,
  busy,
  onSetState,
}: {
  goal: Goal;
  busy: boolean;
  onSetState: (state: GoalState) => void;
}) {
  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View
          className="mt-1 h-3 w-3 rounded-full"
          style={{ backgroundColor: goal.color ?? '#4F46E5' }}
        />
        <View className="flex-1">
          <Text variant="heading">{goal.title}</Text>
          {goal.description ? (
            <Text variant="meta" className="mt-1">
              {goal.description}
            </Text>
          ) : null}
          <Text variant="micro" className="mt-2">
            {goal.target_per_week}× a week
            {goal.category ? ` · ${goal.category}` : ''}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2 border-t border-border pt-3 dark:border-border-dark">
        {goal.state !== 'active' ? (
          <Button
            label="Reactivate"
            variant="ghost"
            disabled={busy}
            onPress={() => onSetState('active')}
          />
        ) : (
          <Button label="Pause" variant="ghost" disabled={busy} onPress={() => onSetState('paused')} />
        )}
        {goal.state !== 'archived' ? (
          <Button
            label="Archive"
            variant="ghost"
            disabled={busy}
            onPress={() => onSetState('archived')}
          />
        ) : null}
      </View>
    </Card>
  );
}

function NewGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const create = useCreateGoal();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('3');
  const [error, setError] = useState<string | null>(null);

  // Matches the check constraint on goals.title. Told here rather than after a
  // round trip, but the database is still the authority.
  const titleOk = title.trim().length >= 3 && title.trim().length <= 120;
  const targetNum = Number(target);
  const targetOk = Number.isInteger(targetNum) && targetNum >= 1 && targetNum <= 50;

  function reset() {
    setTitle('');
    setDescription('');
    setTarget('3');
    setError(null);
  }

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        title,
        description,
        target_per_week: targetNum,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that goal.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark">
        <ScrollView contentContainerClassName="px-gutter py-6" keyboardShouldPersistTaps="handled">
          <Text variant="title">New goal</Text>
          <Text variant="meta" className="mt-1">
            It starts counting from this Monday.
          </Text>

          <View className="mt-6 gap-4">
            <View className="gap-1.5">
              <Text variant="micro" className="uppercase tracking-wider">
                Title
              </Text>
              <TextInput
                className={INPUT}
                value={title}
                onChangeText={setTitle}
                placeholder="Move every day"
                maxLength={120}
                autoFocus
              />
            </View>

            <View className="gap-1.5">
              <Text variant="micro" className="uppercase tracking-wider">
                Why it matters (optional)
              </Text>
              <TextInput
                className={`${INPUT} min-h-[88px] py-3`}
                value={description}
                onChangeText={setDescription}
                placeholder="Running or strength, six days a week."
                multiline
                textAlignVertical="top"
              />
            </View>

            <View className="gap-1.5">
              <Text variant="micro" className="uppercase tracking-wider">
                Target per week
              </Text>
              <TextInput
                className={`${INPUT} w-24`}
                value={target}
                onChangeText={(t) => setTarget(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                inputMode="numeric"
              />
              <Text variant="micro">How many tasks a week this goal should get. 1–50.</Text>
            </View>
          </View>

          {error ? (
            <Text className="mt-4 text-meta text-status-n dark:text-status-n-dark">{error}</Text>
          ) : null}

          <View className="mt-8 gap-2">
            <Button
              label="Create goal"
              onPress={submit}
              loading={create.isPending}
              disabled={!titleOk || !targetOk}
            />
            <Button
              label="Cancel"
              variant="ghost"
              disabled={create.isPending}
              onPress={() => {
                reset();
                onClose();
              }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
