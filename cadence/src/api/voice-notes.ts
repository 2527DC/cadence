// Voice notes: the row, the object, the signed URL. P06.
//
// Two things in this file are shaped by the database and are worth knowing before
// changing anything:
//
//   * voice_notes has SELECT, INSERT and UPDATE grants and no DELETE (migration
//     0014), and the bucket has no delete policy either (0012). Recordings are
//     permanent. There is deliberately no remove/delete function here, and the
//     cadence-domain skill says never to add one.
//   * The Storage policy is `(storage.foldername(name))[1] = auth.uid()`, so the
//     object name MUST start with the user's id. paths.ts is the only place that
//     builds it; this file does not concatenate paths.
//
// Ordering matters too. The audio is already safe on disk before saveVoiceNote() is
// called (see features/voice/local-files.ts). Then: upload, and only once the upload
// has been confirmed, insert the row with its storage_path. A row that points at an
// object that does not exist is a lie the player would trip over later; an object
// with no row is merely an orphan recovery.ts can finish.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';

import {
  SIGNED_URL_TTL_SECONDS,
  VOICE_BUCKET,
  VOICE_MIME_TYPE,
  objectName,
  objectNameFromStoragePath,
  storagePath,
  uploadUrl,
} from '@/features/voice/paths';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database.types';

export type VoiceNote = Tables<'voice_notes'>;

// Inlined at build time, the same way src/lib/supabase.ts reads them. That module
// already throws at import if either is missing, and it is imported above, so by
// the time this code runs both are present.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const voiceNoteKeys = {
  all: ['voice-notes'] as const,
  detail: (id: string) => ['voice-notes', 'detail', id] as const,
  signedUrl: (path: string) => ['voice-notes', 'signed-url', path] as const,
};

/** One voice_notes row. What the player and the task history need. */
export function useVoiceNote(id: string) {
  return useQuery({
    queryKey: voiceNoteKeys.detail(id),
    enabled: !!id,
    // The row is immutable apart from the transcript columns, which P07 owns and
    // which nothing here displays. An hour is conservative.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<VoiceNote> => {
      const { data, error } = await supabase.from('voice_notes').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * A signed playback URL for a private object, cached for its lifetime.
 *
 * The bucket is private (0012), so playback needs a URL that carries its own
 * authorisation. It is good for an hour; React Query treats it as fresh for
 * fifty-five minutes and forgets it entirely at the hour, so the persisted cache
 * can never hand a cold-started app a URL that has already expired.
 */
export function useVoiceNoteSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: voiceNoteKeys.signedUrl(path ?? ''),
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_SECONDS - 5 * 60) * 1000,
    gcTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string> => {
      if (!path) throw new Error('No storage path.');
      const { data, error } = await supabase.storage
        .from(VOICE_BUCKET)
        .createSignedUrl(objectNameFromStoragePath(path), SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// ---------------------------------------------------------------------------
// Saving — upload, then insert
// ---------------------------------------------------------------------------

export type SaveVoiceNoteInput = {
  /** Client-generated v4. Doubles as the row id and the object name, so a retry is idempotent. */
  id: string;
  /** A file:// URI under the app's document directory — already persisted. */
  localUri: string;
  durationMs: number;
  sizeBytes: number | null;
  /** Sixty 0..100 points. */
  waveform: number[];
  /** ISO timestamp. */
  recordedAt: string;
};

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Not signed in.');
  return data.session;
}

/**
 * Stream the file from disk to the bucket.
 *
 * expo-file-system's uploadAsync is used instead of supabase-js's `.upload()`
 * because the latter wants a Blob or ArrayBuffer and React Native cannot make one
 * from a file URI without reading the whole recording into JS memory first.
 * Talking to the Storage REST endpoint directly means supplying the two headers
 * supabase-js would have added: the bearer token and the apikey.
 *
 * `x-upsert: false` because the bucket has no update policy and an overwrite would
 * be refused anyway; asking for one explicitly turns a confusing 403 into a clear
 * 409. And a 409 here is not an error: object names are unique per recording, so
 * "already exists" can only mean an earlier attempt landed and its response was
 * lost. The retry has done its job.
 */
export async function uploadVoiceNoteFile({
  localUri,
  name,
  accessToken,
}: {
  localUri: string;
  name: string;
  accessToken: string;
}): Promise<void> {
  const result = await FileSystem.uploadAsync(uploadUrl(SUPABASE_URL, name), localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    // FOREGROUND so an upload with no network fails now, with a message and a retry,
    // instead of the BACKGROUND session's "keep trying forever" leaving the sheet on
    // "Saving…" indefinitely. The file is safe on disk either way.
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_KEY,
      'Content-Type': VOICE_MIME_TYPE,
      'x-upsert': 'false',
    },
  });

  if (result.status >= 200 && result.status < 300) return;
  if (result.status === 409) return;

  throw new Error(describeUploadFailure(result.status, result.body));
}

function describeUploadFailure(status: number, body: string): string {
  let detail = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as { message?: unknown; error?: unknown };
      detail =
        typeof p.message === 'string' ? p.message : typeof p.error === 'string' ? p.error : '';
    }
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401 || status === 403) {
    return `The upload was refused (${status}). Sign in again and retry — the recording is still on this phone.`;
  }
  if (status === 413) {
    return 'That recording is larger than the 50 MB the bucket allows.';
  }
  return `Upload failed (${status})${detail ? `: ${detail}` : ''}. The recording is still on this phone.`;
}

/**
 * The whole pipeline for a recording that is already on disk. Returns the row.
 *
 * Safe to call again with the same input after any failure: the upload tolerates
 * "already exists", and a unique-violation on insert is resolved by reading the row
 * that an earlier attempt created.
 */
export async function saveVoiceNote(input: SaveVoiceNoteInput): Promise<VoiceNote> {
  const session = await requireSession();
  const userId = session.user.id;
  const name = objectName(userId, input.id);

  await uploadVoiceNoteFile({
    localUri: input.localUri,
    name,
    accessToken: session.access_token,
  });

  const row: TablesInsert<'voice_notes'> = {
    id: input.id,
    user_id: userId,
    storage_path: storagePath(userId, input.id),
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    size_bytes: input.sizeBytes,
    mime_type: VOICE_MIME_TYPE,
    waveform: input.waveform,
    transcript_status: 'pending',
    recorded_at: input.recordedAt,
  };

  const { data, error } = await supabase.from('voice_notes').insert(row).select().single();
  if (!error) return data;

  // 23505 = unique_violation on id or storage_path: the row is already there from a
  // retry whose response never arrived. Hand it back rather than failing a save
  // that has, in fact, succeeded.
  if (error.code === '23505') {
    const existing = await supabase.from('voice_notes').select('*').eq('id', input.id).single();
    if (existing.data) return existing.data;
  }
  throw new Error(error.message);
}

export function useSaveVoiceNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveVoiceNote,
    onSuccess: (note) => {
      // Seed the detail cache so a player mounted for this id straight after the
      // save does not pay a round trip for a row we are already holding.
      qc.setQueryData(voiceNoteKeys.detail(note.id), note);
    },
  });
}
