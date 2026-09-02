# 00 — App Name Options

Status: **DECIDED — 2026-09-02**
Working name used across all docs: **Cadence**

Everything in `doc/` is written with `Cadence` as a placeholder. If you pick a
different name, it is a find-and-replace across `doc/` — nothing else depends on it.

---

## What the name has to carry

Your app is not a to-do list. Three things make it different, and the name should
lean on at least one of them:

1. **Immutability** — once a task is finalized it can never be deleted. It is a
   permanent record, like a ledger or a logbook.
2. **Consistency over completion** — the dashboard measures whether you *keep showing
   up*, not whether you cleared a list. Streaks, rhythm, weekly cycles.
3. **Reflection** — you must write or speak a note before you can close anything.
   The app is half tracker, half journal.

---

## Recommended: **Cadence**

- Means "a rhythm you maintain" — exactly what weekly goals + consistency analytics are.
- One word, easy to say, works as an app icon label.
- Neutral: not gendered, not gimmicky, ages well.
- Domain/handle availability is realistically poor, but this is a personal app — irrelevant.

**Second choice: `Nitya`** (Sanskrit — *constant, daily, perpetual*). Personal, short,
means precisely "the thing you do every day", and unlikely to collide with anything
in your app drawer.

---

## Full option list

### Tier A — rhythm & consistency (fits the analytics core)

| Name | Why it works | Watch out |
|---|---|---|
| **Cadence** | Rhythm you sustain. Best all-round fit. | Common word in dev tooling |
| **Nitya** | Sanskrit "daily/constant". Personal and distinct. | Needs explaining to others |
| **Tempo** | Pace you hold week to week. | Used by several existing apps |
| **Streakline** | Literal: the line your streak draws. | Slightly gamified feel |
| **Momentum** | What consistency actually builds. | Very heavily used name |
| **Dhruva** | Pole star — the fixed point. Great for "goals". | Less obviously about tasks |

### Tier B — ledger & permanence (fits the no-delete rule)

| Name | Why it works | Watch out |
|---|---|---|
| **Ledger** | Append-only record of what you did. Matches your data model exactly. | Reads financial |
| **Tally** | Counts C vs N vs NC. Short, honest. | Sounds simple/small |
| **Logbook** | A record you write in and never tear pages from. | Two syllables, a bit plain |
| **Immutable** | On-the-nose for the core constraint. | Too technical as a product name |
| **Anchor** | Fixed points you can't move. | Overlaps with the note-taking space |

### Tier C — reflection & voice (fits the WhatsApp-style voice log)

| Name | Why it works | Watch out |
|---|---|---|
| **Echo** | You speak to it, it plays back your patterns. | Amazon owns the association |
| **Voicemark** | Voice note + marking a task. Describes the app literally. | Compound, less elegant |
| **Abhyasa** | Sanskrit "repeated practice". Deep fit for the concept. | Hard to spell for others |
| **Reckon** | To account for yourself; also "to calculate". Double meaning. | Slightly archaic |

### Tier D — personal / initials

| Name | Why it works |
|---|---|
| **BC Weekly** | Your initials + the cycle. Zero ambiguity that it's yours. |
| **Week One** | Every week is week one. Nice framing for restarting after a bad week. |
| **Sunday** | Named after your weekly review day. Quiet and calm. |

---

## Decision — LOCKED 2026-09-02

Chosen. `Cadence` stays — no find-and-replace needed, every doc already uses it.

```
CHOSEN NAME: Cadence
BUNDLE ID:   com.bharath.cadence
EXPO SLUG:   cadence
```

Related: [[01-product-requirements]], [[02-tech-stack]]
