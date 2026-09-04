// Charts as plain Views.
//
// No chart library, on purpose. Expo Go ships a fixed set of native modules and Skia
// is not one of them (AGENTS.md), and nothing on this screen needs more than a bar. A
// bar is a View with a flex or a width — which also keeps the numbers honest: there is
// no smoothing, no interpolation, and nothing drawn that is not a number from the views.
//
// Colours come from the status tokens in tailwind.config.js, so a C is the same green
// here as on the week screen, and NC stays deliberately dull.

import { View } from 'react-native';

import { StatusDot, Text } from '@/components/ui';
import { formatRate, type WeekSlot } from '@/features/analytics/metrics';

// ---------------------------------------------------------------------------
// This week: one bar, four segments
// ---------------------------------------------------------------------------

/**
 * doc/05 §2.1: green C / red N / grey NC / outlined OPEN, each as wide as its count.
 * OPEN is hollow because it is not a result yet, and the bar should read as "this much
 * is decided, this much is not" rather than as four results.
 */
export function SegmentedBar({
  completed,
  missed,
  notCounted,
  open,
}: {
  completed: number;
  missed: number;
  notCounted: number;
  open: number;
}) {
  const total = completed + missed + notCounted + open;
  const label = `${completed} completed, ${missed} not completed, ${notCounted} not counted, ${open} open`;

  if (total === 0) {
    return (
      <View
        accessibilityLabel="No finalized tasks this week"
        className="h-3 bg-raised dark:bg-raised-dark rounded-full"
      />
    );
  }

  return (
    <View accessibilityLabel={label} className="h-3 gap-0.5 flex-row overflow-hidden rounded-full">
      {completed > 0 ? (
        <View
          style={{ flex: completed }}
          className="bg-status-c dark:bg-status-c-dark rounded-full"
        />
      ) : null}
      {missed > 0 ? (
        <View style={{ flex: missed }} className="bg-status-n dark:bg-status-n-dark rounded-full" />
      ) : null}
      {notCounted > 0 ? (
        <View
          style={{ flex: notCounted }}
          className="bg-status-nc dark:bg-status-nc-dark rounded-full"
        />
      ) : null}
      {open > 0 ? (
        <View
          style={{ flex: open }}
          className="border-status-open dark:border-status-open-dark rounded-full border bg-transparent"
        />
      ) : null}
    </View>
  );
}

export function StatusLegend() {
  return (
    <View className="gap-x-3 gap-y-1 flex-row flex-wrap">
      {(['C', 'N', 'NC', 'OPEN'] as const).map((s) => (
        <View key={s} className="gap-1 flex-row items-center">
          <StatusDot status={s} className="h-2 w-2" />
          <Text variant="micro">{s === 'OPEN' ? 'Open' : s}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Weeks: one bar per calendar week
// ---------------------------------------------------------------------------

const MIN_BAR = 4;

/**
 * doc/05 §3.2's 12-week sparkline, one bar per calendar week — including the weeks the
 * view has no row for. A missing week is drawn as a hollow dashed slot, not left out,
 * because leaving it out would make a month of not planning look like a month of
 * keeping. A week of only NC is a flat grey dash: no result either way.
 */
export function WeekBars({ slots, height = 44 }: { slots: WeekSlot[]; height?: number }) {
  return (
    <View
      accessibilityLabel={slots.map((s) => `${s.weekStart}: ${describeSlot(s)}`).join('; ')}
      className="gap-1 flex-row items-end"
      style={{ height }}>
      {slots.map((s) => (
        <WeekBar key={s.weekStart} slot={s} height={height} />
      ))}
    </View>
  );
}

function describeSlot(s: WeekSlot): string {
  switch (s.kind) {
    case 'before_history':
      return 'before history';
    case 'missing':
      return 'nothing committed';
    case 'neutral':
      return 'only not-counted tasks';
    case 'in_progress':
      return `in progress, ${formatRate(s.rate)}`;
    case 'kept':
      return `kept, ${formatRate(s.rate)}`;
    case 'not_kept':
      return `not kept, ${formatRate(s.rate)}`;
  }
}

function WeekBar({ slot, height }: { slot: WeekSlot; height: number }) {
  const filled = Math.max(MIN_BAR, Math.round((slot.rate ?? 0) * height));

  switch (slot.kind) {
    case 'before_history':
      return <View className="flex-1" />;
    case 'missing':
      return (
        <View
          className="rounded-sm border-status-n dark:border-status-n-dark flex-1 border border-dashed opacity-70"
          style={{ height }}
        />
      );
    case 'neutral':
      return (
        <View
          className="rounded-sm bg-status-nc dark:bg-status-nc-dark flex-1"
          style={{ height: MIN_BAR }}
        />
      );
    case 'in_progress':
      return (
        <View
          className="rounded-sm bg-status-open dark:bg-status-open-dark flex-1 opacity-60"
          style={{ height: slot.rate === null ? MIN_BAR : filled }}
        />
      );
    case 'kept':
      return (
        <View
          className="rounded-sm bg-status-c dark:bg-status-c-dark flex-1"
          style={{ height: filled }}
        />
      );
    case 'not_kept':
      return (
        <View
          className="rounded-sm bg-status-n dark:bg-status-n-dark flex-1"
          style={{ height: filled }}
        />
      );
  }
}

/**
 * doc/05 §4.1's 12-week NC trend, under the completion bars and on the same weeks. A
 * rising grey row beneath a steady green one is the signature of quietly redefining
 * failure as bad luck, and it only shows if the two are drawn together.
 */
export function NcBars({ slots, height = 16 }: { slots: WeekSlot[]; height?: number }) {
  return (
    <View
      accessibilityLabel={slots
        .filter((s) => s.row)
        .map((s) => `${s.weekStart}: ${formatRate(s.ncRate)} not counted`)
        .join('; ')}
      className="gap-1 flex-row items-end"
      style={{ height }}>
      {slots.map((s) =>
        s.row ? (
          <View
            key={s.weekStart}
            className="rounded-sm bg-status-nc dark:bg-status-nc-dark flex-1"
            style={{ height: s.ncRate === 0 ? 1 : Math.max(2, Math.round(s.ncRate * height)) }}
          />
        ) : (
          <View key={s.weekStart} className="flex-1" />
        ),
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Goals: a track and a fill
// ---------------------------------------------------------------------------

/** `fraction` is clamped to 0–1: attainment is capped at 1 by the view for a reason. */
export function ProgressBar({ fraction, color }: { fraction: number; color?: string | null }) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const width = `${Math.round(clamped * 100)}%` as const;
  return (
    <View className="h-2 bg-raised dark:bg-raised-dark overflow-hidden rounded-full">
      <View
        className={
          color ? 'h-full rounded-full' : 'bg-accent dark:bg-accent-dark h-full rounded-full'
        }
        style={color ? { width, backgroundColor: color } : { width }}
      />
    </View>
  );
}
