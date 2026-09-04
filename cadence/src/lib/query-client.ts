// React Query, configured for an app that is expected to work on a train.
//
// doc/04-architecture.md: reads come from cache first and revalidate behind you, and
// writes queue in an outbox that survives being offline and being killed. The read
// half is the query cache; the write half is the mutation cache, with the policy in
// src/lib/outbox.ts applied to every mutation below. Both halves are persisted.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  type Mutation,
  type Query,
} from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

import { OUTBOX_MUTATION_DEFAULTS, shouldPersistMutation } from '@/lib/outbox';

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
      // There is no window to focus on a phone. focusManager is wired to AppState in
      // src/features/sync/network.ts so that paused writes resume on foreground; it
      // must not also make every screen refetch on foreground.
      refetchOnWindowFocus: false,
    },
    // P10: every write in the app is an outbox entry — one FIFO queue, offline-first,
    // retried only when the server was never reached. Set here rather than per hook
    // so a mutation written anywhere (chat, voice notes) behaves the same way.
    mutations: OUTBOX_MUTATION_DEFAULTS,
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
 * A mutation can only be replayed after a restart if a mutationFn is registered for
 * its key (see registerTaskMutationDefaults in src/api/tasks.ts). One without is
 * this session's business only.
 */
function isRestorable(mutation: Mutation): boolean {
  const key = mutation.options.mutationKey;
  return !!key && typeof queryClient.getMutationDefaults(key).mutationFn === 'function';
}

/**
 * Which queries survive an app restart: everything the default keeps, except the
 * signed playback URLs.
 *
 * Those are short-lived credentials for a private bucket, good for an hour, and their
 * short gcTime does not survive this trip: dehydrate stores the state and the key, not
 * the options, so a hydrated query comes back with the client's one-day default and the
 * persister's 24-hour maxAge as its only bound. A cold start five hours later would
 * hand the player a URL that expired four hours ago, and — because a paused refetch
 * never sets `error` — it would spin instead of saying so. Minting a fresh one costs a
 * single request, and until then nothing is written to disk that could be replayed by
 * anyone who reads it.
 */
function shouldPersistQuery(query: Query): boolean {
  if (query.queryKey[0] === 'voice-notes' && query.queryKey[1] === 'signed-url') return false;
  return defaultShouldDehydrateQuery(query);
}

/**
 * Everything PersistQueryClientProvider needs. Defined once, here, so the persister
 * and the root layout cannot disagree about what is persisted.
 */
export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  dehydrateOptions: {
    shouldDehydrateMutation: (mutation) =>
      shouldPersistMutation(mutation.state, isRestorable(mutation)),
    shouldDehydrateQuery: shouldPersistQuery,
  },
  hydrateOptions: {
    defaultOptions: {
      // Marks a mutation as having come back from disk. A restored mutation has no
      // component listening for its result, so a rejection has to be surfaced by the
      // sync banner instead — see src/features/sync/outbox-setup.ts.
      mutations: { meta: { restored: true } },
    },
  },
};

/**
 * Sign-out has to drop this too. The cache holds one user's tasks and notes, and
 * without clearing it the next person to sign in on this device would see the
 * previous user's week flash up before the first fetch resolves.
 *
 * `queryClient.clear()` empties the mutation cache as well, so a change still waiting
 * to sync is discarded here. That is the one place a queued write is ever dropped,
 * and it is why the sign-out flow should check pendingChangeCount() first.
 */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
