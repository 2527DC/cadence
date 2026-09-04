// The write-side outbox. P10.
//
// doc/04-architecture.md §3 sketches this as a SQLite table with an ordered flush. It
// is built on React Query's mutation cache instead, because the cache already *is*
// that table: a mutation that cannot reach the server is paused, paused mutations are
// persisted next to the query cache, and replaying them oldest-first when the network
// returns is a one-line call. A second queue beside it would mean two answers to the
// question "what has not landed yet", and they would disagree eventually.
//
// The three rules in the doc map onto three mutation options, set for every mutation
// in src/lib/query-client.ts:
//
//   Ordered     → one shared `scope`. The cache runs mutations in a scope strictly one
//                 at a time, in submission order. Finalize lands before close; a voice
//                 note lands before the close that references it.
//   Idempotent  → inserts carry a client-generated id, and every mutationFn treats
//                 "already applied" as success. See src/api/tasks.ts.
//   Bounded     → `outboxRetry` below. A write the server *rejected* is never retried:
//                 it rolls back and the message is shown. A write that never reached
//                 the server is retried with backoff, and pauses while offline instead
//                 of burning attempts.
//
// Conflicts: the server wins. Nothing here merges; a rejected write is rolled back and
// the next refetch shows what the database actually holds. In particular the client
// never overwrites a finalized task, because the database would refuse it anyway.
//
// This module is pure — no Supabase, no React Native — so the policy has unit tests.

import type { MutationOptions } from '@tanstack/react-query';

/** Every write shares this scope. That is what makes the queue FIFO. */
export const OUTBOX_SCOPE = 'cadence-outbox';

// ---------------------------------------------------------------------------
// Classifying failures
// ---------------------------------------------------------------------------

/**
 * `network`: the request never reached the server (no connection, DNS, timeout, or
 *            the token could not be refreshed). Nothing happened; try again.
 * `server`:  it reached the server and the server fell over (5xx, 429). Try again a
 *            few times, then give up and say so.
 *
 * Everything else — every constraint, trigger and RLS refusal — is a rejection, not a
 * failure. The database's message is written for a person and is shown as-is.
 */
export type RetryableKind = 'network' | 'server';

export class RetryableSyncError extends Error {
  readonly kind: RetryableKind;

  constructor(message: string, kind: RetryableKind) {
    super(message);
    this.name = 'RetryableSyncError';
    this.kind = kind;
  }
}

// What React Native's fetch says when there is no route to the host, and what
// postgrest-js wraps it as (`TypeError: Network request failed`). Deliberately narrow:
// a database message that happens to contain "timeout" must not be mistaken for a
// dropped connection and retried forever.
const NETWORK_FAILURE =
  /network request failed|failed to fetch|fetch failed|load failed|networkerror|internet connection appears to be offline|request was aborted/i;

type ErrorLike = { message: string; code?: string | null; name?: string };

/**
 * Turn a Supabase response error into the error the mutation should throw.
 *
 * The HTTP status is the reliable signal. postgrest-js reports a failed fetch as
 * status 0 with the fetch error's text as the message, and a Postgres exception raised
 * in a trigger or RPC as a 4xx with the exception text. `PGRST301` is an expired JWT:
 * supabase-js refreshes it before the next request once the network is back, so it is
 * a network problem in disguise, not a rejection.
 */
export function toSyncError(error: ErrorLike, status: number): Error {
  if (status === 0 || error.code === 'PGRST301') {
    return new RetryableSyncError(error.message, 'network');
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new RetryableSyncError(error.message, 'server');
  }
  return error instanceof Error ? error : new Error(error.message);
}

export function retryableKind(error: unknown): RetryableKind | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { name?: unknown; kind?: unknown; message?: unknown; code?: unknown };

  if (e.name === 'RetryableSyncError' && (e.kind === 'network' || e.kind === 'server')) {
    return e.kind;
  }
  // auth-js, when the refresh call itself cannot get out.
  if (e.name === 'AuthRetryableFetchError') return 'network';
  if (e.code === 'PGRST301') return 'network';
  // Errors thrown by code that did not go through toSyncError().
  if (typeof e.message === 'string' && NETWORK_FAILURE.test(e.message)) return 'network';

  return null;
}

export function isRetryableError(error: unknown): boolean {
  return retryableKind(error) !== null;
}

// ---------------------------------------------------------------------------
// The retry policy
// ---------------------------------------------------------------------------

/** Total attempts against a server that keeps answering 5xx, before giving up. */
export const MAX_SERVER_ATTEMPTS = 5;

/** Backoff between attempts: 1s, 2s, 4s … capped at 30s. */
export const MAX_RETRY_DELAY_MS = 30_000;

/**
 * React Query calls this with the number of failures *so far* (0 on the first one).
 *
 * A network failure is retried without limit. It pauses whenever the device is
 * offline — React Query checks `onlineManager` before each retry — so an unbounded
 * retry costs nothing on a train, and giving up would mean rolling back a decision
 * the user already made and watched succeed on screen. That is the one thing the
 * architecture doc says never to do.
 */
