// Which thread the tab opens on. P08: "the last-used thread, not the list".
//
// AsyncStorage rather than the query cache: this is a preference, not data about the
// user, and it survives a refetch. Every call swallows its error — a lost preference
// means opening on the daily log, which is what it would have been anyway.
//
// It is not, however, a preference of the *device*. What it holds is a goal id and a
// goal title, and a goal belongs to one account: read back under a different one it
// would put the previous user's private goal title on screen and open a thread against
// their goal (the foreign key is checked by the system, which does not apply RLS). So
// the key is namespaced by user id, and one account's remembered thread is invisible to
// the next. No id, no preference — the daily log, which is where a first open lands.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSelection, serializeSelection, DAILY_LOG, type ThreadSelection } from './model';

const KEY_PREFIX = 'cadence.chat.last-thread.v1';

function keyFor(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export async function loadLastThread(userId: string): Promise<ThreadSelection> {
  if (!userId) return DAILY_LOG;
  try {
    return parseSelection(await AsyncStorage.getItem(keyFor(userId)));
  } catch {
    return parseSelection(null);
  }
}

export async function rememberLastThread(
  userId: string,
  selection: ThreadSelection,
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(keyFor(userId), serializeSelection(selection));
  } catch {
    // Nothing to do. The next open lands on the daily log.
  }
}
