// Create an account. Email and password.
//
// Separate from /sign-in on purpose. A combined screen that silently signs up whoever
// it does not recognise turns one mistyped character into a second, empty account —
// and in an app whose whole promise is a continuous record, that is a bad failure.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
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

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    looksLikeEmail(email) && password.length >= MIN_PASSWORD && confirm === password;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const needsConfirmation = await register(email, password);
      if (needsConfirmation) {
        setCheckEmail(true);
        setBusy(false);
      }
      // Otherwise the project has email confirmation off, a session already exists,
      // and the route guard is about to move us to the tabs. Leave the spinner up.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create the account.';
      setError(
        /already registered/i.test(message)
          ? 'That email already has an account. Log in instead.'
          : message,
      );
      setBusy(false);
    }
  }

  // Sign-up succeeded but the account is not usable until the link is opened. Saying so
  // plainly matters: without this screen the app looks like it did nothing.
  if (checkEmail) {
    return (
      <AuthScreenShell heading="Check your email" subheading="One more step and you are in.">
        <Card>
          <Text variant="meta">
            We sent a confirmation link to{' '}
            <Text className="font-semibold">{email.trim()}</Text>. Open it, then come back
            and log in.
          </Text>
          <Text variant="micro" className="mt-3">
            Nothing arrived? Check spam. The address has to be one you can actually open —
            it is how you get back in if you forget your password.
          </Text>
        </Card>

        <Button label="Go to log in" onPress={() => router.replace('/sign-in')} />
        <SwitchLink
          prompt="Wrong address?"
          action="Start again"
          onPress={() => {
            setCheckEmail(false);
            setPassword('');
            setConfirm('');
          }}
        />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      heading="Create your account"
      subheading="One account, one record. Nothing in it can be deleted later."
    >
      <EmailField value={email} onChangeText={setEmail} editable={!busy} autoFocus />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        textContentType="newPassword"
        editable={!busy}
        hint={tooShort ? `${MIN_PASSWORD - password.length} more to go.` : undefined}
      />

      <PasswordField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Type it again"
        textContentType="newPassword"
        editable={!busy}
        onSubmitEditing={submit}
        hint={mismatch ? 'These two do not match yet.' : undefined}
      />

      {error ? (
        <Text className="text-meta text-status-n dark:text-status-n-dark">{error}</Text>
      ) : null}

      <View className="gap-2">
        <Button label="Create account" onPress={submit} loading={busy} disabled={!canSubmit} />
      </View>

      <SwitchLink
        prompt="Already have an account?"
        action="Log in"
        onPress={() => router.replace('/sign-in')}
      />
    </AuthScreenShell>
  );
}
