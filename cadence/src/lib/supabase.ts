// The Supabase client. There is exactly one of these.
//
// If you are coming from Supabase's Next.js quickstart, note that its three files
// (client.ts / server.ts / middleware.ts) collapse into this one. Next.js needs three
// because it has to move the session across server components, client components and
// the middleware pipeline as cookies. React Native has one process and no HTTP request
// pipeline: the session lives in device storage, and this module reads it.
//
// doc/02-tech-stack.md §3 and P02.

import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // EXPO_PUBLIC_* is inlined at build time, so a missing value is a build-time
  // mistake, not a runtime condition. Fail loudly at import rather than handing
  // back a client that 401s on every call with no explanation.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY.\n' +
      'Copy .env.example to .env.local at the repo root and fill them in, then restart\n' +
      'the dev server with `npx expo start --clear` — env vars are baked into the bundle.',
  );
}

/**
 * SecureStore keeps the session in the iOS keychain instead of AsyncStorage, which is
 * what doc/02-tech-stack.md asks for: this is a private journal, and the token that
 * unlocks it should not sit in plaintext app storage.
 *
 * The catch is that SecureStore rejects values over 2048 bytes, and a Supabase session
 * (access token + refresh token + user object) is routinely larger than that. So values
 * are split across numbered keys, with the chunk count stored under the original key.
 *
 * Every method swallows its errors and degrades to "no session". A keychain read can
 * genuinely fail — a locked device, a restored backup, a reinstall — and the right
 * response is to make the user sign in again, not to crash on launch.
 */
const CHUNK_SIZE = 1800; // under 2048 with room for encoding overhead

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head === null) return null;

      const count = Number(head);
      // Not a chunk count: a value written before chunking existed. Return it as-is.
      if (!Number.isInteger(count) || count < 1) return head;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
      );
      // A missing chunk means the write was interrupted. A half-session is worse than
      // none, so report nothing and let the user sign in again.
      if (parts.some((p) => p === null)) return null;
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.removeItem(key); // clear a longer previous value's tail
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      await Promise.all(
        chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)),
      );
      // Written last: until the count exists, getItem reports no session rather than
      // reassembling a partial one.
      await SecureStore.setItemAsync(key, String(chunks.length));
    } catch {
      // Losing the session means signing in again. It does not mean crashing.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const head = await SecureStore.getItemAsync(key);
      const count = Number(head);
      if (Number.isInteger(count) && count > 0) {
        await Promise.all(
          Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
        );
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // nothing to do
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to read a session out of: there is no browser redirect in a native app.
    detectSessionInUrl: false,
  },
});

/**
 * Refresh the access token only while the app is actually in front of the user.
 *
 * Without this, supabase-js keeps a refresh timer running while the app is
 * backgrounded, which iOS suspends anyway — so the token silently expires and the
 * first query after resuming fails. Call this once, from the root layout.
 *
 * Returns the unsubscribe function.
 */
export function startAuthAutoRefresh(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    void supabase.auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}
