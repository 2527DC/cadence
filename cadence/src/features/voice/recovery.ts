// Finishing what an earlier session started. P06.
//
// A recording is persisted to disk with a sidecar before its upload begins (see
// local-files.ts). If the upload never completed — no signal, app killed, phone
// died — the sidecar is still there on the next launch, and this turns it back into
// a row. Nothing here is called automatically yet: P10 (offline outbox) owns the
// launch hook. Until then the recorder button's own retry covers the common case,
// and this covers the one where the app was closed in between.
//
// A recording that cannot be recovered is left exactly where it is. It is never
// deleted to tidy up.

import { saveVoiceNote } from '@/api/voice-notes';

import {
  clearPending,
  listPending,
  localUri,
  pruneLocalCache,
  type PendingRecording,
} from './local-files';

export type RecoveryReport = {
  /** Ids whose row now exists. */
  saved: string[];
  /** Ids still waiting, with the reason. Their audio and sidecar are untouched. */
  failed: { id: string; message: string }[];
};

/** What is waiting. Read-only; for a "3 notes not backed up yet" indicator. */
export async function listPendingRecordings(): Promise<PendingRecording[]> {
  return listPending();
}

/**
 * Upload and insert every pending recording, one at a time so that a dead network
 * fails fast on the first rather than spawning a dozen hung requests.
 */
export async function retryPendingUploads(): Promise<RecoveryReport> {
  const report: RecoveryReport = { saved: [], failed: [] };
  const pending = await listPending();

  for (const meta of pending) {
    try {
      await saveVoiceNote({
        id: meta.id,
        localUri: localUri(meta.id),
        durationMs: meta.durationMs,
        sizeBytes: meta.sizeBytes,
        waveform: meta.waveform,
        recordedAt: meta.recordedAt,
      });
      await clearPending(meta.id);
      report.saved.push(meta.id);
    } catch (e) {
      report.failed.push({
        id: meta.id,
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  return report;
}

/**
 * Housekeeping for the playback cache: uploaded audio older than 30 days goes,
 * anything still pending stays. Cheap enough to run on every launch.
 */
export { pruneLocalCache };
