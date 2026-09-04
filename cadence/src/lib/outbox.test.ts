// The outbox policy is a duplicate of decisions that also live in React Query's
// retryer and in the database's error codes, and duplicated decisions drift. These
// pin the ones that would lose data if they drifted: what gets retried, what gets
// persisted, what counts as "already done", and what the banner claims.

import {
  MAX_PROBLEMS_SHOWN,
  MAX_RETRY_DELAY_MS,
  MAX_SERVER_ATTEMPTS,
  RetryableSyncError,
  clientId,
  isAlreadyClosedTo,
  isOnlineState,
  isRetryableError,
  isUniqueViolation,
  outboxRetry,
  outboxRetryDelay,
  rememberProblem,
  replayOrder,
  retryableKind,
  shouldPersistMutation,
  summarizePending,
  syncNotice,
  toSyncError,
} from './outbox';

const TASK_ID = '0b9f2b1e-6a52-4c4b-9c1d-2f7a1e9d3c55';

describe('toSyncError', () => {
  it('treats a status-0 response (fetch never got out) as a network failure', () => {
    const e = toSyncError({ message: 'TypeError: Network request failed', code: '' }, 0);
    expect(e).toBeInstanceOf(RetryableSyncError);
    expect(retryableKind(e)).toBe('network');
  });

  it('treats an expired JWT as a network failure, because the refresh will fix it', () => {
    const e = toSyncError({ message: 'JWT expired', code: 'PGRST301' }, 401);
    expect(retryableKind(e)).toBe('network');
  });

  it('treats 5xx and 429 as a server failure', () => {
    expect(retryableKind(toSyncError({ message: 'upstream', code: '' }, 503))).toBe('server');
    expect(retryableKind(toSyncError({ message: 'slow down', code: '' }, 429))).toBe('server');
  });

  it('passes a database rejection through with its message intact', () => {
    const message =
      'Task 0b9f2b1e-6a52-4c4b-9c1d-2f7a1e9d3c55 is finalized and can never be deleted. Close it with a status instead.';
    const e = toSyncError({ message, code: '23001' }, 409);
    expect(e.message).toBe(message);
    expect(isRetryableError(e)).toBe(false);
  });

  it('keeps the original Error instance for a rejection', () => {
    const original = Object.assign(new Error('NC requires a reason category.'), { code: '23514' });
    expect(toSyncError(original, 400)).toBe(original);
  });
});

describe('retryableKind', () => {
  it('recognises the auth-js retryable fetch error by name', () => {
    const e = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' });
    expect(retryableKind(e)).toBe('network');
  });

  it('recognises a raw React Native fetch failure that skipped toSyncError()', () => {
    expect(retryableKind(new Error('TypeError: Network request failed'))).toBe('network');
  });

  it('does not mistake a human-readable database message for a network problem', () => {
    expect(retryableKind(new Error('Write a real note. That one says nothing.'))).toBeNull();
    expect(retryableKind(new Error('A finalized task cannot be reverted to draft.'))).toBeNull();
  });

  it('handles non-objects', () => {
    expect(retryableKind(null)).toBeNull();
    expect(retryableKind('Network request failed')).toBeNull();
  });
});

describe('outboxRetry', () => {
  const rejection = new Error('Task is already C.');
  const network = new RetryableSyncError('Network request failed', 'network');
  const server = new RetryableSyncError('502', 'server');

  it('never retries a rejection, however early', () => {
    expect(outboxRetry(0, rejection)).toBe(false);
  });

  it('retries a network failure without limit', () => {
    expect(outboxRetry(0, network)).toBe(true);
    expect(outboxRetry(500, network)).toBe(true);
  });

  it(`gives up on a server failure after ${MAX_SERVER_ATTEMPTS} attempts in total`, () => {
    // failureCount is the number of failures so far, so the nth attempt sees n - 1.
    for (let failures = 0; failures < MAX_SERVER_ATTEMPTS - 1; failures++) {
      expect(outboxRetry(failures, server)).toBe(true);
    }
    expect(outboxRetry(MAX_SERVER_ATTEMPTS - 1, server)).toBe(false);
  });
});

