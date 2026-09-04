// The reminder settings, shared between the launch hook and the settings UI. P11.
//
// Two things need the same answer at the same time: the bridge in the root layout,
// which reschedules on app start, and the toggles wherever they are shown. If each
// loaded its own copy from AsyncStorage they would disagree the moment one of them
// wrote — the switch would flip back on the next render, or the schedule would be
// rebuilt from stale preferences.
//
// So there is one module-level value with a subscriber list, read through
// useSyncExternalStore. That is a lot smaller than a context provider for something
// with three booleans in it, and it works from outside React, which is what
// initialiseReminders() needs.

import { useSyncExternalStore } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  withReminder,
  type ReminderKind,
  type ReminderPrefs,
} from './schedule';
import {
  applySchedule,
  permissionState,
  requestPermission,
  type PermissionState,
} from './reminders';

export type ReminderState = {
  prefs: ReminderPrefs;
  permission: PermissionState;
  /** False until the first load finishes. The UI shows nothing rather than a wrong switch. */
  loaded: boolean;
};

let state: ReminderState = {
  prefs: DEFAULT_PREFS,
  permission: 'undetermined',
  loaded: false,
};

const listeners = new Set<() => void>();

function set(next: Partial<ReminderState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): ReminderState {
  return state;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function readPrefs(): Promise<ReminderPrefs> {
  try {
    return parsePrefs(await AsyncStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    // A cleared or corrupt store is not an error worth reporting. The defaults are
    // both reminders on, which is what a first run gets anyway.
    return DEFAULT_PREFS;
  }
}

async function writePrefs(prefs: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // The toggle still holds for this session; it just will not survive a restart.
  }
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

let started: Promise<void> | null = null;

/**
 * Load the preferences, ask the OS what it has already decided, and make the schedule
 * match. Runs once per app process.
 *
 * It deliberately does **not** request permission. A permission prompt on launch, with
 * no explanation on screen behind it, is the one that gets refused — and iOS only ever
 * asks once, so a refusal there is permanent. The ask lives next to the sentence that
 * explains it, in <ReminderSettings />.
 *
 * The promise is cached rather than a boolean flag so that two callers racing on a
 * fast remount wait for the same work instead of scheduling twice.
 */
export function initialiseReminders(): Promise<void> {
  if (started) return started;
  started = (async () => {
    const [prefs, permission] = await Promise.all([readPrefs(), permissionState()]);
    set({ prefs, permission, loaded: true });
    await applySchedule(prefs, permission);
  })();
  return started;
}

// ---------------------------------------------------------------------------
// Changing things
// ---------------------------------------------------------------------------

/**
 * Turn one reminder on or off. The other is untouched — OQ-10 asks for two independent
 * switches, not one "notifications" master toggle.
 *
 * The state moves first so the switch responds at the tap; the storage write and the
 * reschedule follow. If the reschedule fails there is nothing to roll back: the
 * preference is still what the person asked for, and the next launch applies it again.
 */
export async function setReminderEnabled(kind: ReminderKind, enabled: boolean): Promise<void> {
  const prefs = withReminder(state.prefs, kind, enabled);
  set({ prefs });
  await writePrefs(prefs);
  await applySchedule(prefs, state.permission);
}

/**
 * Ask the OS for permission, once, and schedule whatever the preferences already say.
 *
 * `askedPermission` is stored whatever the answer is. iOS resolves every request after
 * the first instantly with the old answer, so without remembering this the settings
 * screen would offer a button that silently does nothing forever. With it, a refusal
 * turns into an explanation and a link to Settings instead.
 */
export async function askForReminderPermission(): Promise<PermissionState> {
  const permission = await requestPermission();
  const prefs = { ...state.prefs, askedPermission: true };
  set({ permission, prefs });
  await writePrefs(prefs);
  await applySchedule(prefs, permission);
  return permission;
}

/** Re-read the OS permission, for when the app comes back from the Settings app. */
export async function refreshReminderPermission(): Promise<void> {
  const permission = await permissionState();
  if (permission === state.permission) return;
  set({ permission });
  await applySchedule(state.prefs, permission);
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useReminderState(): ReminderState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
