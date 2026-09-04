# Personal

Personal application projects.

## Cadence — weekly goals and consistency tracker

**Status: feature-complete on paper, unproven in the hand (2026-09-04).**
Closed out: the database (P01), auth and shell (P02), goals (P03) and task closing (P05).
Built but not signed off: the planner (P04), voice notes (P06), the chat log (P08), the
dashboard (P09), the offline outbox (P10), notifications and the weekly review (P11), and
the polish pass (P12) — each has a completion record and a progress note saying exactly
what is left. Not built at all: speech-to-text (P07), which Expo Go cannot support, and
the native iOS build (P13) that would lift that ceiling.

`npx tsc --noEmit`, `npm run lint` and `npx jest` (268 assertions) are green, and the
database's 86 assertions pass. **The app has never been opened on the iPhone, and no iOS
bundle has been produced.** Most of what is still unticked is a thing you can only find
out by holding the phone.

A private weekly goal-and-task tracker where nothing you commit to can ever be deleted, only
closed with an honest status (`C` / `N` / `NC`) and a mandatory written or spoken note.
Voice notes are recorded, stored permanently and played back — *not* transcribed: on-device
speech-to-text needs a native module Expo Go does not ship, so transcripts and transcript
search wait for [P13](doc/implementation/pending/P13-ios-native-build.md). The whole record
feeds a dashboard of progress and consistency.

Stack: **Expo (React Native) + TypeScript + Supabase**.
The app lives in [`cadence/`](cadence/README.md) — start there to run it on the phone.

---

## Start here

| Read | For |
|---|---|
| [doc/00-app-name-options.md](doc/00-app-name-options.md) | **Pick the name.** "Cadence" is a placeholder. |
| [doc/implementation/README.md](doc/implementation/README.md) | **The 13-phase build plan.** Decisions are asked inside each phase file. |
| [doc/07-skills-and-tooling.md](doc/07-skills-and-tooling.md) | **Install the plugins** before any code is written. |
| [supabase/README.md](supabase/README.md) | **The database.** How to rebuild it, why it runs on local Postgres, and how to back it up. |
| [cadence/README.md](cadence/README.md) | **The app.** How to run it on the phone, the two `.env.local` files, and the four commands. |
| [cadence/AGENTS.md](cadence/AGENTS.md) | **Before writing any app code.** SDK 54 not 57, and the rules that are not negotiable. |

---

> **Where to pick this up:** [doc/RESUME.md](doc/RESUME.md). Everything in the working
> tree is **uncommitted**, and the next useful hour is spent with the phone, not the
> keyboard.

## Documents

```
doc/
├── 00-app-name-options.md         Naming options, with a recommendation
├── 01-product-requirements.md     What it does and why. The domain rules.
├── 02-tech-stack.md               Every library, with the reason and the rejected alternative
├── 03-data-model-supabase.md      Full schema, triggers, RLS, the close_task RPC
├── 04-architecture.md             Data flow, the outbox, the voice pipeline, testing strategy
├── 05-analytics-spec.md           Every metric formula, and what decision it drives
├── 06-voice-and-speech-to-text.md Recording, on-device STT, storage, playback, search
├── 07-skills-and-tooling.md       Claude Code plugins and skills to install
├── 08-open-questions.md           Index of which phase asks which decision
└── implementation/
    ├── README.md                  Workflow + phase table. Decisions live in phase files
    ├── pending/                   P00, P04, P06 … P13 (each ends with a progress note)
    └── completed/                 P01, P02, P03, P05 (each ends with a completion record)
```

```
supabase/                          The database. Where the app's promise is enforced.
├── README.md                      How to run it, and the rules the tests hold in place
├── db.mjs                         reset / migrate / seed / test / status / psql
├── gen-types.mjs                  regenerates cadence/src/types/database.types.ts
├── migrations/                    0001 … 0015, transplantable to hosted Supabase
├── local/                         auth.* and storage.* shims. Local only.
├── tests/                         86 assertions that try to falsify the record
└── seed.sql                       4 weeks of history, including an honest correction
```

---

## The core idea, in one paragraph

Normal to-do apps let you delete a task you failed to do, which means the record lies. This
one does not. Once you finalize a task it is permanent — the delete path does not exist in
the UI, in the API, in the RLS policy, or in the trigger. You can only close it as
completed (`C`), not completed (`N`), or not counted (`NC`), and you cannot close anything
without writing or speaking a note explaining why. The analytics that come out the other
side are therefore trustworthy, which is the entire point.

---

## Project-local skills

In `.claude/skills/`:

| Skill | What it is for |
|---|---|
| `cadence-domain` | **Load before touching tasks, goals, closing or the dashboard.** The rules that cannot be violated: the statuses, what the database will refuse, the week boundary, and the analytics definitions. Written from the schema, not from the plan. |
| `requirement-critic` | Critiques a requirement before it gets built: hidden assumptions, unspecified edge cases, conflicts with existing docs, how it could be simpler, and a ship / refine / reconsider verdict. |
| `routine-analyst` | Reads the raw notes in `context/raw/` and maintains an evidence-backed model of the days in `context/profile.md`. |
| `supabase`, `supabase-postgres-best-practices` | Installed from the marketplace (see `skills-lock.json`). Load before any schema, RLS or migration work. |

```
use the requirement-critic skill on <your idea>
```
