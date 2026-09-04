// The recorder. P06.
//
// A thin state machine over expo-audio's useAudioRecorder:
//
//   idle ──start()──▶ starting ──▶ recording ──stop()/cancel()──▶ stopping ──▶ idle
//
// with three rules that are not obvious from the shape:
//
//   1. By the time stop() resolves, the audio is in documentDirectory/voice/ with a
//      sidecar next to it. Nothing network-shaped has happened yet. This is how "a
//      recording is never lost" is kept: the file is safe before anything can fail.
//   2. The first-ever permission prompt does NOT start a recording. Someone holding
//      the mic while an OS dialog appears has let go by the time it is answered, and
//      a recording nobody is holding is a surprise. Grant, then let them hold again.
//   3. The id is chosen at start, on the device, so that the object name, the row,
//      and any retry all agree on it.
//
// Metering is polled at ~10 Hz into a plain array; on stop it is downsampled to the
// sixty points the column holds. expo-audio's own status listener is subscribed
// once per recorder instance with a stale closure, so it only ever touches refs
// and stable setters here — never state.

import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type PermissionResponse,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { discardTemp, persistRecording, writePending, type PendingRecording } from './local-files';
import { uuidv4 } from './uuid';
import {
  METER_INTERVAL_MS,
  MIN_RECORDING_MS,
  downsample,
  meteringToLevel,
  trailingWindow,
} from './waveform';

/**
 * doc/06 §3: m4a/AAC, mono, 64 kbps. Universally playable without transcoding, a
 * 30-second note is ~240 KB, and speech does not benefit from stereo or 128 kbps.
 * Built on the HIGH_QUALITY preset so the container and encoder settings for both
 * platforms come from expo-audio rather than being hand-copied.
 *
 * A module-level constant on purpose: useAudioRecorder keys the native recorder on
 * JSON.stringify(options), and a fresh object each render would recreate it.
 */
export const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** How many of the newest samples the live meter shows. ~4 seconds at 10 Hz. */
export const LIVE_WINDOW = 40;

export type MicPermission =
  | 'unknown' // not yet asked
  | 'granted'
  | 'denied' // refused, but the OS will ask again
  | 'blocked'; // refused for good; only Settings can change it

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'stopping';

export type FinishedRecording = PendingRecording & {
  /** file:// under documentDirectory/voice/. Already persisted. */
  uri: string;
  /** The OS stopped the recorder (a call, another app). What exists was kept. */
  interrupted: boolean;
};

export type StopResult =
  | { ok: true; recording: FinishedRecording }
  | { ok: false; reason: 'too_short' | 'not_recording' | 'failed'; message?: string };

const RATIONALE_TITLE = 'Use the microphone?';
const RATIONALE_BODY =
  'Cadence records voice notes so you can speak a closing note instead of typing it. Recordings stay in your own private account.';

