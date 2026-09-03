// Chat. Placeholder until P08.
//
// The thread model, messages and full-text search already exist in the database
// (migration 0008), and voice notes land in P06. This screen is deliberately empty
// rather than half-built: a chat log with no way to record anything is worse than
// an honest note saying it is not here yet.

import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';

export default function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark" edges={['top']}>
      <ScrollView contentContainerClassName="px-gutter pb-24 pt-2">
        <Text variant="title">Chat</Text>
        <Text variant="meta" className="mt-1">
          A running log of what you were thinking at the time.
        </Text>

        <Card className="mt-6">
          <Text variant="micro" className="uppercase tracking-wider">
            Coming in P06 – P08
          </Text>
          <Text variant="meta" className="mt-2">
            The tables behind this are already built and tested — threads, messages and
            full-text search over both typed and spoken notes. What is missing is recording
            and playback, which is P06.
          </Text>
          <View className="mt-3 border-t border-border pt-3 dark:border-border-dark">
            <Text variant="micro">
              Transcripts need on-device speech recognition, which Expo Go cannot load. That
              is P07, and it stays blocked until the app has a native build (P13). Voice notes
              will still record, store and play back without it.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
