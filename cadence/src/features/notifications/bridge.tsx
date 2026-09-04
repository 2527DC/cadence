// The one piece of P11 the root layout mounts. P11.
//
// It renders nothing. It does two jobs that have to happen once, high up, and outside
// any screen:
//
//   1. On app start, make the scheduled notifications match the saved preferences.
//   2. When one is tapped, go where it points — from a cold start as well as a warm one.
//
// The cold start is the case that is easy to get wrong. A notification that launches
// the app arrives before React has mounted, before the navigator exists, and before the
// session has been read back out of the keychain. useLastNotificationResponse() holds
// on to it, so the response is still there when this effect finally has somewhere to
// send it — and the three guards below are exactly those three conditions.

import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { PLANNER_HREF, reviewHref } from './routes';
import { deliveredAtMs, parseReminderPayload, weekToReview } from './schedule';
import { initialiseReminders } from './store';

export function NotificationsBridge() {
  const { session } = useAuth();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const response = Notifications.useLastNotificationResponse();

  // Reschedule on every launch. applySchedule() cancels by identifier before it
  // schedules, so this converges on two notifications rather than accumulating.
  useEffect(() => {
    void initialiseReminders();
  }, []);

  const navigationReady = Boolean(navigationState?.key);

  useEffect(() => {
    if (!response) return;
    // Signed out, still restoring, or the navigator has not mounted: hold the response
    // rather than dropping it. The hook keeps handing it back until it is cleared, so
    // this effect simply runs again once the missing piece arrives.
    if (!session || !navigationReady) return;
    // A tap on the notification body, not on some action button that does not exist.
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const payload = parseReminderPayload(response.notification.request.content.data);
    if (!payload) return;

    // Clear before navigating. Without this the same response is handed back on every
    // remount — including the one this navigation causes — and the app would spring
    // back to the review every time you tried to leave it.
    Notifications.clearLastNotificationResponse();

    if (payload.kind === 'plan') {
      router.push(PLANNER_HREF);
      return;
    }

    // The week the notification was *delivered* in, not the week it is being read in.
    // Tapping Sunday's banner on Monday morning still opens the week it was about.
    const deliveredAt = new Date(deliveredAtMs(response.notification.date, Date.now()));
    router.push(reviewHref(weekToReview(deliveredAt)));
  }, [response, session, navigationReady, router]);

  return null;
}