export function useVoiceRecorder({ onInterrupted }: { onInterrupted?: () => void } = {}) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [durationMs, setDurationMs] = useState(0);
  const [liveSamples, setLiveSamples] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<RecorderPhase>('idle');
  const samplesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const lastDurationRef = useRef(0);
  const interruptedRef = useRef(false);
  const onInterruptedRef = useRef(onInterrupted);
  onInterruptedRef.current = onInterrupted;

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    // Stale closure by design (see the header). setError is stable.
    if (status.hasError) setError(status.error ?? 'Recording failed.');
  });

  function movePhase(next: RecorderPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Know before the first hold whether the mic is blocked, so the button can show
  // the Settings link instead of a gesture that will never work.
  useEffect(() => {
    let cancelled = false;
    void getRecordingPermissionsAsync()
      .then((res) => {
        if (!cancelled) setPermission(toMicPermission(res));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopTimer();
    };
  }, []);

  /**
   * Ask, with the rationale on screen first when this is the very first time. The
   * OS prompt on Android carries no explanation at all, and on iOS the usage string
   * is a single line; doc/06 §8 asks for context to be visible when the question
   * is put. Resolves true only when recording is allowed right now.
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) {
      setPermission('granted');
      return true;
    }
    if (!current.canAskAgain) {
      setPermission('blocked');
      return false;
    }
    if (current.status === 'undetermined') {
      const proceed = await confirmRationale();
      if (!proceed) {
        setPermission('denied');
        return false;
      }
    }
    const res = await requestRecordingPermissionsAsync();
    const next = toMicPermission(res);
    setPermission(next);
    return next === 'granted';
  }, []);

  /**
   * Begin recording. Resolves true once audio is actually being captured, false if
   * it is not — permission refused, first-time prompt just answered (rule 2), or
   * the microphone unavailable. The reason, when there is one, is in `error`.
   */
  const start = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current !== 'idle') return false;
    setError(null);
    movePhase('starting');

    try {
      const before = await getRecordingPermissionsAsync();
      if (!before.granted) {
        const granted = await requestPermission();
        // Rule 2: a freshly granted permission ends this attempt. The next hold
        // records. Nothing to tear down — the recorder was never started.
        movePhase('idle');
        if (!granted) return false;
        setError(null);
        return false;
      }
      setPermission('granted');

      // allowsRecording routes iOS audio through the recording session; it is
      // switched off again in stop() because leaving it on sends playback to the
      // earpiece. doNotMix: a recording is not something to talk over.
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      await recorder.prepareToRecordAsync();
      recorder.record();

      idRef.current = uuidv4();
      startedAtRef.current = Date.now();
      lastDurationRef.current = 0;
      samplesRef.current = [];
      interruptedRef.current = false;
      setDurationMs(0);
      setLiveSamples([]);
      movePhase('recording');

      timerRef.current = setInterval(() => {
        let status;
        try {
          status = recorder.getStatus();
        } catch {
          return;
        }
        samplesRef.current.push(meteringToLevel(status.metering));
        const elapsed =
          status.durationMillis > 0 ? status.durationMillis : Date.now() - startedAtRef.current;
        lastDurationRef.current = elapsed;
        setDurationMs(elapsed);
        setLiveSamples(trailingWindow(samplesRef.current, LIVE_WINDOW));

        // The OS stopped the recorder under us: a phone call, another app taking
        // the mic, media services resetting. doc/06 §9: stop, save what exists.
        // The half-second guard avoids reading a not-yet-started recorder as one
        // that has been interrupted.
        if (
          phaseRef.current === 'recording' &&
          elapsed > 500 &&
          (!status.isRecording || status.mediaServicesDidReset) &&
          !interruptedRef.current
        ) {
          interruptedRef.current = true;
          stopTimer();
          onInterruptedRef.current?.();
        }
      }, METER_INTERVAL_MS);

      return true;
    } catch (e) {
      stopTimer();
      movePhase('idle');
      setError(describeStartFailure(e));
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      return false;
    }
  }, [recorder, requestPermission]);

  /**
   * Stop and persist. Anything under a second is discarded as a tap. On any other
   * failure the temporary file is left where the recorder put it — never deleted.
   */
  const stop = useCallback(async (): Promise<StopResult> => {
    if (phaseRef.current !== 'recording') return { ok: false, reason: 'not_recording' };
    movePhase('stopping');
    stopTimer();

    try {
      try {
        await recorder.stop();
      } catch {
        // An interrupted recorder may already be stopped and object to being
        // stopped twice. Its file is still there; carry on.
      }
      const tempUri = recorder.uri;
      const durationMs =
        lastDurationRef.current > 0 ? lastDurationRef.current : Date.now() - startedAtRef.current;

      if (durationMs < MIN_RECORDING_MS) {
        await discardTemp(tempUri);
        return { ok: false, reason: 'too_short' };
      }
      if (!tempUri) {
        return { ok: false, reason: 'failed', message: 'The recorder produced no file.' };
      }

      const id = idRef.current ?? uuidv4();
      const { uri, sizeBytes } = await persistRecording(tempUri, id);
      const meta: PendingRecording = {
        id,
        durationMs: Math.round(durationMs),
        sizeBytes,
        waveform: downsample(samplesRef.current),
        recordedAt: new Date(startedAtRef.current).toISOString(),
      };
      // The sidecar goes down before the caller gets the recording, so that a
      // crash between here and the upload still leaves something recoverable.
      await writePending(meta);

      return { ok: true, recording: { ...meta, uri, interrupted: interruptedRef.current } };
    } catch (e) {
      return {
        ok: false,
        reason: 'failed',
        message: e instanceof Error ? e.message : 'Could not save the recording.',
      };
    } finally {
      movePhase('idle');
      setLiveSamples([]);
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }, [recorder]);

  /**
   * The one path that throws audio away, and only because the person asked for it
   * by sliding to cancel. Distinct from a failure: a failure keeps the file.
   */
  const cancel = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'recording') return;
    movePhase('stopping');
    stopTimer();
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    await discardTemp(recorder.uri);
    movePhase('idle');
    setDurationMs(0);
    setLiveSamples([]);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [recorder]);

  return {
    phase,
    permission,
    durationMs,
    liveSamples,
    error,
    start,
    stop,
    cancel,
    requestPermission,
  };
}

function toMicPermission(res: PermissionResponse): MicPermission {
  if (res.granted) return 'granted';
  if (res.status === 'undetermined') return 'unknown';
  return res.canAskAgain ? 'denied' : 'blocked';
}

function confirmRationale(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      RATIONALE_TITLE,
      RATIONALE_BODY,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function describeStartFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // doc/06 §9: another app holding the audio session is the common real-world cause.
  if (/busy|in use|session|focus|occupied/i.test(raw)) {
    return 'Another app is using the microphone. Close it and try again.';
  }
  return raw || 'The microphone could not be started.';
}
