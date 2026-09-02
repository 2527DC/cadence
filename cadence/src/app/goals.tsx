import { Text } from 'react-native';

import { Screen } from '@/components/screen';

/** P00 placeholder for goals (F1). Built in P03. */
export default function GoalsScreen() {
  return (
    <Screen title="Goals" subtitle="Active, paused, archived">
      <Text className="text-meta text-muted dark:text-muted-dark">
        Built in P03. Goals archive, they never delete — archived goals still appear in
        historical analytics.
      </Text>
    </Screen>
  );
}
