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
- [x] ~~Create a Supabase project~~ — **superseded**: built against local PostgreSQL 17 instead (see deviations)
- [x] Local database stood up: `supabase/local/0000_local_supabase_shim.sql` + `node supabase/db.mjs reset`
- [x] ~~Supabase MCP server~~ — **superseded**: no hosted project exists yet; `supabase/db.mjs` is the interface

### Migrations (in this order)
- [x] `0001_init_enums_and_profiles.sql` — enums, `profiles`, on-signup trigger
- [x] `0002_goals.sql`
- [x] `0003_voice_notes.sql` — including the `tsvector` generated column + GIN index
- [x] `0004_tasks.sql` — all check constraints
- [x] `0005_task_status_events.sql`
- [x] `0006_immutability_triggers.sql` — §4.1 to §4.4
- [x] `0007_close_task_rpc.sql`
- [x] `0008_chat.sql`
- [x] `0009_weekly_reviews.sql`
- [x] `0010_rls_policies.sql`
- [x] `0011_analytics_views.sql`
- [x] `0012_storage_bucket.sql` — private `voice-notes` bucket + policies

### Destructive tests — the point of the phase
Each of these must **fail with a clear error**:

- [x] `delete from tasks where is_finalized = true` → rejected by RLS *and* by the trigger
- [x] `update tasks set title = 'x' where is_finalized = true` → rejected
- [x] `update tasks set is_finalized = false` → rejected
- [x] `update tasks set status = 'C'` (direct, not via RPC) → rejected
- [x] `select close_task(id, 'C', 'ok')` → rejected, note too short
- [x] `select close_task(id, 'C', 'done')` → rejected — **but by the length check, not the placeholder pattern**. See the note in the completion record: the word alternatives in that regex are unreachable. Tested with 20 dots instead, which does reach it.
- [x] `select close_task(id, 'NC', '<valid 20-char note>')` with no reason → rejected
- [x] `delete from task_status_events` → rejected, no policy
- [x] `delete from goals` → rejected, no policy
- [x] A second user's JWT cannot select **any** row from any table

### Happy paths
- [x] `close_task(id, 'C', '<20-char note>')` succeeds, writes exactly one event row
- [x] `close_task` on an already-`C` task raises "already C"
- [x] `C` then `N` writes a second event; history shows both
- [x] Deleting a **draft** task succeeds
- [x] `v_week_rollup` computes the correct rate with `NC` present (NC excluded from the denominator)

### Wrap up
- [x] Seed script with 3 goals and 4 weeks of realistic tasks, including NC and reopened cases
- [x] `supabase gen types typescript --local > src/types/database.types.ts`
- [x] Write the `cadence-domain` skill (see ../../07-skills-and-tooling.md §5.2) now that the schema is real

## Acceptance criteria

- [x] Every destructive test above fails with a readable message
- [x] Every happy-path test passes
- [x] `supabase db reset` rebuilds the whole database from migrations with no manual steps
- [x] `database.types.ts` is generated and compiles
- [x] Nothing was ever changed through the Supabase dashboard UI

## Definition of done
You can hand someone the `supabase/` folder and they can reproduce the exact database, and
you can demonstrate — live — that a finalized task cannot be deleted.

---
## Completion record
- Completed: 2026-09-03
- Decisions made: none newly taken. OQ-1 (Asia/Kolkata), OQ-2 (70% over ≥3 counted
  tasks, empty weeks break the streak) and OQ-8 (weight column now, UI later) were all
  already locked on 2026-09-02 and were built exactly as written. OQ-2's "≥ 3 counted"
  half is not a per-user setting, so it lives in `v_week_rollup.is_kept_week` rather
  than in `profiles`.
- Verified by: `node supabase/db.mjs test` — 58 assertions across three files, all
  passing from a `db.mjs reset` with no manual steps. `npx tsc --noEmit` clean.
  The tests were also verified to be capable of failing: dropping
  `trg_guard_status_change` turns `01` red, and setting `v_week_rollup` to
  `security_invoker = false` turns `03` red.

### Deviations from plan

