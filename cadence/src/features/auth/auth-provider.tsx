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
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, []);

  const sendCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // A single-user app still wants the first sign-in to create the account.
        // The profile row appears by way of the on_auth_user_created trigger from
        // migration 0001 — the client never inserts it.
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Order matters: the cache holds this user's tasks and notes, so it has to go
    // before the next person can reach a screen that reads it.
    await clearPersistedCache();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isRestoring,
      sendCode,
      verifyCode,
      signOut,
    }),
    [session, isRestoring, sendCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
