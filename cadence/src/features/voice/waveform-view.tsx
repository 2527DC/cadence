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

import { useCallback, useRef } from 'react';
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
  const widthRef = useRef(0);
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  // A PanResponder rather than a Pressable so that a drag scrubs continuously. It
  // is created once; the current onSeek is read through a ref so a re-render does
  // not tear the gesture down mid-drag.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!seekRef.current,
      onMoveShouldSetPanResponder: () => !!seekRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => emit(e.nativeEvent.locationX),
      onPanResponderMove: (e) => emit(e.nativeEvent.locationX),
      onPanResponderRelease: (e) => emit(e.nativeEvent.locationX),
    }),
  ).current;

  function emit(x: number) {
    const w = widthRef.current;
    if (!seekRef.current || w <= 0) return;
    seekRef.current(Math.min(1, Math.max(0, x / w)));
  }

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
