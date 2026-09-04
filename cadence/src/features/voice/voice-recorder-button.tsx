// The mic button. P06.
//
// WhatsApp's gesture, copied deliberately because anyone who has used WhatsApp will
// try it without being told: hold to record, release to save, slide left past a
// threshold to throw it away. The whole thing — idle button, live meter, saving
// spinner, failure with retry — is one View so the finger never has to move.
//
// The contract with the rest of the app is one callback: onRecorded(voiceNoteId).
// By the time it fires, the audio is on disk, in the bucket, and in a voice_notes
// row, so the id can go straight into close_task(p_voice_note_id). A recording that
// is still uploading has not been "recorded" yet, and the button says so.
//
// There is no way to delete a recording from here, or from anywhere else.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, PanResponder, Pressable, View } from 'react-native';

import { useSaveVoiceNote } from '@/api/voice-notes';
import { Button, Text } from '@/components/ui';
import { hapticCommit, hapticReject, hapticSelect, hapticWarn } from '@/lib/haptics';

import { clearPending } from './local-files';
import { useVoiceRecorder, type FinishedRecording } from './use-voice-recorder';
import { formatDuration } from './waveform';
import { WaveformView } from './waveform-view';

/** Drag this far left while holding to arm the cancel. Visible as the text turning red. */
const CANCEL_THRESHOLD_PX = 72;

const HINT_MS = 1800;

const BLOCKED_MESSAGE =
  'Microphone access is off for Cadence. Voice notes let you speak a closing note instead of typing it — turn it on in Settings to record one.';

type Failure = { recording: FinishedRecording; message: string };

