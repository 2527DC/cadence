// Where the two reminders lead. P11.
//
// One cast, in one place, for one reason: expo-router generates its Href union into
// .expo/types/router.d.ts by running the dev server, and this phase is code-only — no
// bundler, no dev server (see the run's constraints). So /review/[week] exists as a
// file but is not yet in the generated union, and every router.push to it would be a
// type error.
//
// Rather than leaving that error scattered across the screens, it is contained here.
// The moment the types are regenerated — the next time anyone runs `expo start` — this
// cast becomes redundant and can be deleted without touching a single call site.

import type { Href } from 'expo-router';

import type { DateString } from '@/lib/week';

/** The weekly review for one week. `weekStart` is always a Monday. */
export function reviewHref(weekStart: DateString): Href {
  return `/review/${weekStart}` as Href;
}

/** The planner — the Week tab, which is the app's index route. */
export const PLANNER_HREF = '/' as Href;
