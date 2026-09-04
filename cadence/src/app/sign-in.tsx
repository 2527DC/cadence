// Email OTP sign-in. P02.
//
// Two steps in one screen: ask for the email, then ask for the six-digit code that
// arrives. No password, so there is nothing to store, leak or forget — and for a
// single-user private journal, a password would be pure friction.

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';

// One bad screen must not take the app with it. expo-router wraps this route in the
// boundary below, so a throw here leaves the tab bar and every other tab alive.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/error-boundary';

const INPUT =
  'min-h-[48px] rounded-card border border-border bg-surface px-4 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

export default function SignInScreen() {
  const { sendCode, verifyCode } = useAuth();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enough to catch a typo, not enough to argue with a valid address. The real
  // check is whether the code arrives.
  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      // On success the auth listener in AuthProvider updates the session and the
      // route guard in _layout moves us to the tabs. Nothing to navigate to here.
      await verifyCode(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not accepted.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-gutter py-10"
          keyboardShouldPersistTaps="handled">
          <Text variant="title">Cadence</Text>
          <Text variant="meta" className="mt-2">
            A week you commit to, and a record that cannot be edited afterwards.
          </Text>

          <Card className="mt-8">
            {step === 'email' ? (
              <View className="gap-3">
                <Text variant="micro" className="tracking-wider uppercase">
                  Step 1 of 2
                </Text>
                <Text variant="heading">What is your email?</Text>
                <Text variant="meta">
                  We send a six-digit code. There is no password to remember.
                </Text>

                <TextInput
                  className={`${INPUT} mt-2`}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  inputMode="email"
                  returnKeyType="send"
                  editable={!busy}
                  onSubmitEditing={() => emailLooksValid && handleSend()}
                />

                <Button
                  label="Send the code"
                  onPress={handleSend}
                  loading={busy}
                  disabled={!emailLooksValid}
                  className="mt-2"
                />
              </View>
            ) : (
              <View className="gap-3">
                <Text variant="micro" className="tracking-wider uppercase">
                  Step 2 of 2
                </Text>
                <Text variant="heading">Enter the code</Text>
                <Text variant="meta">Sent to {email.trim()}. It expires in a few minutes.</Text>

                <TextInput
                  className={`${INPUT} mt-2 text-2xl text-center tracking-[8px]`}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  editable={!busy}
                  autoFocus
                  onSubmitEditing={() => code.length === 6 && handleVerify()}
                />

                <Button
                  label="Sign in"
                  onPress={handleVerify}
                  loading={busy}
                  disabled={code.length !== 6}
                  className="mt-2"
                />
                <Button
                  label="Use a different email"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                />
              </View>
            )}

            {error ? (
              <Text className="mt-4 text-meta text-status-n dark:text-status-n-dark">{error}</Text>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
