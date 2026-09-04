// Wires the outbox into the query client. P10.
//
// Three jobs:
//   1. Register every replayable mutation, so a queue persisted before a restart can
//      be rebuilt. This has to run before the persisted cache is hydrated, which is
//      why the root layout calls setupOutbox() at module scope, not in an effect.
//   2. Watch the mutation cache for rejections with nobody left to show them.
//   3. Replay the queue once the cache has been restored.

import { registerChatMutationDefaults } from '@/api/chat';
import { pruneLocalCache, retryPendingUploads } from '@/features/voice/recovery';
import { registerGoalMutationDefaults } from '@/api/goals';
import { registerReviewMutationDefaults } from '@/api/reviews';
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
  // Chat sends (P08) and weekly reviews (P11) replay through the same queue. Every
  // replayable mutation is registered here and nowhere else: a write restored from
  // disk is rebuilt from these defaults, so one missing line means that write comes
  // back with no mutationFn and is dropped without a word.
  registerChatMutationDefaults();
  registerReviewMutationDefaults();

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

  // P06 left the orphan sweep for P10's launch hook, and this is it. A recording is
  // written to disk with a sidecar *before* its upload starts, so an app killed
  // mid-upload — or mid-record — leaves audio on the phone with no row behind it.
  // This turns those back into rows. Anything that still fails is left exactly where
  // it is: a recording is never deleted to tidy up.
  //
  // Deliberately not awaited by the caller and never allowed to throw. This runs on
  // every cold start, and a phone with no signal must not have its startup blocked by
  // an upload that was always going to fail.
  void retryPendingUploads()
    .then(() => pruneLocalCache())
    .catch(() => {});
}

/** How many writes have not reached the server yet. For the sign-out flow to ask before discarding them. */
export function pendingChangeCount(): number {
  return queryClient.getMutationCache().findAll({ status: 'pending' }).length;
}
