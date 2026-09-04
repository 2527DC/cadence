# P09 — Analytics Dashboard

Depends on: P05
Estimate: 3 days (expect it to run long — this is the phase with the most taste in it)
Skills to load: `frontend-design`, `expo-native-ui`, `context7` (for `victory-native`)

---

## Decisions needed in this phase

### OQ-2 (analytics half) — "Kept week"
Decided in P01, and it defines the headline consistency number here. Confirm what was chosen
before building the streak card: rate ≥ threshold **and** at least 3 counted tasks, with empty
weeks breaking the streak.

- [x] Matches what P01 shipped
- [ ] Changed since P01 — update `profiles.streak_threshold` and note it below

### OQ-7 — AI features
Out of scope, but named here so the dashboard does not get built in a way that closes the door:

- Grouping your `N` reasons by meaning rather than by keyword
- A generated weekly summary from your voice notes
- Suggesting a realistic `target_per_week` from your actual history

**Recommendation: none in v1.** Twelve of your own sentences read in a row do the job of the
first one, without a model inventing patterns that are not in the data. Revisit after eight
weeks of real use, when there is data worth analysing.

- [x] Agree — defer all three
- [ ] Want one in v1: ______

---

## Goal
The screen that answers "am I actually consistent?" in under ten seconds.

Reference: [../../05-analytics-spec.md](../../05-analytics-spec.md) — every formula is there.
**Do not invent metrics during implementation.** If you want a new one, add it to the spec
first and justify what decision it drives.

## Prerequisite
Use the app for at least one real week before starting this. Building a dashboard against
seed data produces a dashboard that looks good and tells you nothing.

## Tasks

### API
- [x] `src/api/analytics.ts` querying `v_week_rollup` and `v_goal_progress`
- [x] Streak calculation — decide once: a Postgres function is preferable to client code, so the formula lives in one place
- [x] 12-week series query
- [ ] Day-of-week heatmap query
- [x] Goal reliability query (last 8 weeks)
- [x] React Query hooks, `staleTime` 5 min, all with `select` transforms so components get view-models not raw rows

### Charts
- [ ] Install `victory-native` + `@shopify/react-native-skia` (fall back to `react-native-gifted-charts` if Skia fights you)
- [x] Segmented bar: C / N / NC / OPEN for the current week
- [x] 12-week sparkline of completion rate
- [x] Goal progress bars with the `debt` number
- [ ] Day-of-week heatmap

### Sections, in the order from the spec
- [x] **This week** — segmented bar, rate, counts, days remaining
- [x] **Consistency** — "9 of last 12 weeks kept", streak badge, sparkline
- [x] **NC warning banner** — only rendered when NC > 20%
- [x] **Goals** — progress bars, attainment, debt
- [x] **Not keeping** — the worst-reliability goals, named honestly
- [ ] **When you deliver** — day-of-week heatmap
- [ ] **Recent notes** — last 5, linking to the full notes timeline

### Notes timeline (separate screen)
- [ ] FlashList over `task_status_events` joined to `tasks`
- [ ] Filter by status, goal, date range
- [ ] Voice notes play inline
- [ ] "Your N reasons this month" grouped view

### Edge cases from the spec §7
- [x] No history → "not enough data yet", **never 0%**
- [x] A week of only NC → rate shows "—", not 0%
- [x] In-progress week excluded from streaks
- [x] Archived goals excluded from current view, included in history
- [x] Offline → last cached rollup with an "as of <time>" label

## Acceptance criteria

- [x] Every number matches a hand-calculation against the seed data — verify at least three by hand
- [x] The NC banner appears at 21% and not at 19%
- [x] Empty and first-week states never show a misleading 0%
- [ ] The dashboard loads in under 500ms from cache
- [ ] It is readable on a small phone with no horizontal scrolling
- [ ] Charts are legible in both light and dark mode

## Definition of done
Look at it after your second real week and answer, out loud, without scrolling: *which goal
am I not keeping?* If you cannot, the hierarchy is wrong — cut sections until you can.

## Discipline
The hardest part of this phase is **not** the charts. It is refusing to add the ninth
metric. Every number on this screen competes with every other for attention. When in
doubt, cut.


---
## Completion record
- **Not complete: 3 of 6 acceptance criteria met, as of 2026-09-04.** The three that
  are met are the ones that decide whether the app lies; the three that are not all
  need the phone.