export function VoiceRecorderButton({
  onRecorded,
  disabled = false,
  compact = false,
}: {
  onRecorded: (voiceNoteId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const save = useSaveVoiceNote();
  const [hint, setHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);

  const recorder = useVoiceRecorder({
    // The OS took the mic mid-note. Keep what exists and save it like a release.
    onInterrupted: () => void finishRef.current(),
  });

  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const cancelArmedRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Everything the gesture calls goes through refs. The PanResponder is created
  // once and must always see the latest closure, not the one from first render.
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const abortRef = useRef<() => Promise<void>>(async () => {});
  const canStartRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const saving = save.isPending;
  const busy = recorder.phase !== 'idle' || saving;
  const blocked = recorder.permission === 'blocked';
  canStartRef.current = !disabled && !busy && !blocked;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  function flashHint(text: string) {
    if (!mountedRef.current) return;
    setHint(text);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setHint(null);
    }, HINT_MS);
  }

  async function upload(recording: FinishedRecording) {
    try {
      const note = await save.mutateAsync({
        id: recording.id,
        localUri: recording.uri,
        durationMs: recording.durationMs,
        sizeBytes: recording.sizeBytes,
        waveform: recording.waveform,
        recordedAt: recording.recordedAt,
      });
      // The row exists: the sidecar has done its job. The audio stays as the
      // playback cache.
      await clearPending(note.id);
      hapticCommit();
      if (!mountedRef.current) return;
      setFailure(null);
      if (recording.interrupted)
        flashHint('Recording was interrupted — the part before it is saved.');
      onRecordedRef.current(note.id);
    } catch (e) {
      hapticReject();
      if (!mountedRef.current) return;
      // The recording is on disk with its sidecar; nothing is lost. Offer a retry
      // here, and recovery.ts can finish it on a later launch if this is abandoned.
      setFailure({
        recording,
        message:
          e instanceof Error
            ? e.message
            : 'The upload failed. The recording is still on this phone.',
      });
    }
  }

  finishRef.current = async () => {
    const started = await startPromiseRef.current;
    startPromiseRef.current = null;
    // Not started: permission refused, or the first-time grant (which deliberately
    // does not record — see use-voice-recorder.ts rule 2). Nothing to stop.
    if (!started) return;
    const result = await recorder.stop();
    if (!mountedRef.current) return;
    if (!result.ok) {
      if (result.reason === 'too_short') {
        hapticWarn();
        flashHint('Hold to record');
      } else if (result.reason === 'failed') {
        hapticReject();
        flashHint(result.message ?? 'Could not save that recording.');
      }
      return;
    }
    await upload(result.recording);
  };

  abortRef.current = async () => {
    const started = await startPromiseRef.current;
    startPromiseRef.current = null;
    if (!started) return;
    await recorder.cancel();
    hapticWarn();
    flashHint('Cancelled');
  };

  const startRef = useRef<() => Promise<boolean>>(async () => false);
  startRef.current = recorder.start;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canStartRef.current,
      onMoveShouldSetPanResponder: () => false,
      // A parent ScrollView must not take the touch away mid-recording.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cancelArmedRef.current = false;
        setCancelArmed(false);
        setHint(null);
        hapticSelect();
        startPromiseRef.current = startRef.current();
      },
      onPanResponderMove: (_e, g) => {
        const armed = g.dx < -CANCEL_THRESHOLD_PX;
        if (armed !== cancelArmedRef.current) {
          cancelArmedRef.current = armed;
          setCancelArmed(armed);
          hapticWarn();
        }
      },
      onPanResponderRelease: () => {
        void (cancelArmedRef.current ? abortRef.current() : finishRef.current());
      },
      // The system took the touch — an incoming call, a system sheet. Treat it
      // as a release, never as a cancel: what was said is kept.
      onPanResponderTerminate: () => {
        void finishRef.current();
      },
    }),
  ).current;

  // A first-time grant ends the hold without recording (see use-voice-recorder.ts
  // rule 2). Say so, or the first hold looks like it silently did nothing.
  const prevPermission = useRef(recorder.permission);
  useEffect(() => {
    if (
      prevPermission.current !== 'granted' &&
      recorder.permission === 'granted' &&
      prevPermission.current !== 'unknown'
    ) {
      flashHint('Microphone ready — hold to record');
    }
    prevPermission.current = recorder.permission;
  }, [recorder.permission]);

  function openSettings() {
    void Linking.openSettings().catch(() => {
      Alert.alert(
        'Open Settings',
        'Find Cadence in your phone’s Settings and allow the microphone.',
      );
    });
  }

  // ---- Blocked: explanation plus the Settings link. doc/06 §8. -----------------
  if (blocked) {
    if (compact) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Microphone is off. Open Settings to allow it."
          onPress={() =>
            Alert.alert('Microphone is off', BLOCKED_MESSAGE, [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: openSettings },
            ])
          }
          className="h-14 w-14 bg-raised dark:bg-raised-dark items-center justify-center rounded-full">
          <MicGlyph muted />
        </Pressable>
      );
    }
    return (
      <View className="rounded-card border-border bg-surface p-card dark:border-border-dark dark:bg-surface-dark border">
        <Text variant="meta">{BLOCKED_MESSAGE}</Text>
        <Button label="Open Settings" variant="ghost" className="mt-1" onPress={openSettings} />
      </View>
    );
  }

  // ---- Failed upload: the audio is safe; offer the retry. ----------------------
  if (failure) {
    return (
      <View className="rounded-card border-border bg-surface p-card dark:border-border-dark dark:bg-surface-dark border">
        <Text className="font-semibold">Recorded, not yet backed up</Text>
        <Text variant="meta" className="mt-1">
          {failure.message}
        </Text>
        <Text variant="micro" className="mt-1">
          {formatDuration(failure.recording.durationMs)} · kept on this phone
        </Text>
        <Button
          label="Retry upload"
          variant="secondary"
          className="mt-3"
          loading={saving}
          onPress={() => void upload(failure.recording)}
        />
      </View>
    );
  }

  const recording = recorder.phase === 'recording' || recorder.phase === 'starting';
  const stopping = recorder.phase === 'stopping' || saving;

  const message = hint ?? recorder.error;

  return (
    <View className={compact ? 'items-end' : ''}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Record a voice note"
        accessibilityHint="Hold to record, release to save, slide left to cancel"
        accessibilityState={{ disabled: disabled || blocked, busy }}
        className={
          recording || stopping
            ? 'gap-3 bg-raised px-3 dark:bg-raised-dark min-h-[56px] flex-row items-center rounded-full'
            : compact
              ? `h-14 w-14 bg-accent dark:bg-accent-dark items-center justify-center rounded-full ${disabled ? 'opacity-50' : ''}`
              : `gap-3 border-border bg-surface pl-1.5 pr-4 dark:border-border-dark dark:bg-surface-dark min-h-[56px] flex-row items-center rounded-full border ${disabled ? 'opacity-50' : ''}`
        }>
        {stopping ? (
          <>
            <ActivityIndicator />
            <Text variant="meta" className="flex-1">
              {saving ? 'Saving voice note…' : 'Finishing…'}
            </Text>
          </>
        ) : recording ? (
          <>
            <View className="h-3 w-3 bg-status-n dark:bg-status-n-dark rounded-full" />
            <Text className="w-11 font-semibold tabular-nums">
              {formatDuration(recorder.durationMs)}
            </Text>
            <WaveformView
              levels={recorder.liveSamples}
              progress={1}
              height={28}
              className="flex-1"
            />
            <Text
              variant="micro"
              className={cancelArmed ? 'font-semibold text-status-n dark:text-status-n-dark' : ''}>
              {cancelArmed ? 'Release to cancel' : '‹ Slide to cancel'}
            </Text>
          </>
        ) : compact ? (
          <MicGlyph />
        ) : (
          <>
            <View className="h-11 w-11 bg-accent dark:bg-accent-dark items-center justify-center rounded-full">
              <MicGlyph />
            </View>
            <View className="flex-1">
              <Text className="font-semibold">Hold to record</Text>
              <Text variant="micro">Say it instead of typing it. Slide left to cancel.</Text>
            </View>
          </>
        )}
      </View>

      {message ? (
        <Text
          variant="micro"
          className={`mt-1.5 ${compact ? 'text-right' : ''} ${
            recorder.error
              ? 'text-status-n dark:text-status-n-dark'
              : 'text-muted dark:text-muted-dark'
          }`}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A microphone drawn from three Views: capsule, cradle, stem. No icon font is in the
 * dependency list and adding one is not on the table, so the glyph is built from
 * what is already here.
 */
function MicGlyph({ muted = false }: { muted?: boolean }) {
  const ink = muted ? 'bg-faint dark:bg-faint-dark' : 'bg-white';
  const stroke = muted ? 'border-faint dark:border-faint-dark' : 'border-white';
  return (
    <View className="items-center" pointerEvents="none">
      <View className={`h-4 w-2.5 rounded-full ${ink}`} />
      <View
        className={`-mt-2 h-3.5 w-5 rounded-b-full border-r-2 border-b-2 border-l-2 ${stroke}`}
      />
      <View className={`h-1 w-0.5 ${ink}`} />
    </View>
  );
}
