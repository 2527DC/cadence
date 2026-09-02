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

- [ ] Accept both
- [ ] Per-task only — simpler, drop the "Finalize week" tasks below
- [ ] Weekly cutoff only — stricter, drop the per-task lock button

### OQ-8 (UI half) — Weights
Decided in P01. If you chose "column now, UI later", **skip any weight input in this phase**
and leave everything at the default of 1.

- [ ] No weight UI (default)
- [ ] Add a weight selector to the add-task row

---

## Goal
The default screen. Add draft tasks for the current week, finalize them, and cross the
one-way door.

## Tasks

### Week logic
- [ ] `src/lib/week.ts` — `currentWeekStart()`, `weekRange()`, `isMonday()`, all pinned to Asia/Kolkata with `date-fns-tz`
- [ ] Unit tests for the boundary: Sunday 23:59 and Monday 00:01 IST land in different weeks

### Planner screen
- [ ] Week header: date range, week-over-week arrows, "This week" jump
- [ ] Task list grouped by day, with an "Unscheduled" group
- [ ] **Drafts render visibly differently** — dashed border, editable, swipe to delete
- [ ] **Finalized render locked** — solid border, lock icon, no delete affordance at all
- [ ] Inline "add task" row: title, optional goal, optional day
- [ ] Edit a draft in place; swipe-to-delete works only on drafts
- [ ] Past weeks are read-only

### Finalization
- [ ] Per-task finalize (lock button on a draft)
- [ ] "Finalize week" button in the header, with a confirmation dialog that spells out: *"N tasks become permanent. They can never be deleted — only closed with a status and a note."*
- [ ] Success haptic on finalize
- [ ] `late_add` badge appears on anything finalized after Wednesday
- [ ] Uncommitted-draft count shown at week end

## Acceptance criteria

- [ ] After finalizing, swipe-to-delete is gone and no long-press delete exists
- [ ] Attempting a delete through the API on a finalized task fails (verify against the real backend, not a mock)
- [ ] The confirmation dialog is unambiguous about permanence
- [ ] Editing a finalized task's title is impossible in the UI and rejected by the database
- [ ] Week navigation is correct across a month boundary and across 1 January
- [ ] The list stays smooth at 50 tasks in a week

## Definition of done
You can plan a real week, finalize it, and feel the weight of the commitment. If finalizing
does not feel slightly serious, the confirmation copy is not doing its job.
