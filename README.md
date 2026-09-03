# Personal

Personal application projects.

## Cadence — weekly goals and consistency tracker

**Status: building.** P01 (the database) is done and tested. P00 (the app scaffold) is
built but not yet verified on the iPhone, so it is still in `pending/`.

A private weekly goal-and-task tracker where nothing you commit to can ever be deleted, only
closed with an honest status (`C` / `N` / `NC`) and a mandatory written or spoken note.
Voice notes are transcribed on-device and stored permanently. The whole record feeds a
dashboard of progress and consistency.

Stack: **Expo (React Native) + TypeScript + Supabase**.

---

## Start here

| Read | For |
|---|---|
| [doc/00-app-name-options.md](doc/00-app-name-options.md) | **Pick the name.** "Cadence" is a placeholder. |
| [doc/implementation/README.md](doc/implementation/README.md) | **The 13-phase build plan.** Decisions are asked inside each phase file. |
| [doc/07-skills-and-tooling.md](doc/07-skills-and-tooling.md) | **Install the plugins** before any code is written. |
| [supabase/README.md](supabase/README.md) | **The database.** How to rebuild it, and why it runs on local Postgres. |

---

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
    ├── pending/                   P00, P02 … P13
    └── completed/                 P01
```

```
supabase/                          The database. Where the app's promise is enforced.
├── README.md                      How to run it, and the rules the tests hold in place
├── db.mjs                         reset / migrate / seed / test / status / psql
├── gen-types.mjs                  regenerates cadence/src/types/database.types.ts
├── migrations/                    0001 … 0012, transplantable to hosted Supabase
├── local/                         auth.* and storage.* shims. Local only.
├── tests/                         82 assertions that try to falsify the record
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

`.claude/skills/requirement-critic/` — critiques a requirement before it gets built:
hidden assumptions, unspecified edge cases, conflicts with existing docs, how it could be
simpler, and a ship / refine / reconsider verdict.

```
use the requirement-critic skill on <your idea>
```
