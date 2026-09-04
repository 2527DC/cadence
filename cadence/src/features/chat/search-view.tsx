// Searching the log. P08.
//
// Postgres does the work: `body_tsv` is a generated tsvector with a GIN index
// (0008), and the query is sent in websearch syntax so "-well" and quoted phrases
// behave the way they do in a search engine. What it cannot do yet is hear: a voice
// message has no transcript until P07, and P07 is blocked behind a native build.
// That is said once, under the field, rather than pretending the results are whole.

import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';

import { useSearchMessages, useThreads, type Message, type Thread } from '@/api/chat';
import { Card, Loading, Text } from '@/components/ui';
import { Chip } from '@/features/planner/chips';
import { hapticSelect } from '@/lib/haptics';
import { todayInAppTimezone, toDateString } from '@/lib/week';

import { clockOf, dayKeyOf, dayLabel, isSearchable, normalizeSearch, previewOf } from './model';

function ResultRow({
  message,
  threadTitle,
  today,
  onPress,
}: {
  message: Message;
  threadTitle: string;
  today: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the thread this was written in"
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      className="active:opacity-70">
      <Card className="mb-2">
        <View className="gap-2 flex-row items-center justify-between">
          <Text variant="micro" className="font-semibold tracking-wider uppercase">
            {threadTitle}
          </Text>
          <Text variant="micro">
            {dayLabel(dayKeyOf(message.created_at), today)} · {clockOf(message.created_at)}
          </Text>
        </View>
        <Text className="mt-1.5" numberOfLines={4}>
          {previewOf(message, 400)}
        </Text>
      </Card>
    </Pressable>
  );
}

export function SearchView({
  currentThread,
  onOpenThread,
  onClose,
}: {
  /** The thread the tab was showing, offered as a scope. */
  currentThread: Thread | null;
  onOpenThread: (thread: Thread) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [scoped, setScoped] = useState(false);

  const threadId = scoped && currentThread ? currentThread.id : null;
  // Only a searchable query reaches the hook; below that the field is just a field.
  const results = useSearchMessages(isSearchable(query) ? normalizeSearch(query) : '', threadId);
  const threads = useThreads();

  const today = toDateString(todayInAppTimezone());
  const titleOf = (id: string) => threads.data?.find((t) => t.id === id)?.title ?? 'Thread';

  return (
    <View className="flex-1">
      <View className="px-gutter pt-2">
        <View className="gap-2 flex-row items-center">
          <TextInput
            className="border-border bg-surface px-4 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark min-h-[44px] flex-1 rounded-[22px] border"
            value={query}
            onChangeText={setQuery}
            placeholder="Search what you wrote"
            placeholderTextColor="#98A2B3"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search the log"
          />
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text variant="meta" className="font-semibold text-accent dark:text-accent-dark">
              Cancel
            </Text>
          </Pressable>
        </View>

        <View className="mt-2 gap-2 flex-row">
          <Chip label="All threads" on={!scoped} onPress={() => setScoped(false)} />
          {currentThread ? (
            <Chip label={currentThread.title} on={scoped} onPress={() => setScoped(true)} />
          ) : null}
        </View>

        <Text variant="micro" className="mt-2">
          Typed messages only. Voice notes have no transcript yet — that needs on-device speech
          recognition, which Expo Go cannot load (P07).
        </Text>
      </View>

      <FlatList
        data={results.data ?? []}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-gutter pb-24 pt-3"
        renderItem={({ item }) => (
          <ResultRow
            message={item}
            threadTitle={titleOf(item.thread_id)}
            today={today}
            onPress={() => {
              const thread = threads.data?.find((t) => t.id === item.thread_id);
              if (thread) onOpenThread(thread);
            }}
          />
        )}
        ListEmptyComponent={
          !isSearchable(query) ? null : results.isPending ? (
            <Loading label="Searching" />
          ) : results.error ? (
            <Card>
              <Text className="text-status-n dark:text-status-n-dark">
                {(results.error as Error).message}
              </Text>
            </Card>
          ) : (
            <Text variant="meta" className="mt-6 text-center">
              Nothing typed matches “{normalizeSearch(query)}”.
            </Text>
          )
        }
      />
    </View>
  );
}