export function outboxRetry(failureCount: number, error: unknown): boolean {
  const kind = retryableKind(error);
  if (kind === null) return false; // the server said no. Do not ask again.
  if (kind === 'network') return true;
  return failureCount + 1 < MAX_SERVER_ATTEMPTS;
}

export function outboxRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}

/**
 * Applied to every mutation through `defaultOptions.mutations`, not only the ones in
 * src/api. `offlineFirst` means the first attempt is always made, whatever the
 * network monitor believes — monitors are wrong on captive portals and in lifts —
 * and it is the failure, not the monitor, that decides whether to pause.
 */
export const OUTBOX_MUTATION_DEFAULTS = {
  networkMode: 'offlineFirst',
  retry: outboxRetry,
  retryDelay: outboxRetryDelay,
  scope: { id: OUTBOX_SCOPE },
} as const satisfies MutationOptions<unknown, unknown, unknown, unknown>;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Which mutations survive an app restart.
 *
 * React Query's default keeps only *paused* mutations. This keeps every pending one,
 * paused or in flight: an app killed with a request on the wire replays that request
 * on relaunch, and the idempotency in each mutationFn makes the replay harmless if
 * the first copy did land. Losing it, on the other hand, would silently drop a close.
 *
 * `restorable` is whether a mutationFn is registered for the mutation's key. A
 * mutation without one cannot run after a restart, and hydrating it would only
 * produce "No mutationFn found" and block everything queued behind it.
 */
export function shouldPersistMutation(
  state: { status: string; isPaused: boolean },
  restorable: boolean,
): boolean {
  return restorable && state.status === 'pending';
}

/** Oldest first, stable. The cache already keeps this order; this makes it explicit. */
export function replayOrder<T>(items: readonly T[], submittedAt: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => submittedAt(a.item) - submittedAt(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// Idempotency helpers
// ---------------------------------------------------------------------------

/**
 * A UUID minted on the device, so a row has its id before the server has the row.
 *
 * doc/04-architecture.md §2: an offline `close_task` can reference an offline voice
 * note because both ids exist already. It is also what makes an insert safe to
 * replay — the second copy collides on the primary key instead of creating a twin.
 *
 * Hermes does not ship WebCrypto, and expo-crypto is not a dependency, so this falls
 * back to Math.random. Fine for uniqueness among one person's tasks; not a secret.
 */
export function clientId(): string {
  const c = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint8Array) => Uint8Array;
      };
    }
  ).crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Postgres `unique_violation`. An insert with a client id that already landed. */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

/**
 * close_task() raises `Task <id> is already <status>.` when asked to close a task to
 * the status it already has. From the outbox's point of view that is not an error:
 * it is proof the earlier copy of this exact close landed, and the ledger has exactly
 * one row for it. The message is matched with the id and status so that a genuine
 * "already" from some other path is not mistaken for a replay.
 */
export function isAlreadyClosedTo(message: string, taskId: string, status: string): boolean {
  return message.includes(`Task ${taskId} is already ${status}.`);
}

// ---------------------------------------------------------------------------
// Network state
// ---------------------------------------------------------------------------

/**
 * expo-network reports `undefined` for what it does not know, and iOS often does not
 * know whether the internet is reachable. Unknown is treated as online: a write that
 * is wrongly held back sits in the queue for no reason, while a write that is wrongly
 * attempted fails in a second and pauses itself.
 */
export function isOnlineState(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

// ---------------------------------------------------------------------------
// What the banner says
// ---------------------------------------------------------------------------

export type SyncSummary = { waiting: number; inFlight: number };

export function summarizePending(states: readonly { isPaused: boolean }[]): SyncSummary {
  let waiting = 0;
  let inFlight = 0;
  for (const s of states) {
    if (s.isPaused) waiting++;
    else inFlight++;
  }
  return { waiting, inFlight };
}

export type SyncNotice = { tone: 'offline' | 'syncing'; text: string };

function changes(n: number): string {
  return `${n} change${n === 1 ? '' : 's'}`;
}

/** One line, or nothing. doc/04-architecture.md §7: "a single unobtrusive offline banner". */
export function syncNotice(input: { online: boolean } & SyncSummary): SyncNotice | null {
  const pending = input.waiting + input.inFlight;
  if (!input.online) {
    return {
      tone: 'offline',
      text:
        pending > 0 ? `Offline · ${changes(pending)} waiting` : 'Offline · changes will sync later',
    };
  }
  if (pending > 0) return { tone: 'syncing', text: `Syncing ${changes(pending)}…` };
  return null;
}

export type SyncProblem = { message: string; at: number };

/** How many rejections the banner keeps. Older ones scroll off; they are not a log. */
export const MAX_PROBLEMS_SHOWN = 3;

/**
 * Same message twice — a replay that hit the same wall — is one problem, not two.
 * The newest copy wins so the line stays at the bottom, where the eye lands.
 */
export function rememberProblem(
  problems: readonly SyncProblem[],
  message: string,
  at: number,
): SyncProblem[] {
  const kept = problems.filter((p) => p.message !== message);
  return [...kept, { message, at }].slice(-MAX_PROBLEMS_SHOWN);
}
