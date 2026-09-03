# The Cadence database

The whole promise of this app — *the record cannot be falsified* — lives here, not in
React. Everything in `migrations/` is enforcement; everything in `tests/` is proof that
the enforcement works.

---

## Quick start

```bash
node supabase/db.mjs reset    # drop, recreate, shim, migrate, seed
node supabase/db.mjs test     # 82 assertions. This is the one that matters.
node supabase/gen-types.mjs   # regenerate cadence/src/types/database.types.ts
```

Connection comes from `.env.local` at the repo root (gitignored; copy `.env.example`).

| Verb | What it does |
|---|---|
| `reset` | Drops the database and rebuilds it from nothing. The equivalent of `supabase db reset`. |
| `migrate` | Applies only migrations not yet in the ledger. |
| `seed` | Re-runs `seed.sql`. |
| `test` | Runs every file in `tests/`, reporting pass/fail per file. |
| `status` | Which migrations are applied. |
| `psql` | An interactive shell on the database. |

---

## Why this is not `supabase start`

P01 assumed a hosted Supabase dev project plus `supabase start` for local work, which
means Docker. This machine runs the database differently: **PostgreSQL 17 installed
natively**, no Docker daemon. That was a deliberate choice, and it costs less than it
sounds like it does.

What had to be built to make up the difference is exactly three things, all in
`local/0000_local_supabase_shim.sql`:

1. the `auth` schema, `auth.users`, and `auth.uid()` / `auth.role()` / `auth.jwt()`
2. the `storage` schema, `storage.buckets` / `storage.objects` / `storage.foldername()`
3. the `anon` / `authenticated` / `service_role` / `authenticator` roles

`auth.uid()` is Supabase's own definition, character for character: it reads the
`request.jwt.claims` GUC that PostgREST sets per request. That is what lets the tests
impersonate a user honestly:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```

### The shim is not a migration, and that is the point

It lives in `local/`, never in `migrations/`, and it is deliberately absent from the
migration ledger. Everything in `migrations/` is byte-for-byte what a real Supabase
project would run — because on a hosted project all three of those things already exist.

**Moving to hosted Supabase later is therefore a connection string, not a rewrite.**
Point `supabase link` at a project, run the same twelve files, skip the shim.

### What is genuinely missing locally

- **No GoTrue.** `auth.users` is a table, not an auth server. Sign-up, sessions and JWT
  minting arrive with P02, and until then the tests write the claim by hand.
- **No object storage.** `storage.objects` records rows and enforces the path policies,
  but no bytes are stored. P06 decides where local audio actually lives.
- **No PostgREST.** The app will talk to this through `@supabase/supabase-js` against a
  hosted project, or through a thin local adapter. That is a P02 decision.

---

## Moving to a hosted Supabase project

Set `DATABASE_URL` in `.env.local` to the project's connection URI (Dashboard ->
Project Settings -> Database -> Connection string -> URI), then:

```bash
node supabase/db.mjs migrate      # applies 0001..0014. Forward only, drops nothing.
node supabase/gen-types.mjs       # regenerate the types from the hosted schema
```

Use the **session pooler (port 5432)** or the direct connection. The transaction
pooler on 6543 cannot run the DDL and advisory locks migrations need.

Do **not** apply `local/0000_local_supabase_shim.sql` — Supabase already provides
`auth.uid()`, the `storage` schema and the roles, and the shim would collide with them.

Two verbs refuse to run against a remote host, by design:

| Verb | Why it is refused |
|---|---|
| `reset` | It drops and recreates the database. Against a hosted project that destroys everything, `auth.users` included. |
| `seed` | `seed.sql` writes straight into `auth.users`, forging accounts GoTrue never issued, which then own real rows. |

"Remote" means any host that is not localhost. There is no override flag; point
`PGDATABASE` at a local database instead.

---

## Layout

```
supabase/
├── db.mjs             the local stand-in for the Supabase CLI (psql under the hood)
├── gen-types.mjs      the local stand-in for `supabase gen types typescript`
├── seed.sql           4 weeks of history for one user + a second user for isolation
├── local/
│   └── 0000_local_supabase_shim.sql    auth.*, storage.*, roles. LOCAL ONLY.
├── migrations/        0001 .. 0014. Transplantable to hosted Supabase unchanged.
└── tests/
    ├── 01_destructive.sql   every way to falsify the record, all rejected
    ├── 02_happy_path.sql    the legitimate path still works, and the numbers are right
    └── 03_isolation.sql     two users, and neither can see the other
