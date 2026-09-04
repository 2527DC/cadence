// Wires the outbox into the query client. P10.
//
// Three jobs:
//   1. Register every replayable mutation, so a queue persisted before a restart can
//      be rebuilt. This has to run before the persisted cache is hydrated, which is
//      why the root layout calls setupOutbox() at module scope, not in an effect.
//   2. Watch the mutation cache for rejections with nobody left to show them.
//   3. Replay the queue once the cache has been restored.

import { registerGoalMutationDefaults } from '@/api/goals';
import { registerTaskMutationDefaults } from '@/api/tasks';
import { replayOrder } from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';

import { recordSyncProblem } from './sync-problems';

let installed = false;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function setupOutbox(): void {
  if (installed) return;
  installed = true;

  registerTaskMutationDefaults();
  registerGoalMutationDefaults();

  // Which mutations were ever paused. A write that failed straight away, online,
  // failed in front of the screen that made it, and that screen shows the message
  // (the close sheet, the "Could not commit" alert). A write that paused first was
  // made offline and the screen has usually moved on; a write restored from disk
  // never had a screen at all. Those two are the banner's to report, and only those,
  // so nobody sees the same rejection twice.
  const pausedOnce = new Set<number>();

  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'removed') {
      pausedOnce.delete(event.mutation.mutationId);
      return;
    }
    if (event.type !== 'updated') return;

    const { mutation, action } = event;
    if (action.type === 'pause') {
      pausedOnce.add(mutation.mutationId);
      return;
    }
    if (action.type === 'error') {
      const orphaned = pausedOnce.has(mutation.mutationId) || mutation.meta?.restored === true;
      if (orphaned) recordSyncProblem(messageOf(action.error));
      pausedOnce.delete(mutation.mutationId);
      return;
    }
    if (action.type === 'success') pausedOnce.delete(mutation.mutationId);
  });
}

/**
 * Replay whatever came back from disk, then refetch.
 *
 * Passed to PersistQueryClientProvider's onSuccess. Every restored mutation is
 * `pending` — paused if it was waiting for the network, not paused if the app died
 * with it in flight — and both kinds are continued here; the library's own
 * resumePausedMutations() would leave the in-flight ones stuck at the head of the
 * queue. The shared scope still runs them one at a time, oldest first.
 *
 * The invalidate waits for the replay: refetching first would briefly show the
 * server's version of a week that the queue is about to change.
 */
export async function resumeOutbox(): Promise<void> {
  const cache = queryClient.getMutationCache();
  const pending = replayOrder(
    cache.getAll().filter((m) => m.state.status === 'pending'),
    (m) => m.state.submittedAt,
  );
  await Promise.all(pending.map((m) => m.continue().catch(() => {})));
  await queryClient.invalidateQueries();
}

/** How many writes have not reached the server yet. For the sign-out flow to ask before discarding them. */
export function pendingChangeCount(): number {
  return queryClient.getMutationCache().findAll({ status: 'pending' }).length;
}
