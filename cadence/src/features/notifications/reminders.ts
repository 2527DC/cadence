// Talking to the OS about the two reminders. P11.
//
// Local notifications only. Remote push needs a native build and an APNs key, and this
// app runs in Expo Go (OQ-6) — but it also does not need push: the two things it wants
// to say are known a week in advance and are the same for the only user there is.
//
// Everything in here is idempotent by construction. Rescheduling cancels each reminder
// by its own stable identifier first, so launching the app a hundred times leaves two
// scheduled notifications, not two hundred. That is the one bug this kind of code
// always has, and the cancel-first order is the whole defence against it.
//
// Every call is wrapped: notifications are a nicety, and a phone that refuses to
// schedule one must not stop the app from starting. In Expo Go on Android, SDK 53
// removed the notifications module entirely, so these calls throw there and are
// swallowed — the review screen works exactly the same, just unprompted.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { APP_TIMEZONE } from '@/lib/week';

import {
  REMINDERS,
  REMINDER_KINDS,
  deviceLocalClock,
  expoWeekday,
  nextOccurrence,
  reminderPayload,
  type Reminder,
  type ReminderPrefs,
} from './schedule';

/**
 * Show the banner even when the app is open.
 *
 * At module scope because it has to be registered before any notification can arrive,
 * and this module is imported by the bridge that the root layout renders. No badge:
 * an unread count on a journal is a nag, and OQ-10 rules those out.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL_ID = 'cadence-weekly';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

function stateOf(status: Notifications.NotificationPermissionsStatus): PermissionState {
  // iOS provisional authorization delivers quietly rather than not at all, which is
  // still a delivered notification, so it counts as granted here.
  if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** What the OS currently thinks. Never prompts; safe to call on every launch. */
export async function permissionState(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.getPermissionsAsync());
  } catch {
    // No notifications module (Expo Go on Android) or no permissions API. Treat it as
    // a refusal: nothing gets scheduled, and everything else still works.
    return 'denied';
  }
}

/**
 * Ask, once.
 *
 * Only ever called from a screen that has just explained why, in words, above the
 * button — never on launch. iOS shows its system prompt exactly once per install, and
 * every later request resolves instantly with the stored answer, so a caller must not
 * treat this as retryable. The stored `askedPermission` flag in the preferences is
 * what stops the app trying again on the next launch.
 */
export async function requestPermission(): Promise<PermissionState> {
  try {
    return stateOf(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  } catch {
    return 'denied';
  }
}

/**
 * The trigger for one reminder.
 *
 * On iOS a calendar trigger carries its own timezone, so "Sunday 20:00 Asia/Kolkata"
 * is stated to the OS exactly as written and stays correct across travel and across
 * whatever the device's clock is set to. That is the reason this is a calendar trigger
 * and not a weekly one, and it is why the iPhone — the platform this app is built for
 * — gets the right behaviour without any conversion at all.
 *
 * Android's weekly trigger has no timezone field, so there the next IST occurrence is
 * computed as an absolute instant and expressed in the device's own clock. That is
 * correct at the moment of scheduling and drifts only if the device changes timezone
 * without the app being opened, which the reschedule on next launch then repairs.
 */
function triggerFor(reminder: Reminder): Notifications.NotificationTriggerInput {
  if (Platform.OS === 'ios') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      repeats: true,
      timezone: APP_TIMEZONE,
      weekday: expoWeekday(reminder.isoWeekday),
      hour: reminder.hour,
      minute: reminder.minute,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    channelId: ANDROID_CHANNEL_ID,
    ...deviceLocalClock(nextOccurrence(reminder)),
  };
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Weekly rhythm',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // Expo Go on Android has no notifications module at all. Nothing to do.
  }
}

/**
 * Make what is scheduled match what the preferences say. Safe to call on every launch.
 *
 * Cancel first, always — including for a reminder that is about to be rescheduled, and
 * including when permission was refused. Without that, every launch would add another
 * copy of the same notification, and the user would eventually get eight Sunday
 * banners at once. With it, this function is a statement of the desired end state
 * rather than an instruction to add something.
 */
export async function applySchedule(
  prefs: ReminderPrefs,
  permission: PermissionState,
): Promise<void> {
  await ensureAndroidChannel();

  for (const kind of REMINDER_KINDS) {
    const reminder = REMINDERS[kind];
    try {
      await Notifications.cancelScheduledNotificationAsync(reminder.id);
    } catch {
      // Nothing was scheduled under that id, or there is no module. Either is fine.
    }

    if (permission !== 'granted' || !prefs[kind]) continue;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
          title: reminder.title,
          body: reminder.body,
          // Only the kind. The week is derived from the delivery time when the tap is
          // handled — see weekToReview() — because a repeating trigger is scheduled
          // once and fires for years.
          data: reminderPayload(kind),
          sound: true,
        },
        trigger: triggerFor(reminder),
      });
    } catch {
      // Scheduling refused. The app is unaffected; the review is still reachable from
      // the dashboard prompt and from the Week screen.
    }
  }
}

/** For the settings screen to show what is actually queued, rather than what it hopes. */
export async function scheduledReminderIds(): Promise<string[]> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map((s) => s.identifier);
  } catch {
    return [];
  }
}
