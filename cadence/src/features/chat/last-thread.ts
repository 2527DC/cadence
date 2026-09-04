// Which thread the tab opens on. P08: "the last-used thread, not the list".
//
// AsyncStorage rather than the query cache: this is a preference of the device,
// not data about the user, and it should not be cleared with the cache on sign-out
// or refetched from anywhere. Every call swallows its error — a lost preference
// means opening on the daily log, which is what it would have been anyway.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSelection, serializeSelection, type ThreadSelection } from './model';

const KEY = 'cadence.chat.last-thread.v1';

export async function loadLastThread(): Promise<ThreadSelection> {
  try {
    return parseSelection(await AsyncStorage.getItem(KEY));
  } catch {
    return parseSelection(null);
  }
}

export async function rememberLastThread(selection: ThreadSelection): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, serializeSelection(selection));
  } catch {
    // Nothing to do. The next open lands on the daily log.
  }
}
