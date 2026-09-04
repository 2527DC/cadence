import '@/global.css';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
// As of SDK 56 expo-router no longer sits on top of react-navigation — it vendors its
// own copy. Importing @react-navigation/native alongside it loads a second, separate
// navigation library and Metro refuses to bundle, which is the right call: two
// navigators sharing one screen tree fail in ways that are very hard to read.
// The theme API is re-exported from expo-router itself.
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootErrorBoundary } from '@/components/error-boundary';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
// Imported by its own path rather than through the feature's barrel: the barrel also
// exports the review screen's cards, which pull in the whole voice module, and none of
// that belongs in the startup graph.
import { NotificationsBridge } from '@/features/notifications/bridge';
import { startNetworkSync } from '@/features/sync/network';
import { resumeOutbox, setupOutbox } from '@/features/sync/outbox-setup';
import { SyncBanner } from '@/features/sync/sync-banner';
import { persistOptions, queryClient } from '@/lib/query-client';

/**
 * The root boundary. expo-router wraps this layout route in it, which puts it outside
 * every provider below — so a throw in the query client, the auth provider, the theme
 * or the navigator itself still draws something a person can read and retry, instead
 * of a white screen. See src/components/error-boundary.tsx for why it uses no
 * NativeWind classes.
 */
export { RootErrorBoundary as ErrorBoundary };

// Hold the splash screen until we know whether there is a session. Without this the
// sign-in screen appears for a frame on every cold start, even when signed in —
// which reads as "it logged me out again" rather than "it is still loading".
void SplashScreen.preventAutoHideAsync();

// Register the replayable mutations before anything can hydrate the persisted cache.
// A mutation that was queued offline and survived a restart is rebuilt from what is
// registered here; hydrate it first and it comes back with no function to run.
// Tasks, goals, chat sends and weekly reviews all register inside setupOutbox().
setupOutbox();

// Runs once, after the persisted cache has been read back — the earliest moment a
// queued write from a previous run exists again.
function onCacheRestored() {
  void resumeOutbox();
}

/**
 * The route guard.
 *
 * Rendered inside AuthProvider so it can watch the session, and inside the navigator
 * so that `router.replace` has somewhere to go. Redirecting during the first render
 * of a layout is what produces expo-router's "navigate before mounting" warning, so
 * this runs in an effect instead.
 */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, isRestoring } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isRestoring) return;

    // The guard is about the sign-in screen, not about the tabs. Signed out, every
    // route but sign-in is off limits; signed in, sign-in is the only one that is.
    //
    // P11 note: this used to bounce anything outside `(tabs)` back to `/`, which meant
    // /task/[id] and /review/[week] could not be opened at all — a notification tap
    // landed on the review and was immediately replaced by the planner. Deep-linking
    // to the review is a P11 acceptance criterion, so the condition is stated in terms
    // of the auth flow instead.
    // Both auth screens count. Without /register here, tapping "Create one" would be
    // bounced straight back to /sign-in and the account could never be made.
    const inAuthFlow = segments[0] === 'sign-in' || segments[0] === 'register';

    if (!session && !inAuthFlow) {
      router.replace('/sign-in');
    } else if (session && inAuthFlow) {
      router.replace('/');
    }

    void SplashScreen.hideAsync();
  }, [session, isRestoring, segments, router]);

  // Nothing is rendered until the keychain has been read. The splash screen is still
  // up at this point, so this is not a blank frame.
  if (isRestoring) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Online/offline and foreground/background, so paused writes know when to resume.
  useEffect(() => startNetworkSync(), []);

  return (
    // GestureHandlerRootView has to be the outermost view or gestures silently do
    // nothing on iOS — no error, they just never fire.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
          onSuccess={onCacheRestored}>
          <AuthProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <BottomSheetModalProvider>
                <RouteGuard>
                  <View style={{ flex: 1 }}>
                    <SyncBanner />
                    {/* Renders nothing. Reschedules the two reminders on start, and
                        routes a notification tap — including the one that launched the
                        app from cold. Inside the guard so it has a session and a
                        mounted navigator to work with. */}
                    <NotificationsBridge />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
                      <Stack.Screen name="register" options={{ animation: 'fade' }} />
                    </Stack>
                  </View>
                </RouteGuard>
              </BottomSheetModalProvider>
            </ThemeProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
