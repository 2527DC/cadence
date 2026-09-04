# P04 — Weekly Planner and Finalization

Depends on: P03
Estimate: 2 days
Skills to load: `expo-router`, `expo-animation`, `react-native-performance`

---

## Decisions needed in this phase

### OQ-3 — Finalization granularity
The task list below assumes **both** mechanisms: finalize a single task immediately, and
"finalize the week" as a cutoff.

**Recommendation: ship both.** Per-task for things you are certain about; the weekly cutoff to
stop late padding. Anything finalized after Wednesday gets tagged `late_add` and shown
separately.

- [x] Accept both
- [ ] Per-task only — simpler, drop the "Finalize week" tasks below
- [ ] Weekly cutoff only — stricter, drop the per-task lock button

### OQ-8 (UI half) — Weights
Decided in P01. If you chose "column now, UI later", **skip any weight input in this phase**
and leave everything at the default of 1.

- [x] No weight UI (default)
- [ ] Add a weight selector to the add-task row

---

## Goal
The default screen. Add draft tasks for the current week, finalize them, and cross the
one-way door.

## Tasks

### Week logic
- [x] `src/lib/week.ts` — `currentWeekStart()`, `weekRange()`, `isMonday()`, all pinned to Asia/Kolkata with `date-fns-tz`
- [x] Unit tests for the boundary: Sunday 23:59 and Monday 00:01 IST land in different weeks

### Planner screen
- [x] Week header: date range, week-over-week arrows, "This week" jump
- [x] Task list grouped by day, with an "Unscheduled" group
- [x] **Drafts render visibly differently** — dashed border, editable, swipe to delete
- [x] **Finalized render locked** — solid border, lock icon, no delete affordance at all
- [x] Inline "add task" row: title, optional goal, optional day
- [x] Edit a draft in place; swipe-to-delete works only on drafts
- [x] Past weeks are read-only

### Finalization
- [x] Per-task finalize (lock button on a draft)
- [x] "Finalize week" button in the header, with a confirmation dialog that spells out: *"N tasks become permanent. They can never be deleted — only closed with a status and a note."*
- [x] Success haptic on finalize
- [x] `late_add` badge appears on anything finalized after Wednesday
- [x] Uncommitted-draft count shown at week end

## Acceptance criteria

- [x] After finalizing, swipe-to-delete is gone and no long-press delete exists
- [x] Attempting a delete through the API on a finalized task fails (verify against the real backend, not a mock)
- [x] The confirmation dialog is unambiguous about permanence
- [x] Editing a finalized task's title is impossible in the UI and rejected by the database
- [x] Week navigation is correct across a month boundary and across 1 January
- [ ] The list stays smooth at 50 tasks in a week

## Definition of done
You can plan a real week, finalize it, and feel the weight of the commitment. If finalizing
does not feel slightly serious, the confirmation copy is not doing its job.


---
## Completion record
- **Not complete: 5 of 6 acceptance criteria met, as of 2026-09-04.** Every task in the
  phase is built; the file stays in `pending/` for the one criterion that needs a
  phone. See the Progress note at the bottom.
- Decisions made:
  - **OQ-3 — both.** A lock on each draft commits one task; "Commit N tasks" in the
    header and under the add row commits the week. The recommendation, unchanged.
  - **OQ-8 (UI half) — no weight UI.** `tasks.weight` stays at its default of 1 and
    nothing in the planner offers to change it. The dashboard's effort rate only
    appears at all once some task carries a weight above 1 (`usesWeight`), so the
    column can be switched on later without a migration and without a dead metric
    sitting on the screen in the meantime.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest` (268 assertions).
  - `src/lib/week.test.ts` — the boundary the phase asks for: Sunday 23:59 IST and
    Monday 00:01 IST are two minutes apart and land in different weeks, plus month
    crossings and 31 Dec / 1 Jan.
  - `src/features/planner/group.test.ts` — day grouping, the Unscheduled bucket,
    `isPastWeek`, and which drafts are at risk.
  - `node supabase/db.mjs test`, re-run 2026-09-04: 86 assertions, all pass.
    `01_destructive.sql` proves criteria 2 and 4 at the layer that enforces them —
    a finalized task cannot be deleted through RLS *or* through the trigger with RLS
    bypassed, and its title cannot be changed. `useDeleteDraft` also checks what is
    *left* rather than trusting the absence of an error, because RLS filters silently
    rather than raising.
  - Criteria 1 and 3 read out of the code: `CommittedRow` has no `ReanimatedSwipeable`
    around it and no delete handler at all, and `confirmCommit` spells out "It becomes
    permanent. It can never be deleted or renamed — only closed with a status and a
    note", plus the late-add warning after Wednesday.
- **Not verified on a physical device**, and no iOS bundle was produced in this run.

### Deviations from plan
1. **`Intl` + `date-fns`, not `date-fns-tz`.** `todayInAppTimezone()` is four lines and
   there is one fewer dependency to check against P00's Expo Go list. The 24 tests in
   `week.test.ts` are what make that safe.
2. **`late_add` is never sent by the client.** `finalizeOptions` posts only
   `is_finalized: true`; the database's `mark_late_add()` decides, and the optimistic
   row's guess is replaced by the refetch. Finalizing on a Thursday to pad the week is
   therefore visible in the data no matter what the app does.
3. **The "lock" is a labelled button, not a padlock glyph.** Same gesture, and it reads
   without a legend.
4. **Every mutation on this screen is optimistic and replayable** (P10). That was not
   in P04's plan; it arrived with the outbox and is why the screen works offline.

### Follow-ups created
None as files.

---
## Progress — 2026-09-04 (one acceptance criterion outstanding)

Everything in the task list is built. What is missing is a measurement, not a feature:

- [ ] **The list stays smooth at 50 tasks in a week.** Never run with 50 tasks, and
      never run on the iPhone at all. The screen is a `SectionList` with
      `initialNumToRender={16}`, `maxToRenderPerBatch={12}` and `windowSize={7}`, and
      the rows are memoised behind stable callbacks — so the structure is right. That
      is an argument, not a measurement, and this file stays in `pending/` until
      someone has actually scrolled fifty rows on the phone.

Nothing else is outstanding. When that one check passes, move the file.
