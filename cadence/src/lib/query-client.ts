// React Query, configured for an app that is expected to work on a train.
//
// doc/04-architecture.md: reads come from cache first and revalidate behind you.
// P10 adds the write-side outbox; this is only the read half.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // P02: fresh for 5 minutes, kept for a day. A week's plan does not change
      // behind your back — you are the only writer — so refetching aggressively
      // would cost battery and buy nothing.
      staleTime: FIVE_MINUTES,
      gcTime: ONE_DAY,
      retry: 2,
      // There is no window to focus on a phone, and the AppState listener in
      // supabase.ts already handles coming back to the foreground.
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * The persisted cache is what makes the planner open instantly on a cold start
 * instead of showing a spinner while the network wakes up.
 *
 * AsyncStorage rather than SecureStore, deliberately: this holds cached rows, not
 * credentials, and SecureStore's 2048-byte ceiling makes it the wrong tool for a
 * cache of a few hundred tasks. The session itself lives in the keychain — see
 * src/lib/supabase.ts.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'cadence.query-cache.v1',
  throttleTime: 1000,
});

/**
 * Sign-out has to drop this too. The cache holds one user's tasks and notes, and
 * without clearing it the next person to sign in on this device would see the
 * previous user's week flash up before the first fetch resolves.
 */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
