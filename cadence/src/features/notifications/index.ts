// Notifications and the weekly review. P11.
//
// What the rest of the app imports:
//
//   <NotificationsBridge />        mounted once in the root layout: reschedules the two
//                                  reminders on start, and routes a notification tap
//                                  from a cold start as well as a warm one
//   <ReviewPrompt weekStart />     the in-app route into the review, for the dashboard.
//                                  Not optional decoration: it is what keeps the ritual
//                                  reachable when notification permission was refused
//   <ReminderSettings />           the two independent toggles, and the permission ask
//   <ReviewAnswer />               "How did this week actually go?" — text or voice
//
// OQ-10 is settled inside schedule.ts: exactly two reminders, Sunday 20:00 and Monday
// 09:00 Asia/Kolkata, and no mechanism for a third.

export { NotificationsBridge } from './bridge';
export { ReminderSettings } from './reminder-settings';
export { ReviewPrompt } from './review-prompt';
export { ReviewAnswer } from './review-answer';

export {
  ClosedSection,
  DraftsSection,
  GoalAttainmentSection,
  LateAddsSection,
  SnapshotCard,
  StillOpenSection,
  WeekNumbersCard,
  type ClosedEntry,
} from './review-sections';

export {
  REVIEW_STATS_VERSION,
  buildReviewStats,
  byClosedAt,
  groupReviewTasks,
  latestEvents,
  parseReviewStats,
  statsDrift,
  type ReviewGoalStat,
  type ReviewGroups,
  type ReviewStats,
} from './review-model';

export { PLANNER_HREF, reviewHref } from './routes';

export {
  DEFAULT_PREFS,
  REMINDERS,
  REMINDER_KINDS,
  weekToReview,
  type Reminder,
  type ReminderKind,
  type ReminderPrefs,
} from './schedule';

export {
  askForReminderPermission,
  initialiseReminders,
  refreshReminderPermission,
  setReminderEnabled,
  useReminderState,
  type ReminderState,
} from './store';

export { type PermissionState } from './reminders';
