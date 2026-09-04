import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { startNetworkSync } from '@/features/sync/network';
import { resumeOutbox, setupOutbox } from '@/features/sync/outbox-setup';
import { SyncBanner } from '@/features/sync/sync-banner';
import { persistOptions, queryClient } from '@/lib/query-client';

// Hold the splash screen until we know whether there is a session. Without this the
// sign-in screen appears for a frame on every cold start, even when signed in —
// which reads as "it logged me out again" rather than "it is still loading".
void SplashScreen.preventAutoHideAsync();

// Register the replayable mutations before anything can hydrate the persisted cache.
// A mutation that was queued offline and survived a restart is rebuilt from what is
// registered here; hydrate it first and it comes back with no function to run.
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

    const inTabs = segments[0] === '(tabs)';

    if (!session && inTabs) {
      router.replace('/sign-in');
    } else if (session && !inTabs) {
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
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
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
