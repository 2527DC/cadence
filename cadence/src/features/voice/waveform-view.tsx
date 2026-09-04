// The waveform, drawn with plain Views. P06.
//
// No Skia — @shopify/react-native-skia is on the P00 ❌ list because Expo Go does
// not ship it, and importing it red-screens the app at load. Sixty Views in a flex
// row are cheap, they take NativeWind classes like everything else, and they scale
// to any bubble width for free.
//
// The same component draws three things: the stored waveform in a player (with the
// played portion filled), the live meter while recording (a sliding window of the
// newest samples), and — with `onSeek` — a scrubber.

import { useCallback, useMemo, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

/** Bars never vanish entirely: a silent stretch still reads as "recording, quiet". */
const MIN_BAR_FRACTION = 0.08;

export function WaveformView({
  levels,
  progress = 0,
  height = 32,
  onSeek,
  accessibilityLabel,
  className = '',
}: {
  /** 0..100 per bar. Any length; usually WAVEFORM_POINTS. */
  levels: readonly number[];
  /** 0..1 of the way through. Bars before it are filled with the accent. */
  progress?: number;
  height?: number;
  /** Given, the waveform becomes a scrubber: tap or drag to seek. Receives 0..1. */
  onSeek?: (fraction: number) => void;
  accessibilityLabel?: string;
  className?: string;
}) {
  // Width is state, not a ref, and that is the whole reason this component has no refs
  // left. React 19's react-hooks/refs rule rejects a ref captured by any function built
  // during render — and PanResponder.create is exactly that — so the usual
  // "latest value in a ref" trick is not available. useEffectEvent is not either: its
  // result cannot be passed into another function. Width changes on layout and
  // essentially never after, so holding it in state costs one extra render and makes
  // the problem disappear rather than get suppressed.
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  // A PanResponder rather than a Pressable so that a drag scrubs continuously.
  //
  // Rebuilt when onSeek or width changes. Neither changes during a drag — a gesture
  // does not resize its own container — so it is stable for as long as that matters,
  // and it closes over plain values instead of anything mutable.
  //
  // It claims the gesture unconditionally: panHandlers are only spread onto the View
  // when onSeek exists, so a guard here could never be false when these ran.
  const pan = useMemo(() => {
    const seek = (x: number) => {
      if (!onSeek || width <= 0) return;
      onSeek(Math.min(1, Math.max(0, x / width)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => seek(e.nativeEvent.locationX),
      onPanResponderMove: (e) => seek(e.nativeEvent.locationX),
      onPanResponderRelease: (e) => seek(e.nativeEvent.locationX),
    });
  }, [onSeek, width]);

  const playedCount = Math.round(Math.min(1, Math.max(0, progress)) * levels.length);

  return (
    <View
      onLayout={onLayout}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onSeek ? 'adjustable' : undefined}
      className={`flex-row items-center ${className}`}
      style={{ height }}
      {...(onSeek ? pan.panHandlers : null)}>
      {levels.map((level, i) => {
        const fraction = Math.max(MIN_BAR_FRACTION, Math.min(1, level / 100));
        const played = i < playedCount;
        return (
          <View
            // Index keys are right here: bars are positional and never reorder.
            key={i}
            className={`mx-px flex-1 rounded-full ${
              played ? 'bg-accent dark:bg-accent-dark' : 'bg-faint dark:bg-faint-dark'
            }`}
            style={{ height: Math.max(2, fraction * height) }}
          />
        );
      })}
    </View>
  );
}