**1. Local PostgreSQL 17 instead of a hosted Supabase project + Docker.** Requested
directly. The three things the platform would have supplied — the `auth` schema and
`auth.uid()`, the `storage` schema, and the `anon`/`authenticated`/`service_role` roles
— are stood up by `supabase/local/0000_local_supabase_shim.sql`, which is deliberately
**not** a migration and is not in the migration ledger. Everything in `migrations/` is
therefore byte-for-byte what a hosted project would run, so the move later is a
connection string rather than a rewrite. What is genuinely missing locally: no GoTrue
(so no real sign-up until P02), no object storage bytes (P06 decides that), no
PostgREST.

**2. `supabase` CLI replaced by two small scripts.** `supabase/db.mjs` provides
`reset`/`migrate`/`seed`/`test`/`status`/`psql` over psql. `gen types typescript` runs
pg_meta in Docker, so `supabase/gen-types.mjs` introspects the catalogs directly and
emits the same file shape. Neither adds an npm dependency.

**3. §4.3 and §4.4 triggers extended to fire on INSERT, not only UPDATE.** As written in
doc/03 they leave the mandatory-note rule bypassable in a single statement:
`insert into tasks (..., is_finalized, finalized_at, status, closed_at) values (..., true,
now(), 'C', now())` produces a finalized, completed task with no ledger row and no note,
and every check constraint in 0004 permits it. Cost: a data-only `pg_restore` now needs
`set session_replication_role = replica`. Documented in `supabase/README.md`.

**4. Both analytics views declared `security_invoker = true`.** Not in doc/03 §7, and
the most dangerous omission found in this phase. Since Postgres 15 a view runs with its
**owner's** privileges by default, and these are owned by a superuser — so without the
flag, every table underneath stays perfectly locked down while `v_week_rollup` returns
every user's rows to anybody. Confirmed by mutation: removing the flag let user two read
4 of user one's weeks. `tests/03_isolation.sql` now guards it.

**5. Grants used as a third layer alongside RLS.** Where doc/03 §6 says "no delete
policy", 0010 also withholds the DELETE privilege. RLS only filters rows a role may
already touch, so a missing grant stops the statement before any policy is consulted —
and it fails loudly rather than silently affecting zero rows.

**6. `close_task` checks that `p_voice_note_id` belongs to the caller.** Foreign keys are
checked by the system and do not apply RLS, so without this a caller could attach
another user's recording as their mandatory note.

**7. `v_week_rollup` gained an `is_kept_week` column**, so OQ-2 is expressed in SQL
rather than re-derived by each consumer.

**8. pgcrypto is not installed.** `gen_random_uuid()` has been in core since Postgres 13.
Installing pgcrypto into `public` put ~35 crypto functions into the generated types.

### Findings worth carrying forward

- **The placeholder-note regex is mostly dead code.** `^(ok|done|na|n/a|nil|asdf|test|\.+|-+)$`
  can only be reached by a note that is already ≥ 15 characters, since the length check
  runs first. Every word alternative is shorter than that, so only the `\.+` and `-+`
  branches are reachable. Not fixed here — it is harmless, and the length check does the
  real work — but the regex promises more than it delivers.
- **The "empty weeks break the streak" half of OQ-2 cannot live in the view.** A week with
  no finalized tasks produces no row at all. The streak walker in **P09 must generate the
  full week series and treat a missing week as broken**, or "stop planning" becomes the
  cheapest way to hold a streak. Flagged in a comment in 0011 and in the `cadence-domain`
  skill.

### Follow-ups created
- None as new phase files. Two notes above are addressed to P09 and are recorded in the
  `cadence-domain` skill, which every future session loads.
- `doc/03-data-model-supabase.md` is now behind the migrations on deviations 3, 4, 5 and
  6. The migrations are the source of truth; the doc was left as the historical design
  record, as the plan intends.

---
## Addendum — 2026-09-03, during P02 setup

Supabase's own `supabase` agent skill was installed (`npx skills add supabase/agent-skills`)
and its RLS guidance was applied to this phase's output as
`migrations/0013_harden_rls_policies.sql`. Three changes, none of them a security fix:

1. `auth.uid()` wrapped as `(select auth.uid())` in every policy. Postgres treats the
   subquery as an InitPlan and evaluates it once per statement instead of once per row.
   This is the only change with a measurable effect.
