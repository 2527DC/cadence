// The Storage policy checks (storage.foldername(name))[1] = auth.uid(). That is a
// rule that lives in Postgres, and this file is the only place in the app that
// builds a path that has to satisfy it. If these tests pass and an upload still
// gets a 400, look at the session, not at the path.

import {
  SIGNED_URL_TTL_SECONDS,
  VOICE_BUCKET,
  objectName,
  objectNameFromStoragePath,
  storagePath,
  uploadUrl,
} from './paths';

const USER = '5b1d1c6e-4c4a-4b2e-9c1a-2f6f1e5f0a11';
const ID = '0c9e4d3a-9a2b-4c1d-8e5f-6a7b8c9d0e1f';

describe('objectName', () => {
  it('puts the user id in the first folder segment, which is what RLS checks', () => {
    const name = objectName(USER, ID);
    expect(name.split('/')[0]).toBe(USER);
  });

  it('names the object <user_id>/<uuid>.m4a and nothing else', () => {
    expect(objectName(USER, ID)).toBe(`${USER}/${ID}.m4a`);
  });

  it('refuses a segment that could escape the user folder', () => {
    expect(() => objectName('a/b', ID)).toThrow();
    expect(() => objectName(USER, '../x')).toThrow();
    expect(() => objectName('', ID)).toThrow();
    expect(() => objectName(USER, '')).toThrow();
  });
});

describe('storagePath', () => {
  it('prefixes the bucket, matching the column comment in migration 0003', () => {
    expect(storagePath(USER, ID)).toBe(`voice-notes/${USER}/${ID}.m4a`);
    expect(storagePath(USER, ID).startsWith(`${VOICE_BUCKET}/`)).toBe(true);
  });

  it('round-trips back to the object name', () => {
    expect(objectNameFromStoragePath(storagePath(USER, ID))).toBe(objectName(USER, ID));
  });

  it('tolerates a path stored without the bucket prefix', () => {
    expect(objectNameFromStoragePath(`${USER}/${ID}.m4a`)).toBe(`${USER}/${ID}.m4a`);
  });
});

describe('uploadUrl', () => {
  it('targets the raw object endpoint of the private bucket', () => {
    expect(uploadUrl('https://x.supabase.co', `${USER}/${ID}.m4a`)).toBe(
      `https://x.supabase.co/storage/v1/object/voice-notes/${USER}/${ID}.m4a`,
    );
  });

  it('does not double a trailing slash on the project URL', () => {
    expect(uploadUrl('https://x.supabase.co/', 'a/b.m4a')).toBe(
      'https://x.supabase.co/storage/v1/object/voice-notes/a/b.m4a',
    );
  });
});

describe('SIGNED_URL_TTL_SECONDS', () => {
  it('is the one hour doc/06 §5 asks for', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(3600);
  });
});