- Decisions made:
  - **OQ-2 — unchanged from P01.** A kept week is `completion_rate >=
    profiles.streak_threshold` (0.70) **and** at least 3 counted tasks, and a week with
    no finalized tasks at all breaks the streak.
  - **OQ-7 — all three AI features deferred.** Nothing on this screen is generated. The
    dashboard's job is to show twelve of your own sentences in a row, and a model
    inventing a pattern that is not in the data is the exact failure this app cannot
    afford.
  - **The streak is computed in TypeScript, not in Postgres** — the plan preferred a
    database function. See deviation 1; this one is load-bearing.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest`.
  - `src/features/analytics/metrics.test.ts` is the phase's real proof. It contains a
    `describe('the seed data on 2026-08-31')` block whose expectations were worked out
    by hand from `supabase/seed.sql` and then asserted — the streak, the kept-weeks
    ratio, the 12-week classification, this week's six open tasks with an *undefined*
    rate and three days left on a Thursday, per-goal debt over three finished weeks,
    reliability over the last eight finished weeks, "not kept, worst first, ties broken
    by debt", and the week-over-week comparison. That is criterion 1, several times
    over.
  - `it('raises the NC banner at 21% and not at 19%')` — criterion 2, written as the
    criterion.
  - `it('reports nothing to divide on the first week ever, never 0%')` and
    `it('is undefined, not zero, with nothing counted')` — criterion 3.
  - The edge cases from spec §7 are each their own test: a missing week after history
    began counts as not kept while the weeks before it are `before_history`; an only-NC
    week is stepped over without breaking the streak and is left out of both sides of
    the consistency ratio; the week in progress is excluded even when it already
    qualifies; a goal stops counting at `end_week`; the offline "as of <time>" label
    renders from `dataUpdatedAt` when the query is paused or errored with data in hand.
- **Not verified on a physical device**, and no iOS bundle was produced in this run.
  Nothing here has been read at arm's length on a phone, which is the only way to
  answer the phase's own definition of done.

### Deviations from plan
1. **The streak is client-side, and that is the correct answer, not a shortcut.** "A
   week with zero finalized tasks breaks the streak" cannot live in `v_week_rollup`,
   because such a week produces **no row at all**. Any calculation that walks the rows
   the view returns would make "stop planning entirely" the cheapest way to protect a
   streak — the exact behaviour this app exists to catch. `computeStreak()` generates
   the full calendar series backwards and treats a missing week as broken.
   `it('is broken by a week with no row at all — stopping planning does not protect
   it')` is the test that pins it.
2. **No chart library. No `victory-native`, no Skia.** Skia is outside Expo Go's
   bundled modules and would red-screen the app at import (P00). Every chart in
   `features/analytics/charts.tsx` is a `View` with a flex or a width, which has the
   side effect of keeping the numbers honest: no smoothing, no interpolation, nothing
   drawn that is not a number off a view.
3. **View-models are built in `metrics.ts`, not in React Query `select` transforms.**
   Same effect — components never touch a raw row — with the advantage that every
   formula is a pure function with a unit test rather than a closure inside a hook.
   `staleTime` of five minutes is set once globally in `src/lib/query-client.ts`.
4. **`late_add` gets its own split rather than a footnote.** `lateAddSplit()` reports
   the rate with and without late adds and says so out loud when they move it by more
   than ten points. That was not asked for; it is the metric most likely to be gamed.

### Follow-ups created
None as files. Four things in this phase are genuinely unbuilt and are listed in the
Progress note below.

---
## Progress — 2026-09-04 (the numbers are right; two sections and a screen are missing)

Built and tested: **This week**, **Consistency** (kept-weeks ratio, streak, 12-week
bars), the **guardrail banners** (NC, empty week, thin week, late adds — ordered NC
first), **Goals** with progress and debt, **Not keeping**, **week-over-week**, and the
recent-weeks list. Every formula comes from `metrics.ts` and nothing is computed inline
on the screen.

Not built:

- [ ] **Day-of-week heatmap** — the query, the chart and the "When you deliver"
      section. `planned_for` is now set by the planner, so the data exists; nothing
      reads it this way yet.
- [ ] **Recent notes** — last 5 closing notes on the dashboard.
- [ ] **The notes timeline screen** — a list over `task_status_events` joined to
      `tasks`, filterable by status, goal and date, with voice notes playing inline and
      a "your N reasons this month" grouped view. This is the largest single piece of
      P09 still outstanding, and it is the one the weekly review partly substitutes for
      today (`app/review/[week].tsx` shows every close of a week with its note).

Not verified, and unverifiable without the phone:

- [ ] The dashboard loads in under 500ms from cache.
- [ ] It is readable on a small phone with no horizontal scrolling.
- [ ] Charts are legible in both light and dark mode. Every `bg-*`, `text-*` and
      `border-*` in the app now has a `dark:` pair — audited mechanically in P12, 184
      utility uses, zero gaps — so the colours are *defined* in both themes. Whether
      they read well is a thing you look at.