```

---

## The rules the tests hold in place

| Rule | Enforced by | Proven in |
|---|---|---|
| A finalized task can never be deleted | RLS policy **and** trigger, independently | `01`, checked at both layers |
| A finalized task's title/goal/week/weight is frozen | trigger | `01` |
| A task cannot be un-finalized | trigger | `01` |
| Status only ever moves through `close_task()` | trigger, on INSERT and UPDATE | `01` |
| Closing requires a real note (≥ 15 chars) or a voice note | `close_task()` + a check constraint | `01` |
| `NC` requires a reason | `close_task()` + a check constraint | `01` |
| The status ledger is append-only | no UPDATE/DELETE policy **and** no grant | `01` |
| Goals are archived, never deleted | no DELETE policy and no grant | `01` |
| Drafts *are* deletable | RLS policy, scoped to `is_finalized = false` | `01` |
| NC is excluded from the completion denominator | `v_week_rollup` | `02` |
| A kept week is ≥ 70% over ≥ 3 counted tasks | `v_week_rollup.is_kept_week` | `02` |
| No user can see another user's anything | RLS, including through the views | `03` |

### Two ways of saying no

The single most useful thing to know when reading `tests/01_destructive.sql`:

- a **trigger** or a **missing grant** raises an exception
- **RLS does not raise.** It filters the rows away and the statement reports *0 rows
  affected*, with no error at all

So `delete from tasks where is_finalized` as the app user is a silent no-op, not an
error. Asserting "this must throw" on it would fail for the wrong reason. Each layer is
tested with the assertion that fits it, and the finalized-delete case is checked twice:
once through RLS as the app user, once through the trigger as the owner with RLS
bypassed. That is the "a mistake needs two mistakes" property from `doc/03` §6.

### The tests were checked against a broken schema

Green tests mean nothing until you have watched them go red. Both of these were run:

| Mutation | Caught by |
|---|---|
| `drop trigger trg_guard_status_change on tasks` | `01` — status set directly, no note written |
| `alter view v_week_rollup set (security_invoker = false)` | `03` — user two saw 4 of user one's weeks |

The second one is worth dwelling on. Since Postgres 15 a view runs with its **owner's**
privileges unless declared `security_invoker = true`, and these views are owned by a
superuser. Without that flag every table underneath stays perfectly locked down and
`v_week_rollup` hands out the entire table to anybody who asks. `doc/03` §7 does not
mention it; `0011` sets it, and `03_isolation.sql` is what stops it going missing again.

---

## Conventions

- **Nothing is ever changed by hand.** Not through a dashboard, not through `psql`. A
  change that is not a numbered file in `migrations/` did not happen. `db.mjs reset` has
  to be able to rebuild everything from zero, and it is the only thing that is trusted.
- **Migrations are append-only.** Never edit an applied file; add the next number.
- **Every new rule gets a test that tries to break it and fails**, in the same commit.
- **Regenerate types after any schema change**: `node supabase/gen-types.mjs`.

### Restoring a dump

`0006` guards INSERT as well as UPDATE, so a plain data-only `pg_restore` will be
rejected — a restore inserts rows that are already closed, which is precisely what the
guard exists to forbid. Restore with triggers suspended:

```sql
set session_replication_role = replica;   -- as a superuser
-- ... restore ...
reset session_replication_role;
```
