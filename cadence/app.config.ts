import type { ExpoConfig } from 'expo/config';

/**
 * Cadence — see doc/00-app-name-options.md for the name decision.
 *
 * NOTE: no `expo-dev-client` here, deliberately. This build runs in Expo Go (OQ-6), so the
 * dependency list must stay inside Expo Go's bundled modules. See the compatibility contract
 * in doc/implementation/pending/P00-project-setup.md before adding anything native.
 */
const config: ExpoConfig = {
  name: 'Cadence',
  slug: 'cadence',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'cadence',
  userInterfaceStyle: 'automatic',

  ios: {
    bundleIdentifier: 'com.bharath.cadence',
    icon: './assets/expo.icon',
    supportsTablet: false,
    infoPlist: {
      // Required from P06 onward for voice notes. Declared now so the string is reviewed
      // once, not written in a hurry the day recording is switched on.
      NSMicrophoneUsageDescription:
        'Cadence records your voice notes so you can speak a closing note instead of typing it. Recordings stay in your own private account.',
      // Not used until P13 (speech-to-text needs a module Expo Go does not ship), but the
      // string belongs with its sibling above.
      NSSpeechRecognitionUsageDescription:
        'Cadence transcribes your voice notes so you can search what you said.',
    },
  },

  android: {
    package: 'com.bharath.cadence',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    // Stores the Supabase session in the iOS keychain rather than AsyncStorage.
    // doc/02-tech-stack.md §3: this is a private journal, so the session token
    // belongs in secure storage.
    'expo-secure-store',
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  // Kept only so `expo config` shows at a glance whether the environment was loaded.
  // The app itself reads process.env.EXPO_PUBLIC_* directly in src/lib/supabase.ts —
  // those are inlined into the bundle at build time, which is the supported path.
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKeyPresent: Boolean(process.env.EXPO_PUBLIC_SUPABASE_KEY),
  },
};

export default config;
