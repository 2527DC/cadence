import { Text, View } from 'react-native';

import { Screen } from '@/components/screen';

/**
 * P00 placeholder for the Weekly Planner (F2).
 *
 * The status swatches below are not decoration — they render the four domain colours from
 * tailwind.config.js on the real device, which is the fastest way to find out whether the
 * palette survives an actual iPhone screen before P04 depends on it.
 */

const STATUSES = [
  { code: 'OPEN', label: 'Open', meaning: 'Committed, not yet resolved', cls: 'bg-status-open' },
  { code: 'C', label: 'Completed', meaning: 'You did it', cls: 'bg-status-c' },
  { code: 'N', label: 'Not completed', meaning: 'You did not do it', cls: 'bg-status-n' },
  { code: 'NC', label: 'Not counted', meaning: 'Excluded from the rate', cls: 'bg-status-nc' },
] as const;

export default function WeekScreen() {
  return (
    <Screen title="Week" subtitle="Mon 1 Sep – Sun 7 Sep · nothing planned yet">
      <View className="rounded-card border border-border bg-surface p-card dark:border-border-dark dark:bg-surface-dark">
        <Text className="text-micro font-semibold uppercase tracking-wider text-faint dark:text-faint-dark">
          P00 · pipeline check
        </Text>
        <Text className="mt-2 text-meta text-muted dark:text-muted-dark">
          If this box has a border, a white card on a grey page, and four coloured dots below,
          NativeWind is wired correctly.
        </Text>

        <View className="mt-4 gap-3">
          {STATUSES.map((s) => (
            <View key={s.code} className="flex-row items-center gap-3">
              <View className={`h-6 w-6 rounded-full ${s.cls}`} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink dark:text-ink-dark">
                  {s.code} · {s.label}
                </Text>
                <Text className="text-micro text-muted dark:text-muted-dark">{s.meaning}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-4 rounded-card border-draft border-dashed border-border bg-transparent p-card dark:border-border-dark">
        <Text className="text-meta text-muted dark:text-muted-dark">
          A dashed border means <Text className="font-semibold">draft</Text> — editable, deletable,
          not yet real. A solid border means finalized and permanent. That difference carries rule
          R1, so it is a design token, not an ad-hoc style.
        </Text>
      </View>
    </Screen>
  );
}
