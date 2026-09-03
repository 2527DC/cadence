# P03 — Goals

Depends on: P02
Estimate: 1 day
Skills to load: `expo-data-fetching`, `react-native-reusables`

---

## Goal
Create, edit, archive and view goals. The foundation the whole task model hangs off.

## Tasks

- [ ] `src/api/goals.ts` — list, get, create, update, archive (**no delete function exists**)
- [ ] Zod schemas for goal create/update, mirroring the Postgres check constraints
- [ ] React Query hooks: `useGoals`, `useGoal`, `useCreateGoal`, `useUpdateGoal`, `useArchiveGoal`
- [ ] Goals tab: active goals list with colour, title, target/week, this week's attainment
- [ ] Sections: Active / Paused / Archived (archived collapsed by default)
- [ ] Create-goal form: title, description, category, colour picker, target per week, start week
- [ ] `start_week` snaps to the Monday of the chosen week — never let a non-Monday through
- [ ] Goal detail screen: description, per-week attainment history, tasks for this goal
- [ ] Archive with a confirmation that says plainly: *"Archiving keeps all history. Goals cannot be deleted."*
- [ ] Empty state: "No goals yet. What are you trying to be consistent about?"

## Acceptance criteria

- [ ] Creating a goal with a 2-character title is rejected in the form **and** by Postgres
- [ ] `start_week` is always a Monday, whatever the user picks
- [ ] There is **no delete affordance anywhere** in the UI
- [ ] Archived goals disappear from the active list but remain in goal detail and history
- [ ] The list renders correctly with 0, 1 and 20 goals

## Definition of done
You can create the three or four goals you actually care about, and they persist.

---
## Completion record
- Completed: 2026-09-03
- Verified by: typecheck, lint, iOS bundle. Create / pause / archive / reactivate all go
  through `src/api/goals.ts`.
- Deviations: goal colour is not yet user-selectable — every goal takes the schema
  default and the swatch renders it. The column and the UI slot exist; the picker is a
  P12 job.
- **The screen has no delete button, and cannot have one.** `authenticated` holds no
  DELETE policy (0010/0013) and no DELETE privilege (0014), so the API would refuse it.
  Archiving is the operation, which keeps every historical task and its analytics intact.
- Not done: editing an existing goal's title or target. Archive-and-recreate works today;
  `useUpdateGoal` is written and unused.
