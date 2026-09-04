// Where a recording lives, in Storage and in the row. P06. Pure, so unit-tested.
//
// The bucket policy in migration 0012/0013 is:
//
//   (storage.foldername(name))[1] = auth.uid()::text
//
// i.e. the FIRST path segment of the object name must be the caller's user id. Get
// this wrong and the upload is not "rejected with a message" — it is a 400 from the
// policy with no hint about why. So the object name is built in exactly one place,
// here, and nothing else concatenates a path.
//
// Two distinct strings are easy to confuse:
//
//   object name    "<user_id>/<uuid>.m4a"                 what Storage APIs take
//   storage_path   "voice-notes/<user_id>/<uuid>.m4a"     what the voice_notes row holds
//
// The row keeps the bucket in the path so it stays meaningful if a second bucket ever
// appears; the Storage APIs already know the bucket and want the bare name.

export const VOICE_BUCKET = 'voice-notes';
export const VOICE_EXTENSION = '.m4a';
export const VOICE_MIME_TYPE = 'audio/m4a';

/** How long a signed playback URL is valid for, in seconds. doc/06 §5: one hour. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** The Storage object name. The first segment is what the RLS policy checks. */
export function objectName(userId: string, id: string): string {
  assertSegment(userId, 'userId');
  assertSegment(id, 'id');
  return `${userId}/${id}${VOICE_EXTENSION}`;
}

/** What goes in voice_notes.storage_path. */
export function storagePath(userId: string, id: string): string {
  return `${VOICE_BUCKET}/${objectName(userId, id)}`;
}

/**
 * Back from the row to the object name Storage wants. Tolerates a path that was
 * stored without the bucket prefix, because that is the mistake most likely to be
 * made by a future writer and it costs nothing to accept it.
 */
export function objectNameFromStoragePath(path: string): string {
  const prefix = `${VOICE_BUCKET}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * The raw upload endpoint. expo-file-system's uploadAsync streams the file from disk
 * straight to this URL, which is the only way to upload without reading a multi-MB
 * recording into JavaScript memory first — supabase-js's `.upload()` needs a Blob or
 * ArrayBuffer, and React Native has neither for a local file.
 */
export function uploadUrl(supabaseUrl: string, name: string): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/${VOICE_BUCKET}/${name}`;
}

function assertSegment(value: string, label: string): void {
  if (!value || value.includes('/') || value.includes('..')) {
    throw new Error(`Invalid ${label} for a voice note path: ${JSON.stringify(value)}`);
  }
}
