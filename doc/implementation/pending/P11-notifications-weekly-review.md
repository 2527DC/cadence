# P11 — Notifications and Weekly Review

Depends on: P09
Estimate: 1 day
Skills to load: `context7` (for `expo-notifications`), `frontend-design`

---

## Decisions needed in this phase

### OQ-10 — Notifications
**Recommendation: exactly two.** Sunday 20:00 IST for the weekly review, Monday 09:00 IST to
plan the week. Nothing else — a tracker that nags stops being opened.

- [x] Accept — two only
- [ ] Also a daily reminder at: ______
- [ ] None at all

---

## Goal
The Sunday ritual that makes the whole thing a practice rather than a database.

## Tasks

### Notifications
- [x] `expo-notifications` set up, permission requested with context
- [x] Sunday 20:00 IST — "Time to review your week" (deep links to `/review/<week>`)
- [x] Monday 09:00 IST — "Plan this week" (deep links to the planner)
- [x] **Exactly these two.** No streak nags, no daily reminders (OQ-10)
- [x] Toggle each independently in Settings
- [x] Local scheduling — no push infrastructure needed for a single-user app

### Weekly review screen
- [x] Route `app/review/[week].tsx`
- [x] The week's numbers: rate, C / N / NC counts, per-goal attainment
- [x] Every task closed this week, with its note
- [x] Uncommitted drafts listed as "not committed" (not failures, but visible)
- [x] Late adds shown separately, with the rate recalculated without them
- [x] Week-over-week comparison against the previous week
- [x] A single prompt: **"How did this week actually go?"** — voice or text
- [x] Saves a `weekly_review` row with a `stats` **snapshot**, so history never shifts later
- [x] Reviews are viewable from any past week

### Still-open tasks
- [x] Any task still `OPEN` when the week ends is surfaced at the top of the review
- [x] Bulk-close from the review, but **each one still requires its own note** — no bulk note
- [x] Skipping is allowed. They stay `OPEN` and count in the denominator.

## Acceptance criteria

- [ ] The Sunday notification fires at the right local time and deep-links correctly
- [x] The stats snapshot in `weekly_reviews.stats` does not change when older tasks are later reopened
- [x] Bulk-closing four tasks produces four distinct notes and four event rows
- [x] The review is viewable for any past week
- [x] Notification permission denied → the review screen still works, just unprompted

## Definition of done
Do a real weekly review on a real Sunday. If it takes more than five minutes, it is too
long and you will stop doing it — cut something.

## Why the snapshot matters
If you reopen a task from three weeks ago, that week's review should still show what you
saw when you wrote it. A review is a record of a moment, not a live query.

---
## Completion record
- **Not complete: 4 of 5 acceptance criteria met, as of 2026-09-04.** The one that is
  not is the one that requires a Sunday evening and a phone.
- Decisions made:
  - **OQ-10 — exactly two, local.** Sunday 20:00 IST to review, Monday 09:00 IST to
    plan. No streak nags, no daily reminder, no badge — `setNotificationHandler` sets
    `shouldSetBadge: false`, because an unread count on a journal is a nag.
    `it('has two, and no more')` in `schedule.test.ts` is there to stop a third being
    added quietly.
  - **The permission ask lives on the Reminders card, not on launch**, with the
    sentence explaining why directly above the button. iOS shows its prompt once per
    install and a refusal is permanent, so the one chance to ask is spent on a screen
    where the person already knows what they are being asked for.
  - **No bulk note.** Each still-open task is closed through the same sheet as
    everywhere else, with its own note. There is no "close all as N" and there will not
    be one.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest`.
  - `src/features/notifications/review-model.test.ts` has a block literally named
    `describe('statsDrift — the acceptance criterion')`, containing `it('does not
    change when a task from that week is reopened later')`. That is criterion 2.
    Alongside it: `buildReviewStats` records the rate with *and* without late adds,
    keeps an undefined rate as `null` rather than 0, and survives a round trip through
    JSON — which is how it is stored, in a `jsonb` column with no schema.
  - `src/features/notifications/schedule.test.ts` — the two reminders and their stable
    identifiers (so rescheduling replaces rather than stacks), IST instants read as a
    wall clock rather than in the device timezone, `nextOccurrence` rolling to next week
    at exactly the hour, and "a late Sunday night is still Sunday in IST even when the
    device is a day behind". `weekToReview` names the week the Sunday notification is
    the last day of, and still names it when the banner is tapped on Monday morning.
  - Criterion 4 is read out of `resolveWeek()` in `app/review/[week].tsx`: any ISO date
    is accepted, an impossible one falls back to last week, and a non-Monday is snapped
    to its Monday — `week_start` is a Monday by check constraint and a query for a
    Wednesday would silently return nothing.
  - Criterion 5 is read out of `reminder-settings.tsx`: with permission denied the card
    explains that neither reminder can be sent and offers Settings, and every other part
    of the screen renders exactly as before. Every call into `expo-notifications` is
    wrapped, so a phone that refuses to schedule cannot stop the app starting.
  - Criterion 3 is read out of the code plus the database: `StillOpenSection` opens the
    same `CloseTaskSheet` one task at a time, and `close_task()` writes exactly one
    ledger row per call and refuses a missing note — `02_happy_path.sql` asserts
    "closing writes exactly one ledger row".
- **Not verified on a physical device**, and no iOS bundle was produced in this run.
  No notification has ever been scheduled by this app, let alone delivered.

### Deviations from plan
1. **Local notifications, not push.** Deliberate and permanent for this app: the two
   things it wants to say are known a week in advance and are the same for the only
   user there is. Remote push would need a native build (P13) and buys nothing.
2. **"Settings" is the weekly review screen.** There is no settings screen in the app;
   the Reminders card lives at the bottom of `app/review/[week].tsx`, next to the thing
   it is about. Independent toggles, as asked.
3. **The review is reachable without a notification.** `ReviewPrompt` on the dashboard
   offers the week that just ended, and the header arrows walk back through every past
   week. This is what makes criterion 5 true rather than merely survivable — with
   notifications refused, the review is still one tap from the dashboard.
4. **A `SnapshotCard` shows the frozen numbers next to the live ones when they have
   drifted**, and names what moved. That was not asked for. It is the honest way to
   show a snapshot that no longer matches: hiding the drift would be a quiet lie, and
   overwriting the snapshot would be a loud one.

### Follow-ups created
None as files.

---
## Progress — 2026-09-04 (one acceptance criterion outstanding)

The review screen is complete and its numbers are unit-tested. The scheduling maths is
unit-tested. What has not happened is a notification being delivered.

- [ ] **The Sunday notification fires at the right local time and deep-links
      correctly.** Everything up to the OS call is proven by `schedule.test.ts`; what
      is unproven is `expo-notifications` accepting the trigger, the banner arriving at
      20:00 IST, and the tap landing on `/review/<week>` — including the cold-start
      case, where the app must route the notification that launched it.

Worth knowing when that is tested: in **Expo Go on Android** the notifications module
was removed in SDK 53, so every call there throws and is swallowed. The review screen
works identically; it is simply never prompted. On iOS in Expo Go, local notifications
still work.
