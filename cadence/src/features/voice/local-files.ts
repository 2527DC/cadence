// The on-device copy of every recording. P06.
//
// The non-negotiable in the phase file: **a recording is never lost.** The way that
// is honoured here is by ordering. The moment the recorder stops, the file is moved
// out of the OS cache (which the system may clear) into documentDirectory/voice/,
// which it will not. Only then does anything touch the network. If the upload fails,
// the phone dies, or the app is killed, the audio is still sitting here, with a
// sidecar JSON next to it describing what it was — enough for recovery.ts to finish
// the job on a later launch.
//
// Nothing in this file deletes audio except `discardTemp`, which only ever receives
// a recorder's temporary file for a note the user cancelled or that was too short to
// be a note. Sidecars are removed once the row exists; the audio stays as a playback
// cache and is pruned only after CACHE_DAYS.

import * as FileSystem from 'expo-file-system/legacy';

import { VOICE_EXTENSION } from './paths';

/** doc/06 §4 step 10: keep the local file for 30 days after the upload is confirmed. */
export const CACHE_DAYS = 30;

const SIDECAR_EXTENSION = '.json';

/**
 * documentDirectory is `null` only on web, where there is no recording anyway. The
 * empty-string fallback keeps the type simple; every call below fails loudly on
 * a platform without a document directory rather than writing to a relative path.
 */
export const VOICE_DIR = `${FileSystem.documentDirectory ?? ''}voice/`;

/** What a not-yet-uploaded recording needs in order to be finished later. */
export type PendingRecording = {
  id: string;
  durationMs: number;
  sizeBytes: number | null;
  /** Sixty 0..100 points. See waveform.ts. */
  waveform: number[];
  /** ISO timestamp of when the recording was made, for voice_notes.recorded_at. */
  recordedAt: string;
};

export function localUri(id: string): string {
  return `${VOICE_DIR}${id}${VOICE_EXTENSION}`;
}

function sidecarUri(id: string): string {
  return `${VOICE_DIR}${id}${SIDECAR_EXTENSION}`;
}

export async function ensureVoiceDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Voice notes need a document directory, which this platform does not have.');
  }
  const info = await FileSystem.getInfoAsync(VOICE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VOICE_DIR, { intermediates: true });
  }
}

/**
 * Move the recorder's temporary file into the permanent voice directory.
 *
 * A move can fail across volumes on some Android devices; then it is copied and the
 * temporary file left for the OS, because a duplicate is far cheaper than a lost
 * note. Returns the size while it is at hand — the row wants it, and a second stat
 * later would cost another native round trip.
 */
export async function persistRecording(
  tempUri: string,
  id: string,
): Promise<{ uri: string; sizeBytes: number | null }> {
  await ensureVoiceDir();
  const to = localUri(id);

  try {
    await FileSystem.moveAsync({ from: tempUri, to });
  } catch {
    await FileSystem.copyAsync({ from: tempUri, to });
  }

  const info = await FileSystem.getInfoAsync(to);
  if (!info.exists || info.isDirectory) {
    throw new Error('The recording could not be saved on this device.');
  }
  return { uri: to, sizeBytes: typeof info.size === 'number' ? info.size : null };
}

/** The cached copy, if it is still on the device. Playback prefers this to the network. */
export async function localFile(id: string): Promise<{ uri: string; sizeBytes: number } | null> {
  if (!FileSystem.documentDirectory) return null;
  try {
    const info = await FileSystem.getInfoAsync(localUri(id));
    if (!info.exists || info.isDirectory || info.size === 0) return null;
    return { uri: info.uri, sizeBytes: info.size };
  } catch {
    return null;
  }
}

/**
 * Written right after the audio is persisted and before the upload starts, so that
 * at no point is there a file on disk that nothing knows how to finish.
 */
export async function writePending(meta: PendingRecording): Promise<void> {
  await ensureVoiceDir();
  await FileSystem.writeAsStringAsync(sidecarUri(meta.id), JSON.stringify(meta));
}