2. Every policy now names its role with `TO authenticated`. They previously applied to
   `anon` as well, which held no grants and so could never reach the tables anyway.
3. UPDATE policies now spell out `WITH CHECK` explicitly.

**A claim made and then withdrawn, recorded because it is the kind of mistake worth
not repeating.** Point 3 was initially written up as a real vulnerability — that
0010's UPDATE policies, having a `USING` clause and no `WITH CHECK`, would let a user
reassign `user_id` and plant a permanent row in another user's history. A regression
test was written for it. **The test passed against the supposedly vulnerable policy**,
which is what caught the error: Postgres documents that when an UPDATE policy omits
`WITH CHECK`, the `USING` expression is used as the check on the new row as well. It
was then verified directly against the old policy — the reassignment raised
`new row violates row-level security policy` with `polwithcheck` null.

So 0010 was never exploitable. 0013 writes the implicit behaviour down, which is still
worth having, and `tests/03_isolation.sql` gained two assertions (60 total) that pin the
reassignment rule so a future edit cannot silently weaken it.

The lesson: the mutation test is what distinguishes a real finding from a plausible one.
Every security claim in this phase should be provable by watching a test go red first.

---
## Addendum 2 — 2026-09-03, applying the schema to hosted Supabase

The schema was applied to the hosted project `ewqmmnuxmndamisoxlsx`. All fourteen
migrations applied unchanged, which was the point of keeping the shim out of
`migrations/`. Verified there: RLS on all 8 tables, both views `security_invoker`,
2 storage policies, the `voice-notes` bucket private at 50 MB.

### A real vulnerability, found only because it was applied to hosted

**`migrations/0014_revoke_default_privileges.sql`.**

0010 uses grants as a third layer behind RLS and the triggers: where the design says
"no delete", the role never receives DELETE, so the statement dies before any policy is
consulted. That holds locally, where this project controls every grant.

A hosted Supabase project ships **default privileges that grant ALL on new tables in
`public` to `anon`, `authenticated` and `service_role`.** So the moment 0001–0009 created
these tables there, every role held `DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
TRUNCATE, UPDATE` on all eight tables and both views — including DELETE and UPDATE on
the append-only ledger, and SELECT on everything for `anon`.

RLS still refused the DELETEs, so nothing was reachable through PostgREST and nothing
looked wrong. The third layer was simply gone.

**TRUNCATE is what makes it a real hole. RLS does not apply to TRUNCATE, and TRUNCATE
does not fire row-level DELETE triggers.** Neither `prevent_finalized_task_delete` nor
any policy has the slightest effect on it. Demonstrated against the local database with
the hosted grant set applied, as a plain `authenticated` user:

```
truncate tasks, task_status_events, goals, ... cascade;
   24 finalized tasks -> 0
   19 ledger rows     -> 0
```

One statement, from a role that any sign-up receives, erased the entire record — past
both layers the whole design rests on.

0014 revokes everything from `anon` and `authenticated`, re-grants exactly the matrix
0010 intended, and sets `alter default privileges ... revoke all` so the next table
created does not quietly get the blanket grant back. Confirmed on hosted afterwards:
`authenticated` holds `INSERT,SELECT` on `task_status_events`, TRUNCATE is granted to no
client role anywhere, and `anon` now gets `42501 permission denied` from the REST API
where it previously got `200 []`.

`tests/04_grants.sql` asserts the whole grant matrix from `pg_catalog`, with TRUNCATE
called out separately. It reads the catalog rather than testing behaviour on purpose:
RLS was masking the surplus DELETE grants, so no behavioural test could have found them.
Mutation-checked — restoring `grant all ... to anon, authenticated` turns both `01` and
`04` red.

**Unlike the withdrawn claim in Addendum 1, this one was demonstrated before it was
written up.**

### Tooling fix

`db.mjs` previously routed every verb through `DATABASE_URL` once it was set, so
`db.mjs test` ran the destructive suite against the hosted project. The files roll their
work back so nothing persisted, but it was wrong. `reset`, `seed` and `test` now always
use the local `PG*` connection and refuse to run at all unless `PGHOST` is local;
`DATABASE_URL` is reserved for `migrate`, `status`, `psql` and type generation.

- Test count: 82 assertions across four files.
