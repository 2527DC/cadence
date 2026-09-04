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
- [x] `enqueue(op, payload)` — always with a client-generated UUID
- [ ] Ops supported: `insert_task`, `update_draft_task`, `delete_draft_task`, `finalize_task`, `finalize_week`, `close_task`, `insert_voice_note`, `upload_voice_file`, `insert_message`
- [x] Flush is ordered, oldest-first, strictly one at a time
- [x] Idempotency: `close_task` on an already-closed task resolves rather than blocking the queue
- [x] Exponential backoff, capped at 5 attempts, then `status = 'failed'`

### Triggers
- [x] Flush on app foreground
- [x] Flush on network regained (`expo-network` listener)
- [x] Flush after any successful mutation
- [ ] Background flush via `expo-task-manager` + `expo-background-task`

### UI
- [x] Offline banner — one line, unobtrusive, dismissible
- [ ] Per-item "pending sync" dot on tasks and messages with queued writes
- [ ] Settings → "Sync problems" screen listing failed rows with their error and a retry button
- [ ] Pending count in Settings

### Cache persistence
- [x] React Query persister wired for the week, goals and dashboard queries
- [x] Cache restored on cold start before the first render
- [x] Dashboard shows "as of <time>" when serving stale data offline

## Acceptance criteria

- [ ] Airplane mode: add a task, finalize it, close it with a voice note — all succeed in the UI
- [ ] Back online: everything syncs in the right order, with no duplicates
- [ ] Kill the app with 5 queued ops → all 5 are still there on relaunch and flush correctly
- [ ] Force a server error → the row lands in "sync problems" and does not block the others behind it
- [x] Closing the same task twice does not create two event rows
- [ ] Cold start offline shows the last known week within 300ms

## Definition of done
Spend a full day with the phone in airplane mode, using the app normally. Turn networking
back on. Everything you did is on the server, exactly once, in the right order.

## The hard part
**Ordering.** `finalize_task` must land before `close_task` on the same task, and
`insert_voice_note` before the `close_task` that references it. Strict FIFO with a single
in-flight request solves this. Do not parallelise the flush to make it faster — a queue that
is fast and wrong is worse than one that is slow and right.

---
## Completion record
- **Not complete: 1 of 6 acceptance criteria met, as of 2026-09-04.** The queue and its
  policy are built and unit-tested; five criteria are experiments with a phone in
  airplane mode, and none of them has been run.
- Decisions made:
  - **The outbox is React Query's mutation cache, not a second SQLite table.** See
    deviation 1. This is the largest decision in the phase.
  - **The server always wins.** Nothing merges. A rejected write is rolled back and the
    next refetch shows what the database actually holds — which is the only safe answer
    when the database is the thing enforcing the domain rules.
  - **A rejection is not a failure.** Only network and 5xx/429 errors are retried. Every
    constraint, trigger and RLS refusal rolls back immediately and shows its message
    verbatim, because those messages were written to be read by a person.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest`.
  - `src/lib/outbox.test.ts` — 40-odd assertions on the policy itself: never retry a
    rejection however early; retry a network failure without limit; give up on a server
    failure after 5 attempts; backoff doubles from one second and caps; keep a paused
    *and* an in-flight mutation across a restart but drop anything that settled; replay
    oldest-first and stable for ties; a v4 client id that does not repeat; and
    `isAlreadyClosedTo` matching the RPC's "already <status>" message for **this** task
    and status only — not for a different status, which is a real correction being
    refused, and not for a different task.
  - `node supabase/db.mjs test` (2026-09-04) — closing a task to the status it already
    holds is refused by `close_task()`. That refusal plus `isAlreadyClosedTo` is
    acceptance criterion 5: a replayed close finds "already closed", fetches the row and
    returns it, and never writes a second ledger entry.
  - The four flush triggers are wired where the code says they are:
    `src/features/sync/network.ts` (foreground, network regained) and the shared
    `OUTBOX_SCOPE` queue (after any successful mutation).
- **Not verified on a physical device**, and no iOS bundle was produced in this run.
  This is the phase where that matters most: everything here is about what happens when
  the network is gone, and the network has never been gone.

### Deviations from plan
1. **No `expo-sqlite` outbox table.** React Query's mutation cache already *is* that
   table — a mutation that cannot reach the server is paused, paused mutations are
   persisted next to the query cache by `@tanstack/query-async-storage-persister`, and
   replaying them oldest-first is one call. A second queue beside it would mean two
   answers to "what has not landed yet", and they would disagree eventually. The three
   properties the architecture doc asks for map onto three mutation options: ordering
   onto one shared `scope`, idempotency onto client-generated ids plus every
   `mutationFn` treating "already applied" as success, and the retry cap onto
   `outboxRetry`.
2. **Voice uploads use a disk sidecar, not the mutation queue.** A recording is written
   to `documentDirectory/voice/` with a JSON sidecar *before* any upload starts, and
   `retryPendingUploads()` finishes it on the next launch. That is stronger than a
   queue entry for this one case, because the audio survives even a queue that is lost.
   **The launch hook was wired in P12**, not here — until then `retryPendingUploads`
   was exported and never called.
3. **No background flush.** `expo-task-manager` / `expo-background-task` are outside
   Expo Go's bundled modules (P00). Foreground, network-regained and
   after-each-success are the three triggers that exist; a periodic wake is a P13 job
   and, for a single user who opens the app most days, close to worthless.
4. **Sync problems are a banner, not a screen.** `src/features/sync/sync-problems.ts`
   keeps the last few rejections that had no screen left to show them — a write that
   paused first, or one restored from disk — and `SyncBanner` reports them, dismissibly.
   There is no Settings screen in the app at all yet, so "Settings → Sync problems" and
   "pending count in Settings" have nowhere to live. `pendingChangeCount()` exists and
   is used by the sign-out flow.
5. **The "pending sync" dot exists on messages and not on tasks.** A chat bubble says
   "· sending"; a task row just shows its optimistic state. Tasks are rarer and
   coarser, so the banner covers them adequately — but this is a real gap against the
   plan.

### Follow-ups created
None as files.

---
## Progress — 2026-09-04 (built, and never once run offline)

The queue, the retry policy, the persister, the banner and the three flush triggers are
all in place and unit-tested. What has not happened is the day in airplane mode this
phase's definition of done asks for.

- [x] Closing the same task twice does not create two event rows — proved by
      `isAlreadyClosedTo` in `outbox.test.ts` plus the RPC's own refusal in
      `supabase/tests/`.
- [ ] Airplane mode: add a task, finalize it, close it with a voice note — all succeed
      in the UI.
- [ ] Back online: everything syncs in the right order, with no duplicates.
- [ ] Kill the app with 5 queued ops → all 5 are still there on relaunch and flush.
- [ ] Force a server error → the row lands in "sync problems" and does not block the
      others behind it.
- [ ] Cold start offline shows the last known week within 300ms.

Also outstanding against the plan, and not device-dependent: a per-task pending dot,
and somewhere for "sync problems" and the pending count to live once a Settings screen
exists (deviations 4 and 5).
