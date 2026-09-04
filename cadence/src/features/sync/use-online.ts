// Is the phone online, as far as React Query believes.
//
// The belief comes from expo-network via startNetworkSync() in ./network.ts, and it
// is the same one the outbox uses to decide whether to pause. Use it for the "as of
// <time>" label on the dashboard and anywhere else a screen should say it is showing
// cached rows, so the UI and the queue never disagree about whether we are offline.

import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
