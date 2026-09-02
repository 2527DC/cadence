# P01 — Supabase Schema, Immutability and RLS

Depends on: P00
Estimate: 2 days
Skills to load: the `supabase` plugin (MCP + skills)

---

## Decisions needed in this phase

These three are **blocking** — they are columns and constraints in the schema, and changing
them later means a migration plus a backfill.

### OQ-1 — Timezone and week boundary
Weeks are Monday–Sunday. But *whose* Monday? If you close a task at 00:30 on Monday, does it
belong to last week or this week?

**Recommendation: fix the timezone to Asia/Kolkata**, stored in `profiles.timezone`. A day
ends at midnight IST. Predictable, and it does not shift when you travel.

- [x] **Accept — Asia/Kolkata** (LOCKED 2026-09-02, default taken)
- [ ] Something else: ______

### OQ-2 — What counts as a "kept week"?
This sets `profiles.streak_threshold` and defines the headline consistency number.

**Recommendation: completion rate ≥ 70% *and* at least 3 counted tasks.** A week with zero
finalized tasks **breaks** the streak — otherwise the easiest way to protect a streak is to
stop planning, which is exactly the behaviour this app exists to catch.

- [x] **Accept (70%, min 3, empty weeks break)** (LOCKED 2026-09-02, chosen explicitly)
- [ ] Different threshold: ____%
- [ ] Empty weeks should be neutral, not break

### OQ-8 — Weights
`weight` (1–5) lets a hard task count more than an easy one. It also adds a decision to
every task you create.

**Recommendation: keep the column, hide the UI.** Everything defaults to weight 1. If after a
month you notice your completion rate flatters you because you only finish small things,
switch the UI on in P04 — the schema and the "by effort" metric already support it.

- [x] **Accept — column now, UI later** (LOCKED 2026-09-02, default taken)
- [ ] Expose weights from day one (then also do the P04 UI half)
- [ ] Drop weights entirely (remove the column)

> If you say nothing, the recommendations are what gets built. Record what you chose in the
> completion record at the bottom of this file.

---

## Goal
The complete database from [../../03-data-model-supabase.md](../../03-data-model-supabase.md),
as versioned migrations, with **every immutability rule proven by a test that tries to
break it and fails.**

## Why this phase is the most important one
The entire value of Cadence is that the record cannot be falsified. That guarantee lives in
Postgres. Everything after this is a UI over a database that is either trustworthy or is
not. Do not move on until the destructive tests pass.

## Tasks

### Setup
- [ ] Create a Supabase project (**a dev project — see the warning in ../../07-skills-and-tooling.md §2.2**)
- [ ] `supabase init`, `supabase link`, `supabase start` for local Postgres
- [ ] Confirm the Supabase MCP server is connected and scoped to the dev project

### Migrations (in this order)
- [ ] `0001_init_enums_and_profiles.sql` — enums, `profiles`, on-signup trigger
- [ ] `0002_goals.sql`
- [ ] `0003_voice_notes.sql` — including the `tsvector` generated column + GIN index
- [ ] `0004_tasks.sql` — all check constraints
- [ ] `0005_task_status_events.sql`
- [ ] `0006_immutability_triggers.sql` — §4.1 to §4.4
- [ ] `0007_close_task_rpc.sql`
- [ ] `0008_chat.sql`
- [ ] `0009_weekly_reviews.sql`
- [ ] `0010_rls_policies.sql`
- [ ] `0011_analytics_views.sql`
- [ ] `0012_storage_bucket.sql` — private `voice-notes` bucket + policies

### Destructive tests — the point of the phase
Each of these must **fail with a clear error**:

- [ ] `delete from tasks where is_finalized = true` → rejected by RLS *and* by the trigger
- [ ] `update tasks set title = 'x' where is_finalized = true` → rejected
- [ ] `update tasks set is_finalized = false` → rejected
- [ ] `update tasks set status = 'C'` (direct, not via RPC) → rejected
- [ ] `select close_task(id, 'C', 'ok')` → rejected, note too short
- [ ] `select close_task(id, 'C', 'done')` → rejected, placeholder pattern
- [ ] `select close_task(id, 'NC', '<valid 20-char note>')` with no reason → rejected
- [ ] `delete from task_status_events` → rejected, no policy
- [ ] `delete from goals` → rejected, no policy
- [ ] A second user's JWT cannot select **any** row from any table

### Happy paths
- [ ] `close_task(id, 'C', '<20-char note>')` succeeds, writes exactly one event row
- [ ] `close_task` on an already-`C` task raises "already C"
- [ ] `C` then `N` writes a second event; history shows both
- [ ] Deleting a **draft** task succeeds
- [ ] `v_week_rollup` computes the correct rate with `NC` present (NC excluded from the denominator)

### Wrap up
- [ ] Seed script with 3 goals and 4 weeks of realistic tasks, including NC and reopened cases
- [ ] `supabase gen types typescript --local > src/types/database.types.ts`
- [ ] Write the `cadence-domain` skill (see ../../07-skills-and-tooling.md §5.2) now that the schema is real

## Acceptance criteria

- [ ] Every destructive test above fails with a readable message
- [ ] Every happy-path test passes
- [ ] `supabase db reset` rebuilds the whole database from migrations with no manual steps
- [ ] `database.types.ts` is generated and compiles
- [ ] Nothing was ever changed through the Supabase dashboard UI

## Definition of done
You can hand someone the `supabase/` folder and they can reproduce the exact database, and
you can demonstrate — live — that a finalized task cannot be deleted.
