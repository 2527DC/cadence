import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { persister, queryClient } from '@/lib/query-client';

// Hold the splash screen until we know whether there is a session. Without this the
// sign-in screen appears for a frame on every cold start, even when signed in —
// which reads as "it logged me out again" rather than "it is still loading".
void SplashScreen.preventAutoHideAsync();

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

  return (
    // GestureHandlerRootView has to be the outermost view or gestures silently do
    // nothing on iOS — no error, they just never fire.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <AuthProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <BottomSheetModalProvider>
                <RouteGuard>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
                  </Stack>
                </RouteGuard>
              </BottomSheetModalProvider>
            </ThemeProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
