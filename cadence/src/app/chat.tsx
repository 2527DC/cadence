import { Text } from 'react-native';

import { Screen } from '@/components/screen';

/** P00 placeholder for the chat log (F4). Built in P08. */
export default function ChatScreen() {
  return (
    <Screen title="Chat" subtitle="Voice and text log">
      <Text className="text-meta text-muted dark:text-muted-dark">
        Built in P08. Voice recording arrives in P06; transcripts wait for P13, because
        speech-to-text needs a native module Expo Go does not ship.
      </Text>
    </Screen>
  );
}
