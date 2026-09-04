// The guardrail banners. doc/05 §4 and §6.
//
// These are the part of the dashboard that argues with you. Each one is rendered with
// the same three lines — what happened, exactly what was measured, and what to do —
// because a warning that cannot be checked is noise and a warning without an action
// is nagging. The text itself is composed in metrics.ts, next to the formula it is
// about, so the number in the sentence and the number in the test are the same one.

import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import type { Guardrail } from '@/features/analytics/metrics';

export function GuardrailBanners({ items }: { items: Guardrail[] }) {
  if (items.length === 0) return null;

  return (
    <View className="mt-6 gap-2">
      {items.map((g) => (
        <Banner key={g.key} guardrail={g} />
      ))}
    </View>
  );
}

function Banner({ guardrail }: { guardrail: Guardrail }) {
  // The NC banner is red because doc/05 §4.1 says so, and because it is the one
  // number that can make a bad week look good. The rest are warnings, not errors.
  const edge =
    guardrail.severity === 'red'
      ? 'border-l-4 border-l-status-n dark:border-l-status-n-dark'
      : 'border-l-4 border-l-warn dark:border-l-warn-dark';
  const tone =
    guardrail.severity === 'red'
      ? 'text-status-n dark:text-status-n-dark'
      : 'text-warn dark:text-warn-dark';

  return (
    <Card className={edge} accessibilityRole="alert">
      <Text className={`font-semibold ${tone}`}>{guardrail.title}</Text>
      <Text variant="meta" className="mt-2">
        <Text variant="meta" className="font-semibold">
          Measuring:{' '}
        </Text>
        {guardrail.measuring}
      </Text>
      <Text variant="meta" className="mt-1.5">
        <Text variant="meta" className="font-semibold">
          Do:{' '}
        </Text>
        {guardrail.action}
      </Text>
    </Card>
  );
}
