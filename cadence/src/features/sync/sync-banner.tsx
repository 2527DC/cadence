// The sync status line. P10.
//
// doc/04-architecture.md §7: "Everything still works. Writes queue. A single
// unobtrusive offline banner." One line, at the top, under the status bar, and gone
// the moment there is nothing to say. It is rendered in flow above the navigator
// rather than floated over it, so it never covers a screen title.
//
// It says one of three things — offline, N changes waiting, syncing — plus any
// rejection that came back for a write whose screen is no longer open to show it.

import { useMutationState } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { summarizePending, syncNotice } from '@/lib/outbox';

import { dismissSyncProblems, useSyncProblems } from './sync-problems';
import { useOnline } from './use-online';

const TONE = {
  // Warn, not error: being offline is a fact about the train, not a fault.
  offline: 'bg-warn dark:bg-warn-dark',
  syncing: 'bg-accent dark:bg-accent-dark',
  problem: 'bg-status-n dark:bg-status-n-dark',
} as const;

function Line({
  tone,
  text,
  onDismiss,
}: {
  tone: keyof typeof TONE;
  text: string;
  onDismiss?: () => void;
}) {
  return (
    <View className="gap-2 px-gutter py-2 flex-row items-center">
      <View className={`h-2 w-2 rounded-full ${TONE[tone]}`} />
      <Text variant="meta" className="flex-1" numberOfLines={2}>
        {text}
      </Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" hitSlop={8}>
          <Text variant="meta" className="font-semibold text-ink dark:text-ink-dark">
            Dismiss
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SyncBanner() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const pending = useMutationState({
    filters: { status: 'pending' },
    select: (m) => ({ isPaused: m.state.isPaused }),
  });
  const problems = useSyncProblems();

  const notice = syncNotice({ online, ...summarizePending(pending) });
  if (!notice && problems.length === 0) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ paddingTop: insets.top }}
      className="border-border bg-raised dark:border-border-dark dark:bg-raised-dark border-b">
      {notice ? <Line tone={notice.tone} text={notice.text} /> : null}
      {problems.map((p) => (
        <Line
          key={p.at}
          tone="problem"
          text={`Could not save: ${p.message}`}
          onDismiss={dismissSyncProblems}
        />
      ))}
    </View>
  );
}
