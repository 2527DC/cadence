# P05 — Task Closing with Mandatory Note

Depends on: P04
Estimate: 2 days
Skills to load: `expo-animation`, `frontend-design`

---

## Goal
The most important interaction in the app. Close a task as **C**, **N** or **NC**, with a
note that cannot be skipped.

**This phase completes the core loop.** After it, start using the app for real, for a week,
before building anything else.

## Tasks

### Closing sheet
- [ ] `@gorhom/bottom-sheet` modal, opens on task tap in under 100ms
- [ ] Three large buttons: **C** Completed · **N** Not completed · **NC** Not counted
- [ ] Each with a one-line explanation. `NC` reads: *"Something outside your control made this impossible. This will not count for or against you."*
- [ ] Selecting a status reveals the note field, **already focused**, keyboard up
- [ ] Live character counter: "15 characters minimum" → turns valid when met
- [ ] Mic button beside the note field (wired in P06; disabled placeholder for now)
- [ ] `NC` only: a required reason dropdown + a required "What made this impossible?" field
- [ ] Save is disabled until valid; the reason is always visible, never a silent disable
- [ ] Cancel discards, with a confirm if a note was partly typed

### Wiring
- [ ] `src/api/tasks.ts` → `closeTask()` calling the `close_task` RPC
- [ ] Optimistic update: status flips in the cache immediately, sheet closes, haptic fires
- [ ] Rollback plus a visible error if the RPC rejects — **show the database's message verbatim**
- [ ] Invalidate week and dashboard queries on success

### Reopening
- [ ] A closed task can be tapped again to change status
- [ ] Reopening requires its own new note (this is enforced by the RPC — verify the UI does not try to skip it)
- [ ] The sheet shows the current status and warns: *"This will be recorded as a change."*

### History
- [ ] Task detail screen shows the full `task_status_events` timeline
- [ ] Each entry: from → to, timestamp, the note in full
- [ ] Nothing in the history is editable or deletable

## Acceptance criteria

- [ ] Save cannot be triggered with a 14-character note
- [ ] "done", "ok", "asdf" are rejected, with the database's message shown
- [ ] `NC` without a reason cannot be saved
- [ ] The status flip appears instant, and a backend failure rolls it back visibly
- [ ] `C` then `N` produces two history entries, both with their own notes
- [ ] Closing works on the *week detail* screen and the *task detail* screen identically

## Definition of done
Close ten real tasks. If you found yourself irritated by the note requirement but wrote
something honest anyway, the design is correct. If you found a way to skip it, it is not.

## Design note
The friction here is deliberate and load-bearing. Resist the urge to soften it later —
a "quick complete" button would delete the entire point of the app.

---
## Progress — 2026-09-03 (partially built, NOT complete)

Closing works and is honest. Left in `pending/` for the gaps below.

**Built** — `src/features/tasks/close-task-sheet.tsx`, `src/app/task/[id].tsx`
- Three status choices, each with its one-line meaning; the status you already hold is
  shown and disabled
- Note field with a live problem message, mirroring `close_task()` exactly — length,
  placeholder notes, NC needing a reason (`src/lib/note.ts`, 8 unit tests)
- NC reason chips, required before save
- Save disabled with the reason always visible, never a silent disable
- **The database's error message is shown verbatim**, because those messages were
  written to be read by a person
- Reopening: a closed task can be closed again, the sheet says it will be recorded as a
  change, and the RPC requires its own new note
- **Task detail screen with the full `task_status_events` timeline** — from → to,
  timestamp in IST, the note in full, corrections marked. Nothing on it is editable

**Not built**
- [ ] `@gorhom/bottom-sheet`; it is a `Modal` (see the P02 completion record)
- [ ] Note field does not autofocus when a status is picked
- [ ] Character *counter*; there is a "N more characters needed" message instead
- [ ] Mic button placeholder — deliberately omitted until P06 makes it real
- [ ] Cancel discards silently, with no confirm on a partly typed note
- [ ] No optimistic update. The sheet waits for the RPC, so the flip is a round trip
      rather than instant. This is the biggest remaining gap in the phase.
- [ ] Closing from the week screen is a long-press, which is not discoverable
