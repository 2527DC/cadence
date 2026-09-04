// What the app shows when a screen throws. P12.
//
// The failure mode this exists to prevent is the white screen: a render error inside
// a route unmounts the tree above it and leaves nothing, with no message and no way
// back. On a phone, with no console open, that is indistinguishable from the app
// being broken forever — and the honest thing to say is what went wrong and offer to
// try again.
//
// Two boundaries, because they run in different worlds:
//
//   * `RootErrorBoundary` is exported as `ErrorBoundary` from `app/_layout.tsx`, so
//     expo-router wraps it *outside* every provider. It cannot use React Query, the
//     auth session, the safe-area context or anything else that is mounted below it,
//     and it deliberately does not use NativeWind either — if the styling pipeline is
//     what failed, a className-styled fallback would fail with it. Plain inline
//     styles, read straight from the same tokens as tailwind.config.js.
//   * `ScreenErrorBoundary` is exported as `ErrorBoundary` from each route, so one
//     bad screen leaves the tab bar and the other three tabs alive. It sits inside
//     the providers and uses the ui.tsx primitives like everything else.
//
// Neither one loses data. Every write in this app is an outbox mutation persisted to
// disk before it is attempted (src/lib/outbox.ts), so a crash mid-write is replayed
// on the next launch rather than dropped. The copy says so, because the first thing
// anyone assumes when an app dies is that they lost what they just wrote.

import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';

import { Button, Card, Text as UIText } from '@/components/ui';

// The same values as the `bg` / `surface` / `border` / `ink` / `muted` / `accent`
// tokens in tailwind.config.js. Repeated as literals on purpose: this component has
// to render when the style pipeline is the thing that broke.
const PALETTE = {
  light: {
    bg: '#FBFBFD',
    surface: '#FFFFFF',
    border: '#E4E7EC',
    ink: '#12151A',
    muted: '#667085',
    accent: '#3B6FF5',
  },
  dark: {
    bg: '#0E1116',
    surface: '#161A21',
    border: '#2A313C',
    ink: '#F2F4F8',
    muted: '#98A2B3',
    accent: '#6E97FF',
  },
} as const;

function messageOf(error: Error): string {
  const text = error?.message?.trim();
  return text && text.length > 0 ? text : 'The app hit an error with no message.';
}

/**
 * The last line of defence. Rendered outside every provider, so it depends on nothing
 * but React Native itself.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? PALETTE.dark : PALETTE.light;

  // The root layout holds the splash screen up until the session has been read. A
  // throw before that point means `hideAsync` is never reached, and the splash would
  // sit on top of this — which is the white screen again, just blue. Hiding it here is
  // what makes "never a white screen" true for a crash during startup.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 48,
        }}>
        <Text
          style={{ color: c.muted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
          Something broke
        </Text>
        <Text style={{ color: c.ink, fontSize: 28, fontWeight: '700', marginTop: 6 }}>
          Cadence could not draw this screen
        </Text>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 10 }}>
          Nothing you wrote has been lost. Every task, note and message is queued on this device
          before it is sent, so anything unsent is still here and goes out on the next launch.
        </Text>

        <View
          style={{
            marginTop: 20,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface,
            padding: 14,
          }}>
          <Text style={{ color: c.ink, fontSize: 14, lineHeight: 20 }} selectable>
            {messageOf(error)}
          </Text>
          {/* The stack is worth having on the phone during development and is noise
              in a build, where the message alone is what a person can act on. */}
          {__DEV__ && error?.stack ? (
            <Text
              style={{ color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 10 }}
              selectable>
              {error.stack}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityHint="Reloads the screen that failed"
          onPress={() => void retry()}
          style={{
            marginTop: 20,
            minHeight: 48,
            borderRadius: 14,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Try again</Text>
        </Pressable>

        <Text style={{ color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 14 }}>
          If it fails again, close the app and reopen it. The record on the server is unaffected —
          nothing here can delete or rewrite it.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * The per-route boundary. One tab throwing must not take the other three with it, so
 * every screen exports this and keeps the failure inside its own tab.
 */
export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="bg-bg dark:bg-bg-dark flex-1 justify-center">
      <ScrollView
        contentContainerClassName="px-gutter py-10"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <Card>
          <UIText variant="micro" className="tracking-wider uppercase">
            This screen stopped
          </UIText>
          <UIText variant="heading" className="mt-1">
            Something on this screen threw
          </UIText>
          <UIText variant="meta" className="mt-2">
            The rest of the app is still running — the other tabs work. Nothing you wrote is lost;
            unsent writes are queued on this device.
          </UIText>

          <View className="border-border dark:border-border-dark mt-4 pt-3 border-t">
            <UIText className="text-status-n dark:text-status-n-dark" selectable>
              {messageOf(error)}
            </UIText>
          </View>

          <Button label="Try again" className="mt-5" onPress={() => void retry()} />
        </Card>
      </ScrollView>
    </View>
  );
}
