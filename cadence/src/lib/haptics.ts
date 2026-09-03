// Haptics, in one place so that the same event never feels different in two screens.
//
// Every call is fire-and-forget and swallows its error: haptics are unavailable on a
// simulator and on some devices, and a missing buzz must never break a save.

import * as Haptics from 'expo-haptics';

/** A task was committed, or closed. Something became permanent. */
export const hapticCommit = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

/** The database refused something. */
export const hapticReject = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

/** A selection changed — a status picked, a chip tapped. */
export const hapticSelect = () => void Haptics.selectionAsync().catch(() => {});

/** A destructive affordance was reached, e.g. a draft swiped away. */
export const hapticWarn = () =>
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
