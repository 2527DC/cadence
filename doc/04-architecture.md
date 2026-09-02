# 04 — Architecture

App: **Cadence**
Status: draft

---

## 1. Shape of the system

```
┌─────────────────────────── Expo app (Android / iOS) ───────────────────────────┐
│                                                                                 │
│  expo-router                                                                    │
│    (tabs): Week · Chat · Dashboard · Goals                                       │
│                                                                                 │
│  ┌───────────────┐   ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │ React Query   │   │  Zustand     │   │ Voice pipeline                     │  │
│  │ (server state)│   │  (UI state)  │   │ expo-audio → FileSystem →          │  │
│  │ + persister   │   │              │   │ on-device STT → upload → Storage   │  │
│  └───────┬───────┘   └──────────────┘   └──────────────┬─────────────────────┘  │
│          │                                             │                        │
│  ┌───────▼─────────────────────────────────────────────▼─────────────────────┐  │
│  │ Sync layer:  SQLite outbox (writes)  +  background flush task             │  │
│  └───────┬───────────────────────────────────────────────────────────────────┘  │
└──────────┼──────────────────────────────────────────────────────────────────────┘
           │ https (supabase-js, anon key + user JWT)
┌──────────▼──────────────────────── Supabase ────────────────────────────────────┐
│  Auth (email OTP)                                                                │
│  Postgres:  tables · constraints · triggers · close_task() RPC · RLS · views      │
│  Storage:   voice-notes bucket (private, signed URLs)                            │
│  Edge Functions: transcribe-audio · weekly-rollup                                │
│  pg_cron:   Sunday 20:00 IST review reminder · nightly rollup                     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data flow: closing a task (the critical path)

This is the interaction that must never lose data and never feel slow.

```
1. User taps task → sheet opens
2. User picks C / N / NC
3. User types note, or holds mic
     └─ if mic: expo-audio records to FileSystem
                expo-speech-recognition streams interim transcript live
4. User taps Save
     │
     ├─ [voice path] voice_note row created locally with a client-side UUID
     │               file queued for upload in the outbox
     │
     ├─ Optimistic update: React Query cache flips task.status immediately
     │                     → UI updates in <16ms, sheet closes, haptic fires
     │
     ├─ Outbox insert: { op: 'close_task', args: {...}, attempts: 0 }
     │
     └─ Flush attempt (immediate if online)
            │
            ├─ success → invalidate week + dashboard queries, drop outbox row
            │
            └─ failure → row stays in outbox, retried with backoff;
                         task shows a small "pending sync" dot.
                         Never rolled back in the UI — the user's decision stands.
```

**Client-side UUIDs matter here.** `expo-crypto` generates the id before the row exists on
the server, so an offline-created voice note can already be referenced by an offline
`close_task` call. When the outbox flushes, the ids already agree.

---

## 3. The outbox

A single SQLite table on the device:

```sql
create table outbox (
  id          text primary key,          -- uuid
  op          text not null,             -- 'close_task' | 'insert_task' | 'finalize_week' | ...
  payload     text not null,             -- json
  created_at  integer not null,
  attempts    integer not null default 0,
  last_error  text,
  status      text not null default 'pending'   -- pending | sending | failed
);
```

Rules:

- **Ordered.** Flushed oldest-first, one at a time. Order matters: finalize before close.
- **Idempotent.** Every op carries a client-generated id. `close_task` on an
  already-closed task returns the existing state rather than erroring the queue to a halt.
- **Bounded retries.** After 5 failures the row goes `failed` and surfaces in a
  "sync problems" screen. It is never silently dropped.
- **Flushed on:** app foreground, network regained (`expo-network` listener), successful
  mutation, and a periodic background task.

> **What is deliberately not in the outbox:** reads. Reads come from the persisted React
> Query cache. Trying to build a general bidirectional sync engine for a single-user app is
> the classic way to spend three weekends and ship nothing.

---

## 4. Voice pipeline

```
   press & hold mic
        │
        ▼
   expo-audio recorder starts (m4a, 44.1kHz mono, ~64kbps)
   expo-speech-recognition starts in parallel  ──► interim transcript shown live
        │
   release
        │
        ├─► file at FileSystem.documentDirectory/voice/{uuid}.m4a   ◄── source of truth
        ├─► duration + waveform samples captured from metering
        ├─► final on-device transcript
        │
        ▼
   voice_notes row inserted (transcript_status = 'on_device')
        │
        ▼
   outbox: upload file to Storage voice-notes/{user_id}/{uuid}.m4a
        │
        ├─ success → row updated with storage_path; local file kept for 30 days as cache
        └─ failure → retried. Local file is NEVER deleted before upload is confirmed.
        │
        ▼
   [optional] Edge Function `transcribe-audio` for recordings > 20s
        └─ overwrites transcript, sets transcript_status = 'cloud'
