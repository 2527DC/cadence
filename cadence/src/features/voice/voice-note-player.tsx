// Playing a voice note back. P06.
//
// The row says where the object is; the file says what was said. This component
// gets from the id to sound with as little network as it can:
//
//   1. The local copy under documentDirectory/voice/ if it is still there — this
//      phone made the recording, so for thirty days it plays with no signal at all.
//   2. Otherwise a signed URL for the private bucket, minted for an hour and cached
//      in React Query for its lifetime (see useVoiceNoteSignedUrl).
//
// The native player is only created once a source is known (PlayerRow), so there is
// never a player pointed at nothing. One player app-wide: starting this one pauses
// whichever was playing. The registry is a module-level variable rather than context
// because it has exactly one job.
//
// No delete, no re-record, no trim. The recording is part of the record.

import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useVoiceNote, useVoiceNoteSignedUrl, type VoiceNote } from '@/api/voice-notes';
import { Text } from '@/components/ui';
import { hapticSelect } from '@/lib/haptics';

import { localFile } from './local-files';
import { formatDuration, waveformForDisplay } from './waveform';
import { WaveformView } from './waveform-view';

/** doc/06 §5: 1×, 1.5×, 2×. You will re-listen to your own notes; 1.5× is genuinely useful. */
const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

// ---------------------------------------------------------------------------
// One player at a time
// ---------------------------------------------------------------------------

let activePlayer: AudioPlayer | null = null;

function claimPlayback(player: AudioPlayer) {
  if (activePlayer && activePlayer !== player) {
    try {
      activePlayer.pause();
    } catch {
      // Already released. Nothing to pause.
    }
  }
  activePlayer = player;
}

function releasePlayback(player: AudioPlayer) {
  if (activePlayer === player) activePlayer = null;
}

// ---------------------------------------------------------------------------
// Resolving the source
// ---------------------------------------------------------------------------

