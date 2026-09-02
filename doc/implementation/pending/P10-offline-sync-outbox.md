# P10 — Offline Sync and Outbox

Depends on: P05, P06
Estimate: 2 days
Skills to load: `expo-data-fetching`, `context7` (for `expo-sqlite`, `expo-background-task`)

---

## Goal
Every write survives being offline, being retried, and the app being killed.

Reference: [../../04-architecture.md](../../04-architecture.md) §3

## Scope
**Writes only.** Reads come from the persisted React Query cache. Do not build a
bidirectional sync engine — that is how single-user apps become three-month projects.

## Tasks

### Outbox
- [ ] `expo-sqlite` database with the `outbox` table from the architecture doc
- [ ] `enqueue(op, payload)` — always with a client-generated UUID
- [ ] Ops supported: `insert_task`, `update_draft_task`, `delete_draft_task`, `finalize_task`, `finalize_week`, `close_task`, `insert_voice_note`, `upload_voice_file`, `insert_message`
- [ ] Flush is ordered, oldest-first, strictly one at a time
- [ ] Idempotency: `close_task` on an already-closed task resolves rather than blocking the queue
- [ ] Exponential backoff, capped at 5 attempts, then `status = 'failed'`

### Triggers
- [ ] Flush on app foreground
- [ ] Flush on network regained (`expo-network` listener)
- [ ] Flush after any successful mutation
- [ ] Background flush via `expo-task-manager` + `expo-background-task`

### UI
- [ ] Offline banner — one line, unobtrusive, dismissible
- [ ] Per-item "pending sync" dot on tasks and messages with queued writes
- [ ] Settings → "Sync problems" screen listing failed rows with their error and a retry button
- [ ] Pending count in Settings

### Cache persistence
- [ ] React Query persister wired for the week, goals and dashboard queries
- [ ] Cache restored on cold start before the first render
- [ ] Dashboard shows "as of <time>" when serving stale data offline

## Acceptance criteria

- [ ] Airplane mode: add a task, finalize it, close it with a voice note — all succeed in the UI
- [ ] Back online: everything syncs in the right order, with no duplicates
- [ ] Kill the app with 5 queued ops → all 5 are still there on relaunch and flush correctly
- [ ] Force a server error → the row lands in "sync problems" and does not block the others behind it
- [ ] Closing the same task twice does not create two event rows
- [ ] Cold start offline shows the last known week within 300ms

## Definition of done
Spend a full day with the phone in airplane mode, using the app normally. Turn networking
back on. Everything you did is on the server, exactly once, in the right order.

## The hard part
**Ordering.** `finalize_task` must land before `close_task` on the same task, and
`insert_voice_note` before the `close_task` that references it. Strict FIFO with a single
in-flight request solves this. Do not parallelise the flush to make it faster — a queue that
is fast and wrong is worse than one that is slow and right.
