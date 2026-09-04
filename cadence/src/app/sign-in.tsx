// Log in. Email and password.
//
// No magic links and no six-digit codes: this is the account you own, and you type the
// password you chose. Creating one is a separate screen (/register), because merging
// the two is how people accidentally make a second account with a typo'd email and
// wonder where their week went.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Text } from '@/components/ui';
import {
  AuthScreenShell,
  EmailField,
  MIN_PASSWORD,
  PasswordField,
  SwitchLink,
  looksLikeEmail,
} from '@/features/auth/auth-form';
import { useAuth } from '@/features/auth/auth-provider';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/error-boundary';

export default function LogInScreen() {
  const { logIn, resetPassword } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = looksLikeEmail(email) && password.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // On success the auth listener in AuthProvider sets the session and the route
      // guard moves us to the tabs. Nothing to navigate to from here.
      await logIn(email, password);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not sign you in.';
      // Supabase answers a wrong password and an unknown address identically, on
      // purpose — a login form that distinguishes them tells an attacker which
      // addresses have accounts. Its wording is kept, with the next step added.
      setError(
        /invalid login credentials/i.test(message)
          ? 'That email and password do not match an account. Check both, or create an account.'
          : /email not confirmed/i.test(message)
            ? 'This account still needs confirming. Open the link in the email we sent you, then log in.'
            : message,
      );
      setBusy(false);
    }
  }

  async function forgot() {
    if (!looksLikeEmail(email)) {
      setError('Type your email address above first, then tap this again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      // Deliberately says "if" — see resetPassword's note on not confirming which
      // addresses have accounts.
      setNotice(`If ${email.trim()} has an account, a reset link is on its way.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a reset link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell heading="Log in" subheading="Your record is waiting where you left it.">
      <EmailField value={email} onChangeText={setEmail} editable={!busy} autoFocus />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        textContentType="password"
        editable={!busy}
        onSubmitEditing={submit}
      />

      {error ? (
        <Text className="text-meta text-status-n dark:text-status-n-dark">{error}</Text>
      ) : null}
      {notice ? (
        <Text className="text-meta text-status-c dark:text-status-c-dark">{notice}</Text>
      ) : null}

      <View className="gap-2">
        <Button label="Log in" onPress={submit} loading={busy} disabled={!canSubmit} />
        <Button label="Forgot password" variant="ghost" onPress={forgot} disabled={busy} />
      </View>

      <SwitchLink
        prompt="No account yet?"
        action="Create one"
        onPress={() => router.replace('/register')}
      />
    </AuthScreenShell>
  );
}
