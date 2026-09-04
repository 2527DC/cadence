// The two things every outbox mutationFn needs from Supabase, in one place.
//
// This lives under features/sync rather than src/lib because it imports the Supabase
// client, and src/lib/outbox.ts is kept pure so its tests run without an API key.

import { RetryableSyncError, toSyncError } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';

/**
 * Who is signed in, without touching the network.
 *
 * `auth.getUser()` is a round trip to /auth/v1/user and fails offline, which would
 * turn every offline insert into an instant rejection. The stored session has the
 * id already. When the access token has expired and the refresh cannot get out, this
 * throws a *retryable* error rather than "not signed in": a genuine sign-out clears
 * the mutation cache (see clearPersistedCache), so a mutation that finds no session
 * is always one that is waiting for the network, not one that should give up.
 *
 * `owner` is the account the write was made by, stamped into the variables at the tap
 * and persisted with them. A queued write is replayed from disk, possibly days later,
 * and until it runs it has no identity of its own — it would take whichever session it
 * happens to find. That is only ever right when it is the same one. A refresh token
 * that expired while the app was killed leaves no SIGNED_OUT to clear the queue on, so
 * the check is made here, where the row is about to be written, rather than trusted to
 * have happened earlier. A mismatch is a rejection, not a retry: nobody is coming to
 * make it the right account again.
 */
export async function sessionUserId(owner?: string | null): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new RetryableSyncError('The session could not be refreshed yet.', 'network');
  if (owner && owner !== id) {
    throw new Error(
      'That change was made while a different account was signed in, so it was not applied.',
    );
  }
  return id;
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message: string; code?: string | null; name?: string } | null;
  status: number;
};

/**
 * Unwrap a Supabase response, throwing the error the outbox needs: retryable when the
 * server was never reached or fell over, the database's own message otherwise.
 */
export function checked<T>(res: SupabaseResponse<T>): T {
  if (res.error) throw toSyncError(res.error, res.status);
  return res.data as T;
}
