# context/ — what I know about Bharath

This folder is the input to the `routine-analyst` skill. It exists so that advice about your
days is grounded in **what you actually wrote down**, not in generic productivity opinions.

```
context/
├── README.md      you are here
├── raw/           ← YOU WRITE HERE. Any .md file, any format, no structure required.
├── profile.md     the distilled understanding. The skill maintains this. Don't hand-edit
│                  it to be nicer than the evidence.
├── questions.md   open questions the skill needs answered to go further
└── log/           one file per analysis pass: what changed and why
```

---

## How to use it

1. Write whatever you want into `context/raw/`. A brain dump, a bad day, a week's log, a
   list of things you keep failing at. **No format. No structure. Do not tidy it up** —
   tidied notes are edited notes, and edited notes are the thing this whole project exists
   to avoid.
2. Say: `use the routine-analyst skill`
3. Answer the questions it asks.
4. Read `profile.md` and tell it where it is wrong.

Repeat whenever you have something new to dump. It is designed to be run many times; each
pass sharpens the model rather than restarting it.

---

## The one rule for `raw/`

**Never delete or rewrite a raw file.** Add a new one. If something you wrote in March turns
out to be wrong, the fact that you believed it in March is itself data — it is exactly how
you find out that you have been telling yourself the same story for six months.

Name files `YYYY-MM-DD-topic.md` so the chronology survives.

This is the same rule as the app's: the record is append-only, because a record you can edit
is a record that flatters you.

---

## Privacy

`git` here is **local only** — no remote (decision OQ-9 in
[../doc/implementation/pending/P00-project-setup.md](../doc/implementation/pending/P00-project-setup.md)).
This folder is committed, because how your self-understanding changed over time is worth
having a history of.

> **If you ever add a GitHub remote:** make the repo **private**, or add `context/` to
> `.gitignore` first. This folder will contain things you would not post.

---

## What this is not

It is not the app. Cadence tracks *what you committed to and whether you did it*. This folder
holds *who you are and what keeps getting in the way* — the context that makes the app's
numbers mean something. If a finding here is stable enough to commit to, it should become a
**goal in Cadence**, not another note in `raw/`.

If you find yourself using `raw/` as a to-do list, that is the signal that the app is ready
to take over.
