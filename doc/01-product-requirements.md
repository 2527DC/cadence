# 01 — Product Requirements (PRD)

App: **Cadence** (working name — see [00-app-name-options.md](00-app-name-options.md))
Owner / sole user: Bharath
Status: **draft — needs your sign-off before implementation starts**
Last updated: 2026-09-02

---

## 1. One-line description

A private weekly goal-and-task tracker where nothing you commit to can ever be deleted —
only closed with an honest status and a written or spoken note — and which turns that
permanent record into consistency and progress analytics.

---

## 2. Why this app exists (the problem)

Normal to-do apps let you delete a task you failed to do. That means the record lies:
your list always looks clean, and you never find out that you drop the same kind of
commitment every third week. This app removes the escape hatch.

**The core bet:** if you cannot delete a failure, and you must write down *why* it
happened before you close it, then the weekly analytics become a truthful mirror of
your actual behaviour instead of a record of what you felt like keeping.

---

## 3. Scope

### In scope (v1)
- Weekly goals with targets
- Tasks attached to goals (or standalone)
- Finalization, after which a task becomes permanent
- Three closing statuses: **N**, **C**, **NC** — each requires a note
- Full append-only status history
- WhatsApp-style chat log with voice messages and speech-to-text
- Recordings stored, replayable, searchable by transcript
- Dashboard: progress and consistency analytics
- Supabase backend, single-user, private

### Out of scope (v1) — explicitly not building
- Multi-user, sharing, teams, comments from others
- Web app (Expo Router can add it later; not a v1 goal)
- AI-generated coaching / summaries (v2 candidate — see [08-open-questions.md](08-open-questions.md))
- Calendar sync, email, third-party integrations
- Habit tracking separate from tasks (a habit is just a weekly-recurring task here)

---

## 4. Core domain rules

These are the rules the whole app exists to protect. **Every one of them is enforced in
the database, not just in the UI** — see [03-data-model-supabase.md](03-data-model-supabase.md).

### R1 — Draft vs Finalized

A task starts as a **draft**. While it is a draft you can edit it freely or delete it —
you are still deciding what to commit to.

Once you press **Finalize** (either per-task or "Finalize the week"), the task becomes
permanent:

- It can **never** be deleted. No API path, no RLS policy, and no UI button exists.
- Its `title`, `goal_id`, `week_start` and `weight` become **immutable**.
- The only thing that can still change is its **status**.

> **Why both per-task finalize and finalize-the-week?** Per-task, for things you are sure
> about immediately. Finalize-the-week as a hard cutoff, so you cannot keep quietly adding
> easy wins on Saturday to inflate the week's numbers. See open question OQ-3.

### R2 — Statuses

A finalized task is in exactly one of four states:

| Code | Name | Meaning | Counts in completion rate? |
|---|---|---|---|
| `OPEN` | Open | Committed, not yet resolved | Denominator only, once the week has ended |
| `N` | Not completed | You did not do it. Full stop. | Yes — as a miss |
| `C` | Completed | You did it. | Yes — as a hit |
| `NC` | Not counted | Genuinely invalidated by something outside your control | **No — excluded entirely** |

**`NC` is the dangerous one.** It is the only status that can make a bad week look good,
because it removes the task from the denominator. Guardrails are in section 6.

### R3 — Mandatory closing note

You cannot move a task from `OPEN` to `N`, `C`, or `NC` without a note.

- Minimum **15 characters** of real text, **or** a voice note of **3 seconds or longer**.
- A voice note satisfies the requirement immediately; its transcript fills in afterwards.
- Enforced inside a Postgres function. The client cannot bypass it.
- Placeholder text ("ok", "done", "asdf") is rejected by a length plus repetition check.

### R4 — Status changes are append-only

Every transition writes a row to `task_status_events`: from-status, to-status, note,
optional voice note, timestamp. That table has **no UPDATE and no DELETE policy**.

You *can* change your mind — `N` becomes `C` if you did it late — but that writes a *new*
event with its own required note. The history shows that you changed it. Nothing is erased.

### R5 — Weeks are ISO weeks, Monday-start

`week_start` is always a Monday. The timezone is pinned to **Asia/Kolkata** so a task
closed at 11pm does not jump into next week. Confirm in OQ-1.

---

## 5. Features

### F1 — Goals

- Create a goal: title, description, category, colour, target per week, start week,
  optional end week.
- `target_per_week` is how many related tasks you intend to complete each week.
- Goal states: `active`, `paused`, `archived`. **Goals are never deleted either** —
  archiving keeps their history in the analytics.
- A goal's progress is completed tasks versus target, per week and cumulative.

