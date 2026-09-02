# P11 — Notifications and Weekly Review

Depends on: P09
Estimate: 1 day
Skills to load: `context7` (for `expo-notifications`), `frontend-design`

---

## Decisions needed in this phase

### OQ-10 — Notifications
**Recommendation: exactly two.** Sunday 20:00 IST for the weekly review, Monday 09:00 IST to
plan the week. Nothing else — a tracker that nags stops being opened.

- [ ] Accept — two only
- [ ] Also a daily reminder at: ______
- [ ] None at all

---

## Goal
The Sunday ritual that makes the whole thing a practice rather than a database.

## Tasks

### Notifications
- [ ] `expo-notifications` set up, permission requested with context
- [ ] Sunday 20:00 IST — "Time to review your week" (deep links to `/review/<week>`)
- [ ] Monday 09:00 IST — "Plan this week" (deep links to the planner)
- [ ] **Exactly these two.** No streak nags, no daily reminders (OQ-10)
- [ ] Toggle each independently in Settings
- [ ] Local scheduling — no push infrastructure needed for a single-user app

### Weekly review screen
- [ ] Route `app/review/[week].tsx`
- [ ] The week's numbers: rate, C / N / NC counts, per-goal attainment
- [ ] Every task closed this week, with its note
- [ ] Uncommitted drafts listed as "not committed" (not failures, but visible)
- [ ] Late adds shown separately, with the rate recalculated without them
- [ ] Week-over-week comparison against the previous week
- [ ] A single prompt: **"How did this week actually go?"** — voice or text
- [ ] Saves a `weekly_review` row with a `stats` **snapshot**, so history never shifts later
- [ ] Reviews are viewable from any past week

### Still-open tasks
- [ ] Any task still `OPEN` when the week ends is surfaced at the top of the review
- [ ] Bulk-close from the review, but **each one still requires its own note** — no bulk note
- [ ] Skipping is allowed. They stay `OPEN` and count in the denominator.

## Acceptance criteria

- [ ] The Sunday notification fires at the right local time and deep-links correctly
- [ ] The stats snapshot in `weekly_reviews.stats` does not change when older tasks are later reopened
- [ ] Bulk-closing four tasks produces four distinct notes and four event rows
- [ ] The review is viewable for any past week
- [ ] Notification permission denied → the review screen still works, just unprompted

## Definition of done
Do a real weekly review on a real Sunday. If it takes more than five minutes, it is too
long and you will stop doing it — cut something.

## Why the snapshot matters
If you reopen a task from three weeks ago, that week's review should still show what you
saw when you wrote it. A review is a record of a moment, not a live query.
