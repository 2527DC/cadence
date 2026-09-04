// Tells React Query when the phone is online and when the app is in front.
//
// React Query ships listeners for a browser — `window` online/offline events and
// `document` visibility — neither of which exists in React Native. Left unwired, it
// believes the app is always online and always focused, so a paused write would
// never learn that the network came back. This swaps in expo-network and AppState.
//
// Two of the four flush triggers in doc/04-architecture.md §3 live here: "network
// regained" and "app foreground". The query client resumes paused mutations on both
// events itself; all this does is make the events fire. ("After any successful
// mutation" is the scope queue's runNext; the periodic background task is out of
// reach in Expo Go and is noted as not done in the phase record.)

import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { isOnlineState } from '@/lib/outbox';

function readNetworkState(setOnline: (online: boolean) => void): void {
  Network.getNetworkStateAsync()
    .then((state) => setOnline(isOnlineState(state)))
    // Not knowing is not the same as being offline. Leave the current belief alone.
    .catch(() => {});
}

/**
 * Call once from the root layout. Returns the teardown.
 */
export function startNetworkSync(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) => setOnline(isOnlineState(state)));
    readNetworkState(setOnline);
    return () => sub.remove();
  });

  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setFocused(active);
      // The network listener may not fire while the app was suspended, so coming
      // back to the foreground re-reads the state instead of trusting the last event.
      if (active) readNetworkState((online) => onlineManager.setOnline(online));
    });
    return () => sub.remove();
  });

  return () => {
    // Back to "always online, always focused" — the library's own defaults.
    onlineManager.setEventListener(() => undefined);
    focusManager.setEventListener(() => undefined);
  };
}
