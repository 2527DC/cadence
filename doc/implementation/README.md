# Implementation

App: **Cadence**

---

## How this folder works

```
doc/implementation/
├── README.md          ← you are here
├── pending/           ← phases not yet done. Work happens here.
└── completed/         ← phases finished, verified, and closed out.
```

### The rule

A phase file moves from `pending/` to `completed/` **only when every acceptance criterion in
it is checked and verified** — not when the code compiles, and not when it looks right on
screen.

When moving a file, append a **Completion record** to the bottom of it:

```markdown
---
## Completion record
- Completed: YYYY-MM-DD
- Decisions made: <what you chose for the OQ questions at the top of this file>
- Verified by: <how — which test, which manual check>
- Deviations from plan: <what you built differently, and why>
- Follow-ups created: <new files added to pending/, if any>
```

The **deviations** line is the important one. In six months the plan will not match the code,
and this is the only place that will tell you why.

### Decisions live inside the phase files

There is no separate open-questions document to work through. A phase that needs a decision
from you asks for it in a **"Decisions needed in this phase"** section at the top of its own
file, with a recommended default already selected in the tasks below it.

**If you say nothing, the recommendation is what gets built.** Record what you actually chose
in the completion record when the file moves to `completed/`.

[../08-open-questions.md](../08-open-questions.md) is only an index showing which phase asks
which question — you never have to open it.

### Working a phase

1. Open the phase file in `pending/`.
2. Confirm its dependencies are in `completed/`.
3. **Answer the "Decisions needed in this phase" section**, or accept the recommendations.
4. Load the skills it lists (see [../07-skills-and-tooling.md](../07-skills-and-tooling.md)).
5. Work the task checklist, ticking as you go.
6. Verify every acceptance criterion.
7. Run `code-review` over the diff.
8. Append the completion record and move the file.

---

## Platform: Expo Go on iPhone (decided 2026-09-02)

No Apple Developer account, no Mac, Windows PC, iPhone. That rules out every native iOS build
path, so the app runs through **Expo Go** — see [P00](pending/P00-project-setup.md) for the full
reasoning and the **compatibility contract**.

What this costs, and nothing else does:

- **P07 (speech-to-text) cannot be built.** Voice notes still record, store and play back.
  They just have no transcript, so transcript search is unavailable until [P13](pending/P13-ios-native-build.md).
- The Skia waveform becomes a metering-driven bar view. No practical loss.
- The Sunday reminder becomes a **local** notification instead of a push. Fine for one user.
- The dev server must be running on the PC for the app to open.

Everything else — P01 through P06, P08 (without transcripts), P09, P10, P11, P12 — is unaffected.

> **Before installing any dependency, check it against the ❌ list in P00.** One native module
> outside Expo Go's bundle red-screens the entire app at import time.

---

## Database: local PostgreSQL 17 (decided 2026-09-03, in P01)

There is no hosted Supabase project and no Docker daemon. The database is the PostgreSQL
install on this PC, driven by two dependency-free scripts that stand in for the Supabase
CLI:

```bash
node supabase/db.mjs reset    # the equivalent of `supabase db reset`
node supabase/db.mjs test     # 82 assertions proving the record cannot be falsified
node supabase/gen-types.mjs   # the equivalent of `supabase gen types typescript`
```

Everything in `supabase/migrations/` is exactly what a hosted project would run.
The three things the platform would have provided — `auth.uid()`, the `storage`
schema, and the Supabase roles — live in `supabase/local/`, outside the migration
ledger, so **moving to hosted Supabase later is a connection string, not a rewrite.**

What this defers: real sign-up (GoTrue) until **P02**, and actual audio bytes until
**P06**. See [../../supabase/README.md](../../supabase/README.md).

---

## Phases

| # | Phase | Depends on | Decisions | Est. |
|---|---|---|---|---|
| P00 | [Project setup and dev client](pending/P00-project-setup.md) | — | OQ-6, OQ-9 | 0.5 day |
| P01 | ✅ [Supabase schema, immutability, RLS](completed/P01-supabase-schema-and-rls.md) | P00 | **OQ-1, OQ-2, OQ-8** | 2 days |
| P02 | [Auth and app shell](pending/P02-auth-and-app-shell.md) | P00, P01 | — | 1 day |
| P03 | [Goals](pending/P03-goals.md) | P02 | — | 1 day |
| P04 | [Weekly planner and finalization](pending/P04-weekly-planner-and-finalization.md) | P03 | **OQ-3**, OQ-8 | 2 days |
| P05 | [Task closing with mandatory note](pending/P05-task-closing-flow.md) | P04 | — | 2 days |
| P06 | [Voice recording and storage](pending/P06-voice-recording-and-storage.md) | P02 | — | 2 days |
| P07 | [Speech-to-text](pending/P07-speech-to-text.md) | P06 | **OQ-5** | 1.5 days |
| P08 | [Chat log](pending/P08-chat-log.md) | P06, P07 | **OQ-4** | 2 days |
| P09 | [Analytics dashboard](pending/P09-analytics-dashboard.md) | P05 | OQ-2, OQ-7 | 3 days |
| P10 | [Offline sync and outbox](pending/P10-offline-sync-outbox.md) | P05, P06 | — | 2 days |
| P11 | [Notifications and weekly review](pending/P11-notifications-weekly-review.md) | P09 | OQ-10 | 1 day |
| P12 | [Polish, testing, release](pending/P12-polish-testing-release.md) | all | — | 2 days |
| P13 | [iOS native build — lifts the Expo Go ceiling](pending/P13-ios-native-build.md) | P06 | **OQ-11** | 0.5 day + $99/yr, or won't-do |

Bold decisions are the ones that are expensive to change later — they become schema columns
or phase scope. The rest can be revisited freely.

**Rough total: 22 working days.** Treat that as a shape, not a commitment — P09 in particular
tends to expand, because the dashboard is the part with the most taste in it.

---

## Suggested order

The dependency graph allows two independent tracks after P02:

```
P00 → P01 → P02 ─┬─► P03 → P04 → P05 ──┬─► P09 → P11 ─┐
                 │                      │              ├─► P12
                 └─► P06 → P07 → P08 ───┴─► P10 ───────┘
```

**Do the task track (P03→P05) first.** It contains the core promise of the app — commit,
cannot delete, must explain. If that loop is not good, the voice features are decoration on
something that does not work. Get to P05 and *actually use it for a week* before starting P06.

That week of real use is the single highest-value thing in this plan. It will change P09.

---

## Milestones worth stopping at

| After | You can |
|---|---|
| P05 | Use the app for its core purpose. Plan a week, commit, close with notes. **Start using it here.** |
| P08 | Speak your notes instead of typing them. |
| P09 | See whether you are actually consistent. |
| P12 | Rely on it. |

---

Related: [[01-product-requirements]], [[02-tech-stack]], [[04-architecture]], [[07-skills-and-tooling]]