```

**Durability rule:** the local file is deleted only after the server confirms the upload
*and* the row's `storage_path` is set. A recording of your own voice explaining why you
missed a goal is not something to lose to a flaky upload.

Detail in [06-voice-and-speech-to-text.md](06-voice-and-speech-to-text.md).

---

## 5. Analytics computation — where does it run?

Three options, and the recommendation:

| Option | Pros | Cons |
|---|---|---|
| **Postgres views, queried live** ✅ | Always correct, no cache invalidation, one source of truth | A few hundred ms per dashboard load |
| Client-side from cached tasks | Instant, works offline | Duplicated formulas — client and server drift |
| Materialized view + nightly `pg_cron` refresh | Fast | Stale during the day, which is exactly when you look |

**Recommendation: plain views (option 1), plus React Query caching with a 5-minute
`staleTime`.** Your data volume is tiny — a few hundred tasks a year. Materialising this
is premature optimisation, and having the completion-rate formula exist in two places is a
guaranteed future bug. Revisit only if the dashboard ever exceeds 500ms.

**Offline dashboard:** it shows the last cached rollup with a "as of <time>" label. Honest
rather than absent.

---

## 6. Navigation

```
(tabs)
 ├── index      Weekly planner       ← default route
 ├── chat       Chat log
 ├── dashboard  Analytics
 └── goals      Goal list

modals / stacks
 ├── task/[id]          task detail + full status history
 ├── goal/[id]          goal detail + per-week attainment
 ├── review/[week]      weekly review
 ├── search             full-text over messages + transcripts
 └── settings           threshold, timezone, sync problems
```

The task-closing sheet is a `@gorhom/bottom-sheet` inside the planner, not a route — it
must open instantly, and a route transition is perceptible.

---

## 7. Error handling policy

| Failure | Behaviour |
|---|---|
| Network down | Everything still works. Writes queue. A single unobtrusive offline banner. |
| `close_task` rejected by a constraint | The database's message is shown verbatim. These messages are written to be read by a human — see [03-data-model-supabase.md](03-data-model-supabase.md) section 5. |
| Upload failed | Recording stays local and playable. Row shows "not backed up yet". |
| Transcription failed | Recording still saves. `transcript_status = 'failed'`, with a retry button. |
| Auth token expired | Silent refresh. If that fails, re-auth screen — but drafts and the outbox survive. |

---

## 8. Testing strategy

| Layer | What | Tool |
|---|---|---|
| Database | Every immutability rule. *Especially*: delete a finalized task must fail; close without a note must fail; direct status update must fail. | `pgTAP` or plain SQL assertions in `supabase test db` |
| Analytics | Completion rate with NC present, streak across a gap week, empty weeks | SQL fixtures |
| Outbox | Ordering, idempotency, retry cap, survives app kill | Jest |
| Components | Closing sheet disables Save until R3 is met | RN Testing Library |
| E2E | (a) finalize a task, confirm no delete affordance exists anywhere. (b) close with a voice note. | Maestro |

**The database tests are the ones that matter most.** They encode the entire point of the
app. Write them in the same migration PR as the triggers.

---

Related: [[02-tech-stack]], [[03-data-model-supabase]], [[05-analytics-spec]], [[06-voice-and-speech-to-text]]
