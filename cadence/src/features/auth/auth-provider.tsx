// Session state for the whole app.
//
// P02. Auth exists even though there is exactly one user, because every RLS policy
// in the database keys off auth.uid(). Without a session there is no uid, and without
// a uid every query returns nothing. Skipping auth "because it is just me" would mean
// skipping the entire security model.

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearPersistedCache } from '@/lib/query-client';
import { startAuthAutoRefresh, supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read. Gates the route guard. */
  isRestoring: boolean;
  /** Create an account. Resolves to true when a confirmation email was sent. */
  register: (email: string, password: string) => Promise<boolean>;
  logIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Read whatever is in the keychain before deciding which screen to show. The
    // route guard waits on isRestoring, which is what stops the sign-in screen
    // flashing for a moment on every cold start.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setIsRestoring(false);
    });

    // Fires for sign-in, sign-out, and every token refresh. This is the only place
    // session state is written after the initial read.
    //
    // A session does not only end at the sign-out button: a refresh token can expire or
    // be revoked from another device, and auth-js reports that here as SIGNED_OUT with
    // nobody having tapped anything. The cache has to go with it, or the next person to
    // sign in on this phone opens on the previous user's week — which is precisely what
    // clearPersistedCache exists to prevent.
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') void clearPersistedCache();
      setSession(next);
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, []);

  /**
   * Create an account with an email and a password.
   *
   * Returns true when Supabase sent a confirmation email and the account is not usable
   * yet, false when the session is live immediately. Which one you get depends on the
   * project's "Confirm email" setting, not on anything here — so the caller has to
   * handle both rather than assume.
   *
   * The profiles row is not created here. The on_auth_user_created trigger from
   * migration 0001 does it, so an account can never exist without one.
   */
  const register = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) throw error;

    // Supabase returns a user with no session when confirmation is required. It also
    // returns a user with an empty identities array when the address is already
    // registered — deliberately, so sign-up cannot be used to enumerate accounts. Both
    // look like success, so treat both as "check your email" rather than signing in.
    return !data.session;
  }, []);

  const logIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  /**
   * Sends a reset link. Always resolves, even for an address that has no account —
   * Supabase answers identically either way, and so does this, because a reset form
   * that says "no such user" is an account-enumeration oracle.
   */
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Order matters: the cache holds this user's tasks and notes, so it has to go
    // before the next person can reach a screen that reads it. The listener above
    // clears it too; awaiting it here is what makes signOut() resolve only once the
    // disk is actually empty, and clearing twice costs nothing.
    await clearPersistedCache();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isRestoring,
      register,
      logIn,
      resetPassword,
      signOut,
    }),
    [session, isRestoring, register, logIn, resetPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