### F2 — Weekly planner

- The default screen: the current week, Monday to Sunday.
- Add tasks as drafts, attach to a goal or leave standalone.
- Optional `planned_for` day, optional `weight` (1–5) for tasks that are not equal.
- A clear visual line between **drafts** (editable, dashed border) and **finalized**
  (solid, lock icon).
- "Finalize week" button, with a confirmation that spells out what becomes permanent.

### F3 — Closing a task

The single most important interaction in the app.

1. Tap a task. A sheet opens with three large buttons: **C**, **N**, **NC**.
2. Pick one. The note field appears **already focused**, with a mic button beside it.
3. For `NC` only: an extra required field — *"What made this impossible?"* — plus a
   reason dropdown (illness, blocked by others, cancelled externally, other).
4. Save stays disabled until R3 is satisfied.
5. On save, the status update and the event row are written atomically in one RPC.

### F4 — Chat log (WhatsApp-style)

A chat screen. This is the informal, low-friction side of the app.

- Message bubbles, newest at the bottom, date separators.
- **Text messages** — type anything: a thought, a blocker, a win.
- **Voice messages** — press and hold the mic, release to send. Waveform, duration,
  play/pause and scrub, like WhatsApp.
- Every voice message is **transcribed**, and the transcript shows under the bubble
  (collapsible, "show transcript").
- Recordings live in Supabase Storage and stay playable forever.
- A message can be **linked to a task or goal** (long-press, then "Attach to…"), which
  makes it appear in that task's timeline too.
- Search across all message text *and* transcripts.

> **Threads:** v1 has one thread per goal plus a general "Daily log" thread. Not full
> multi-chat — see OQ-4.

### F5 — Voice notes as closing notes

The mic in the closing sheet (F3) records into the same voice-note pipeline as F4. The
recording is attached to the status event permanently.

### F6 — Dashboard / analytics

See [05-analytics-spec.md](05-analytics-spec.md) for exact formulas. In summary:

**Progress**
- This week: C / N / NC / Open counts, plus completion rate
- Per-goal progress bars against the weekly target
- Cumulative goal progress since the start

**Consistency**
- Current streak and longest streak (consecutive weeks at or above your threshold)
- 12-week completion-rate sparkline
- Day-of-week heatmap — which days you actually deliver on
- **NC rate**, flagged if it climbs, because that is the self-deception metric
- Reliability by goal — which goals you keep, and which you quietly abandon

**Reflection**
- Notes timeline — every closing note in one scrollable feed, filterable by status
- "Your `N` reasons this month" — grouped, so recurring excuses become visible

### F7 — Weekly review

Sunday evening notification leads to a review screen: the week's numbers, every task you
closed, and a prompt to record one voice note summarising the week. Stored as a
`weekly_review`.

---

## 6. Guardrails against gaming the system

The app is only useful if it is honest. These are deliberate friction points.

| Risk | Guardrail |
|---|---|
| Marking everything `NC` to protect the streak | `NC` requires a reason category and a longer note. The dashboard shows NC rate prominently. If NC exceeds 20% in a week, a plain warning banner appears. |
| Adding trivial tasks late in the week to lift the rate | Tasks finalized after Wednesday are tagged `late_add` and shown separately in the weekly breakdown. |
| Never finalizing, so nothing ever counts | Drafts left unfinalized at week end are reported in the review screen as "not committed". They do not count as misses, but they are visible. |
| One-word notes | 15-character minimum plus a repetition check. |
| Deleting a whole goal to hide failures | Goals archive, never delete. Archived goals still appear in historical analytics. |

---

## 7. Non-functional requirements

- **Private.** Single user. RLS on every table. No analytics SDK that ships content
  off-device.
- **Offline-first for capture.** You must be able to add a task, close a task and record
  a voice note with no network. Sync happens when you are back online.
- **Fast.** The weekly planner opens in under 300ms from cache.
- **Durable.** A recording must never be lost between "stop" and "uploaded". The local
  file is the source of truth until the upload is confirmed.
- **Honest failures.** If transcription fails, the recording still saves and the UI says
  "transcription failed — tap to retry". Never silently drop.

---

## 8. Success criteria

The app works if, after eight weeks of use:

1. You can answer "which goal am I actually keeping?" in under ten seconds from the dashboard.
2. Your closing notes tell you something you did not already know about your misses.
3. You never once wanted to delete a task — or, if you did, the note explains it better
   than deleting would have.

---

Related: [[00-app-name-options]], [[02-tech-stack]], [[03-data-model-supabase]],
[[05-analytics-spec]], [[06-voice-and-speech-to-text]], [[08-open-questions]]
