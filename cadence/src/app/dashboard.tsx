import { Text } from 'react-native';

import { Screen } from '@/components/screen';

/** P00 placeholder for the analytics dashboard (F6). Built in P09. */
export default function DashboardScreen() {
  return (
    <Screen title="Dashboard" subtitle="Progress and consistency">
      <Text className="text-meta text-muted dark:text-muted-dark">
        Built in P09, on live Postgres views. A kept week is ≥70% completion with at least 3
        counted tasks; a week where you finalize nothing breaks the streak.
      </Text>
    </Screen>
  );
}
