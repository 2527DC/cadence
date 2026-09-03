---
name: cadence-domain
description: The domain rules of the Cadence app that must never be violated - task statuses, the immutability guarantees, the mandatory note, NC semantics, week boundaries, and the analytics definitions. Load this before designing, building, reviewing, or changing anything that touches tasks, goals, closing, streaks, or the dashboard - and before proposing any UI affordance that deletes or edits committed work.
---

# Cadence domain rules

These describe **what was actually built in P01**, verified by `supabase/tests/`, not what
was once planned. If code and this file disagree, check the migrations — but assume this
file is right, because it was written from the schema.

## The one idea

A normal to-do app lets you delete a task you failed to do, so the record lies. This app
does not. Once a task is finalized it is permanent. You can only close it with an honest
status and an explanation. Everything below follows from that, and the analytics are
worth reading precisely because of it.

## Statuses

| Status | Meaning | Counts in the completion rate? |
|---|---|---|
| `OPEN` | Committed to, not yet resolved | Not yet |
| `C` | Completed | Yes, as a success |
| `N` | Not completed | Yes, as a failure |
| `NC` | Not counted — genuinely outside your control | **No. Excluded from the denominator.** |

`NC` requires a reason from the `nc_reason` enum: `illness`, `blocked_by_others`,
`cancelled_externally`, `plan_changed`, `other`. It exists so that "I had a fever for two
days" does not read as "I am inconsistent". It is also the obvious thing to abuse, which
is why `nc_rate` is tracked separately and shown.

## What the database will refuse

Do not design around any of these. They are enforced by triggers and RLS, they fail loudly,
and no client-side cleverness gets past them:

1. **A finalized task cannot be deleted.** Not by the app, not by a script, not by a curl
   call. Two independent layers stop it: the RLS policy and a trigger.
2. **A finalized task's title, goal, week and weight cannot change.** Only its status can.
3. **A finalized task cannot be reverted to a draft.**
4. **Status only ever moves through `close_task()`.** A direct `update tasks set status`
   is rejected, and so is inserting a task that is already closed.
5. **Closing requires a note of at least 15 characters, or a voice note.** Placeholder
   notes are rejected too.
6. **The `task_status_events` ledger is append-only.** No update policy, no delete policy,
   no grant. Corrections append; they never overwrite.
7. **Goals are archived, never deleted.**
8. **Voice notes are permanent** while anything references them.

**Drafts are the exception.** A task that has not been finalized is freely editable and
freely deletable. That is where all the flexibility lives, and it is deliberate: commitment
happens at finalization, and nowhere else.

### The rule this produces for UI work

> Never propose a delete button, a swipe-to-delete, an "undo", or an edit affordance for a
> finalized task. If a screen needs one, the screen is wrong. The honest gesture is
> *close it as `N` and say why*, and a correction is *close it again with the truth*, which
> appends a second event and keeps both.

## Closing a task

Always through the RPC:

```ts
supabase.rpc('close_task', {
  p_task_id: id,
  p_to_status: 'C' | 'N' | 'NC',
  p_note: '...',            // >= 15 chars, or pass p_voice_note_id instead
  p_voice_note_id: null,
  p_nc_reason: null,        // required when status is 'NC'
})
```

It writes the ledger row and flips the status in one transaction, so there is never a
moment where a task is closed without a note behind it. Closing a task to the status it
already has is an error. Closing a draft is an error.

## Weeks and time

- Weeks run **Monday to Sunday**. `week_start` is always a Monday, enforced by a check
  constraint on `tasks`, `goals` and `weekly_reviews`.
- The timezone is fixed to **Asia/Kolkata** (OQ-1, locked 2026-09-02). A day ends at
  midnight IST, and it does not shift when travelling.
- **`late_add`** is computed by the database, never sent by the client: a task finalized
  after Wednesday of its own week is a late add. Finalizing on Thursday to pad the week
  is visible in the data.

## Analytics definitions

Get these wrong and the app quietly lies, which is the only unforgivable bug here.

```
completion_rate = C / (C + N)         NC is NOT in the denominator
nc_rate         = NC / total          this one counts everything
```

A **kept week** (OQ-2, locked 2026-09-02) needs both:

- `completion_rate >= profiles.streak_threshold` (default 0.70), **and**
- at least **3** counted tasks

and — the part that is easy to miss — **a week with zero finalized tasks breaks the
streak.** Such a week produces no row in `v_week_rollup` at all, so any streak calculation
must generate the full series of weeks and treat a missing week as broken. Walking only the
rows the view returns makes "stop planning entirely" the cheapest way to protect a streak,
which is the exact behaviour this app exists to catch.

`v_week_rollup` and `v_goal_progress` are the SQL surfaces. Both are
`security_invoker = true`; leave them that way or they leak every user's data.

## Weights

`tasks.weight` (1–5) exists in the schema and defaults to 1. **The UI does not expose it**
(OQ-8, locked 2026-09-02). Do not add a weight picker unless that decision is revisited;
the column is there so the "by effort" metric can be switched on later without a migration.

## Where to look

| For | Read |
|---|---|
| The schema and every rule in SQL | `supabase/migrations/` |
| Proof the rules hold | `supabase/tests/` and `supabase/README.md` |
| Why the data model is shaped this way | `doc/03-data-model-supabase.md` |
| Metric formulas and what decision each drives | `doc/05-analytics-spec.md` |
| The product rules in prose | `doc/01-product-requirements.md` §4 |