export function VoiceNotePlayer({ voiceNoteId }: { voiceNoteId: string }) {
  const note = useVoiceNote(voiceNoteId);

  // undefined = not checked yet, null = not on this device.
  const [local, setLocal] = useState<string | null | undefined>(undefined);

  // The reset back to "not checked yet" happens during render rather than in the
  // effect below. It is a state adjustment — one id in, one answer out — and doing it
  // in the effect meant one painted frame still showing the previous note's source
  // before the lookup restarted, which is exactly what react-hooks/set-state-in-effect
  // objects to. React re-runs this component before anything reaches the screen.
  const [lookedUp, setLookedUp] = useState(voiceNoteId);
  if (lookedUp !== voiceNoteId) {
    setLookedUp(voiceNoteId);
    setLocal(undefined);
  }

  useEffect(() => {
    let cancelled = false;
    void localFile(voiceNoteId).then((f) => {
      if (!cancelled) setLocal(f?.uri ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [voiceNoteId]);

  // The signed URL is only minted when the local copy is known to be gone.
  const signed = useVoiceNoteSignedUrl(local === null ? note.data?.storage_path : null);
  const sourceUri = local ?? signed.data ?? null;

  if (note.error) {
    return (
      <Frame>
        <Text variant="meta" className="text-status-n dark:text-status-n-dark">
          Couldn’t load this voice note. {(note.error as Error).message}
        </Text>
      </Frame>
    );
  }

  if (local === null && signed.error) {
    return (
      <Frame>
        <Text variant="meta">Couldn’t reach the recording. Check the connection.</Text>
        <Pressable onPress={() => void signed.refetch()} accessibilityRole="button" hitSlop={8}>
          <Text variant="meta" className="mt-1 text-accent dark:text-accent-dark">
            Try again
          </Text>
        </Pressable>
      </Frame>
    );
  }

  if (!note.data || !sourceUri) {
    // Same layout as the loaded row, with the button busy, so nothing jumps when
    // the source arrives — usually a few milliseconds later from the cache.
    return (
      <Row
        busy
        levels={waveformForDisplay(note.data?.waveform)}
        progress={0}
        timeMs={note.data?.duration_ms ?? 0}
        rate={1}
      />
    );
  }

  return <PlayerRow key={sourceUri} note={note.data} sourceUri={sourceUri} />;
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

function PlayerRow({ note, sourceUri }: { note: VoiceNote; sourceUri: string }) {
  const player = useAudioPlayer({ uri: sourceUri }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState<Rate>(1);

  useEffect(() => {
    if (status.playing) claimPlayback(player);
  }, [status.playing, player]);

  useEffect(() => () => releasePlayback(player), [player]);

  const totalMs = status.duration > 0 ? status.duration * 1000 : note.duration_ms;
  const positionMs = status.currentTime * 1000;
  const finished = status.didJustFinish || (totalMs > 0 && positionMs >= totalMs - 50);
  const progress = finished ? 1 : totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const ready = status.isLoaded;

  async function toggle() {
    hapticSelect();
    if (status.playing) {
      player.pause();
      return;
    }
    // Playback, not recording: without this, iOS obeys the mute switch and a note
    // played in a quiet room makes no sound and no explanation.
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
    claimPlayback(player);
    if (finished) await player.seekTo(0);
    // A fresh native player starts at 1×; reapply whatever the chip says.
    player.setPlaybackRate(rate, 'high');
    player.play();
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
    setRate(next);
    hapticSelect();
    try {
      player.setPlaybackRate(next, 'high');
    } catch {
      // Not loaded yet; toggle() applies it when playback starts.
    }
  }

  function seek(fraction: number) {
    if (!ready || totalMs <= 0) return;
    void player.seekTo((fraction * totalMs) / 1000);
  }

  const shownMs = status.playing || positionMs > 0 ? (finished ? totalMs : positionMs) : totalMs;

  return (
    <Row
      busy={!ready || status.isBuffering}
      playing={status.playing}
      levels={waveformForDisplay(note.waveform)}
      progress={progress}
      timeMs={shownMs}
      rate={rate}
      onToggle={() => void toggle()}
      onSeek={ready ? seek : undefined}
      onCycleRate={cycleRate}
    />
  );
}

// ---------------------------------------------------------------------------
// The row itself — pure layout
// ---------------------------------------------------------------------------

function Frame({ children }: { children: React.ReactNode }) {
  return <View className="rounded-card bg-raised p-3 dark:bg-raised-dark">{children}</View>;
}

function Row({
  busy,
  playing = false,
  levels,
  progress,
  timeMs,
  rate,
  onToggle,
  onSeek,
  onCycleRate,
}: {
  busy: boolean;
  playing?: boolean;
  levels: number[];
  progress: number;
  timeMs: number;
  rate: Rate;
  onToggle?: () => void;
  onSeek?: (fraction: number) => void;
  onCycleRate?: () => void;
}) {
  const canPlay = !!onToggle && !busy;
  return (
    <View className="gap-3 rounded-card bg-raised p-3 dark:bg-raised-dark flex-row items-center">
      <Pressable
        onPress={onToggle}
        disabled={!canPlay}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        accessibilityState={{ disabled: !canPlay, busy }}
        className={`h-10 w-10 bg-accent dark:bg-accent-dark items-center justify-center rounded-full ${
          canPlay ? 'active:opacity-80' : 'opacity-60'
        }`}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : playing ? <PauseGlyph /> : <PlayGlyph />}
      </Pressable>

      <WaveformView
        levels={levels}
        progress={progress}
        height={32}
        onSeek={onSeek}
        accessibilityLabel={`Waveform, ${formatDuration(timeMs)}`}
        className="flex-1"
      />

      <Text variant="meta" className="w-10 text-right tabular-nums">
        {formatDuration(timeMs)}
      </Text>

      <Pressable
        onPress={onCycleRate}
        disabled={!onCycleRate}
        accessibilityRole="button"
        accessibilityLabel={`Playback speed ${rate}×`}
        hitSlop={6}
        className="bg-surface px-2 py-1 dark:bg-surface-dark min-w-[38px] items-center rounded-full">
        <Text variant="micro" className="font-semibold text-ink dark:text-ink-dark">
          {rate}×
        </Text>
      </Pressable>
    </View>
  );
}

/** A triangle from borders. Same reasoning as the mic glyph: nothing to import an icon from. */
function PlayGlyph() {
  return (
    <View
      pointerEvents="none"
      className="ml-1"
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 7,
        borderBottomWidth: 7,
        borderLeftWidth: 12,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: '#FFFFFF',
      }}
    />
  );
}

function PauseGlyph() {
  return (
    <View pointerEvents="none" className="gap-1 flex-row">
      <View className="h-3.5 w-1.5 rounded-sm bg-white" />
      <View className="h-3.5 w-1.5 rounded-sm bg-white" />
    </View>
  );
}
