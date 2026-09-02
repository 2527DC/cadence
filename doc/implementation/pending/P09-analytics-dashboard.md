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

- [ ] Matches what P01 shipped
- [ ] Changed since P01 — update `profiles.streak_threshold` and note it below

### OQ-7 — AI features
Out of scope, but named here so the dashboard does not get built in a way that closes the door:

- Grouping your `N` reasons by meaning rather than by keyword
- A generated weekly summary from your voice notes
- Suggesting a realistic `target_per_week` from your actual history

**Recommendation: none in v1.** Twelve of your own sentences read in a row do the job of the
first one, without a model inventing patterns that are not in the data. Revisit after eight
weeks of real use, when there is data worth analysing.

- [ ] Agree — defer all three
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
- [ ] `src/api/analytics.ts` querying `v_week_rollup` and `v_goal_progress`
- [ ] Streak calculation — decide once: a Postgres function is preferable to client code, so the formula lives in one place
- [ ] 12-week series query
- [ ] Day-of-week heatmap query
- [ ] Goal reliability query (last 8 weeks)
- [ ] React Query hooks, `staleTime` 5 min, all with `select` transforms so components get view-models not raw rows

### Charts
- [ ] Install `victory-native` + `@shopify/react-native-skia` (fall back to `react-native-gifted-charts` if Skia fights you)
- [ ] Segmented bar: C / N / NC / OPEN for the current week
- [ ] 12-week sparkline of completion rate
- [ ] Goal progress bars with the `debt` number
- [ ] Day-of-week heatmap

### Sections, in the order from the spec
- [ ] **This week** — segmented bar, rate, counts, days remaining
- [ ] **Consistency** — "9 of last 12 weeks kept", streak badge, sparkline
- [ ] **NC warning banner** — only rendered when NC > 20%
- [ ] **Goals** — progress bars, attainment, debt
- [ ] **Not keeping** — the worst-reliability goals, named honestly
- [ ] **When you deliver** — day-of-week heatmap
- [ ] **Recent notes** — last 5, linking to the full notes timeline

### Notes timeline (separate screen)
- [ ] FlashList over `task_status_events` joined to `tasks`
- [ ] Filter by status, goal, date range
- [ ] Voice notes play inline
- [ ] "Your N reasons this month" grouped view

### Edge cases from the spec §7
- [ ] No history → "not enough data yet", **never 0%**
- [ ] A week of only NC → rate shows "—", not 0%
- [ ] In-progress week excluded from streaks
- [ ] Archived goals excluded from current view, included in history
- [ ] Offline → last cached rollup with an "as of <time>" label

## Acceptance criteria

- [ ] Every number matches a hand-calculation against the seed data — verify at least three by hand
- [ ] The NC banner appears at 21% and not at 19%
- [ ] Empty and first-week states never show a misleading 0%
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