export async function readPending(id: string): Promise<PendingRecording | null> {
  try {
    const info = await FileSystem.getInfoAsync(sidecarUri(id));
    if (!info.exists) return null;
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(sidecarUri(id)));
    return isPendingRecording(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The row exists now. Only the sidecar goes; the audio stays as the playback cache. */
export async function clearPending(id: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(sidecarUri(id), { idempotent: true });
  } catch {
    // A sidecar that refuses to go is harmless: recovery re-checks for the row.
  }
}

/**
 * Every recording that was persisted but whose row was never confirmed. Files with
 * a valid sidecar and audio still on disk; anything else is skipped, not deleted.
 */
export async function listPending(): Promise<PendingRecording[]> {
  if (!FileSystem.documentDirectory) return [];
  let entries: string[];
  try {
    const info = await FileSystem.getInfoAsync(VOICE_DIR);
    if (!info.exists) return [];
    entries = await FileSystem.readDirectoryAsync(VOICE_DIR);
  } catch {
    return [];
  }

  const ids = entries
    .filter((name) => name.endsWith(SIDECAR_EXTENSION))
    .map((name) => name.slice(0, -SIDECAR_EXTENSION.length));

  const found: PendingRecording[] = [];
  for (const id of ids) {
    const meta = await readPending(id);
    if (!meta) continue;
    const audio = await localFile(id);
    if (!audio) continue;
    found.push(meta);
  }
  return found;
}

/**
 * The only path that removes audio the user made — and only a temporary file the
 * recorder produced for a note that was cancelled by hand or was shorter than a
 * word. Never called on anything under VOICE_DIR.
 */
export async function discardTemp(tempUri: string | null | undefined): Promise<void> {
  if (!tempUri || tempUri.startsWith(VOICE_DIR)) return;
  try {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
  } catch {
    // The OS owns its cache directory and will clear it anyway.
  }
}

/**
 * Drop cached audio older than CACHE_DAYS that has already been uploaded — i.e. has
 * no sidecar. Never touches a file that still has one. Returns how many were pruned.
 * Call it from a launch hook; it is safe to call often and does nothing most days.
 */
export async function pruneLocalCache(maxAgeDays: number = CACHE_DAYS): Promise<number> {
  if (!FileSystem.documentDirectory) return 0;
  let entries: string[];
  try {
    const info = await FileSystem.getInfoAsync(VOICE_DIR);
    if (!info.exists) return 0;
    entries = await FileSystem.readDirectoryAsync(VOICE_DIR);
  } catch {
    return 0;
  }

  const cutoffSeconds = Date.now() / 1000 - maxAgeDays * 24 * 60 * 60;
  const pendingIds = new Set(
    entries
      .filter((n) => n.endsWith(SIDECAR_EXTENSION))
      .map((n) => n.slice(0, -SIDECAR_EXTENSION.length)),
  );

  let pruned = 0;
  for (const name of entries) {
    if (!name.endsWith(VOICE_EXTENSION)) continue;
    const id = name.slice(0, -VOICE_EXTENSION.length);
    if (pendingIds.has(id)) continue;
    try {
      const info = await FileSystem.getInfoAsync(`${VOICE_DIR}${name}`);
      if (!info.exists || info.isDirectory) continue;
      if (info.modificationTime > cutoffSeconds) continue;
      await FileSystem.deleteAsync(info.uri, { idempotent: true });
      pruned += 1;
    } catch {
      // Leave it. Disk space is cheaper than a lost note.
    }
  }
  return pruned;
}

function isPendingRecording(value: unknown): value is PendingRecording {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.durationMs === 'number' &&
    (typeof v.sizeBytes === 'number' || v.sizeBytes === null) &&
    Array.isArray(v.waveform) &&
    typeof v.recordedAt === 'string'
  );
}