describe('outboxRetryDelay', () => {
  it('doubles from one second', () => {
    expect([0, 1, 2, 3].map(outboxRetryDelay)).toEqual([1000, 2000, 4000, 8000]);
  });

  it('caps', () => {
    expect(outboxRetryDelay(20)).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe('shouldPersistMutation', () => {
  it('keeps a paused mutation', () => {
    expect(shouldPersistMutation({ status: 'pending', isPaused: true }, true)).toBe(true);
  });

  it('keeps an in-flight mutation too, so a kill mid-request replays it', () => {
    expect(shouldPersistMutation({ status: 'pending', isPaused: false }, true)).toBe(true);
  });

  it('drops anything that already settled', () => {
    expect(shouldPersistMutation({ status: 'success', isPaused: false }, true)).toBe(false);
    expect(shouldPersistMutation({ status: 'error', isPaused: false }, true)).toBe(false);
    expect(shouldPersistMutation({ status: 'idle', isPaused: false }, true)).toBe(false);
  });

  it('drops a mutation that could not run after a restart', () => {
    expect(shouldPersistMutation({ status: 'pending', isPaused: true }, false)).toBe(false);
  });
});

describe('replayOrder', () => {
  it('is oldest first and stable for ties', () => {
    const items = [
      { id: 'c', at: 3 },
      { id: 'a', at: 1 },
      { id: 'b1', at: 2 },
      { id: 'b2', at: 2 },
    ];
    expect(replayOrder(items, (i) => i.at).map((i) => i.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('does not mutate its input', () => {
    const items = [{ at: 2 }, { at: 1 }];
    replayOrder(items, (i) => i.at);
    expect(items.map((i) => i.at)).toEqual([2, 1]);
  });
});

describe('clientId', () => {
  it('is a v4 UUID', () => {
    expect(clientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, clientId));
    expect(ids.size).toBe(2000);
  });
});

describe('isUniqueViolation', () => {
  it('matches only unique_violation', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23514' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('isAlreadyClosedTo', () => {
  // Lifted from migration 0007: raise exception 'Task % is already %.', p_task_id, p_to_status
  it('matches the RPC message for the same task and status', () => {
    expect(isAlreadyClosedTo(`Task ${TASK_ID} is already C.`, TASK_ID, 'C')).toBe(true);
  });

  it('does not match a different status — that is a real correction being refused', () => {
    expect(isAlreadyClosedTo(`Task ${TASK_ID} is already C.`, TASK_ID, 'N')).toBe(false);
  });

  it('does not match a different task', () => {
    expect(isAlreadyClosedTo(`Task ${TASK_ID} is already C.`, 'another-id', 'C')).toBe(false);
  });

  it('does not match the other close_task messages', () => {
    expect(
      isAlreadyClosedTo(
        `Task ${TASK_ID} is still a draft. Finalize it before closing it.`,
        TASK_ID,
        'C',
      ),
    ).toBe(false);
  });
});

describe('isOnlineState', () => {
  it('treats unknown as online', () => {
    expect(isOnlineState({})).toBe(true);
    expect(isOnlineState({ isConnected: true })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: undefined })).toBe(true);
  });

  it('is offline when either flag says so', () => {
    expect(isOnlineState({ isConnected: false })).toBe(false);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});

describe('summarizePending + syncNotice', () => {
  it('says nothing when online with nothing queued', () => {
    expect(syncNotice({ online: true, ...summarizePending([]) })).toBeNull();
  });

  it('counts paused mutations as waiting and the rest as in flight', () => {
    expect(summarizePending([{ isPaused: true }, { isPaused: true }, { isPaused: false }])).toEqual(
      {
        waiting: 2,
        inFlight: 1,
      },
    );
  });

  it('reports offline with the queue size', () => {
    expect(syncNotice({ online: false, waiting: 1, inFlight: 0 })).toEqual({
      tone: 'offline',
      text: 'Offline · 1 change waiting',
    });
    expect(syncNotice({ online: false, waiting: 2, inFlight: 1 })?.text).toBe(
      'Offline · 3 changes waiting',
    );
  });

  it('reports offline even with nothing queued', () => {
    expect(syncNotice({ online: false, waiting: 0, inFlight: 0 })?.tone).toBe('offline');
  });

  it('reports syncing when online with work queued', () => {
    expect(syncNotice({ online: true, waiting: 0, inFlight: 1 })).toEqual({
      tone: 'syncing',
      text: 'Syncing 1 change…',
    });
    expect(syncNotice({ online: true, waiting: 3, inFlight: 1 })?.text).toBe('Syncing 4 changes…');
  });
});

describe('rememberProblem', () => {
  it('appends newest last', () => {
    const list = rememberProblem(rememberProblem([], 'a', 1), 'b', 2);
    expect(list.map((p) => p.message)).toEqual(['a', 'b']);
  });

  it('collapses a repeated message into its newest copy', () => {
    const list = rememberProblem(rememberProblem(rememberProblem([], 'a', 1), 'b', 2), 'a', 3);
    expect(list).toEqual([
      { message: 'b', at: 2 },
      { message: 'a', at: 3 },
    ]);
  });

  it(`keeps at most ${MAX_PROBLEMS_SHOWN}`, () => {
    let list = rememberProblem([], 'm0', 0);
    for (let i = 1; i < MAX_PROBLEMS_SHOWN + 3; i++) list = rememberProblem(list, `m${i}`, i);
    expect(list).toHaveLength(MAX_PROBLEMS_SHOWN);
    expect(list[list.length - 1]?.message).toBe(`m${MAX_PROBLEMS_SHOWN + 2}`);
  });
});
