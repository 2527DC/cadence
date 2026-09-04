// The shared shell for Log in and Create account.
//
// One component for both, because the two screens differ only in their title, their
// button, and whether a password is being confirmed. Two near-identical files drift:
// the validation gets fixed on one and not the other, and a user hits a rule on sign-up
// that log-in does not enforce.

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';

const INPUT =
  'min-h-[48px] rounded-card border border-border bg-surface px-4 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

/**
 * Supabase's default minimum is 6. Eight is a small, free improvement, and the only
 * rule imposed here: length is the one password rule that reliably helps. Complexity
 * requirements push people toward `Passw0rd!` and a sticky note.
 *
 * The server is still the authority — if the project has a stronger policy set, its
 * error is shown verbatim.
 */
export const MIN_PASSWORD = 8;

export const looksLikeEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());

export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
  editable,
  onSubmitEditing,
  textContentType,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  /** iOS uses this to offer the keychain and to suggest a strong password. */
  textContentType?: 'password' | 'newPassword';
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text variant="micro" className="uppercase tracking-wider">
          {label}
        </Text>
        {/* Typing a password blind on a phone keyboard is how people end up locked
            out of their own journal. */}
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
        >
          <Text variant="micro" className="text-accent dark:text-accent-dark">
            {visible ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      </View>

      <TextInput
        className={INPUT}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        autoComplete={textContentType === 'newPassword' ? 'new-password' : 'current-password'}
        returnKeyType="go"
        autoFocus={autoFocus}
        editable={editable}
        onSubmitEditing={onSubmitEditing}
      />

      {hint ? <Text variant="micro">{hint}</Text> : null}
    </View>
  );
}

export function EmailField({
  value,
  onChangeText,
  editable,
  onSubmitEditing,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  editable?: boolean;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text variant="micro" className="uppercase tracking-wider">
        Email
      </Text>
      <TextInput
        className={INPUT}
        value={value}
        onChangeText={onChangeText}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        inputMode="email"
        returnKeyType="next"
        autoFocus={autoFocus}
        editable={editable}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

export function AuthScreenShell({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="bg-bg dark:bg-bg-dark flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-gutter py-10"
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="title">Cadence</Text>
          <Text variant="meta" className="mt-2">
            A week you commit to, and a record that cannot be edited afterwards.
          </Text>

          <Card className="mt-8">
            <Text variant="heading">{heading}</Text>
            <Text variant="meta" className="mt-1">
              {subheading}
            </Text>
            <View className="mt-5 gap-4">{children}</View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The link between the two screens, styled the same on both. */
export function SwitchLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="mt-2 flex-row justify-center gap-1 py-2">
      <Text variant="meta">{prompt}</Text>
      <Text variant="meta" className="text-accent dark:text-accent-dark font-semibold">
        {action}
      </Text>
    </Pressable>
  );
}

export { INPUT };
