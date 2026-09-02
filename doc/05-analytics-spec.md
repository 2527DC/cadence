# 05 — Analytics Spec

App: **Cadence**
Status: **draft — the definitions below are opinions; argue with them before they ship**

> Every metric here has an explicit formula and an explicit statement of *what it is for*.
> A metric without a decision attached is decoration. If you cannot say what you would do
> differently based on a number, cut it.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Counted tasks** | Finalized tasks with status `C` or `N`. `NC` and `OPEN` are excluded. |
| **Completion rate** | `C / (C + N)` for a period. Range 0–1. Undefined (shown as "—", not 0) when there are no counted tasks. |
| **Kept week** | A completed week whose completion rate is at or above `profiles.streak_threshold` (default 0.70) **and** which had at least 3 counted tasks. |
| **Completed week** | A week whose Sunday has passed. In-progress weeks never count toward streaks. |
| **NC rate** | `NC / (C + N + NC)`. The self-honesty metric. |

**The minimum of 3 counted tasks in "kept week" matters.** Without it, a week with one
trivial task completed scores 100% and props up a streak. That would make the streak
meaningless within a month.

---

## 2. Progress metrics

### 2.1 This week at a glance

```
completed   = count(status = 'C')
missed      = count(status = 'N')
not_counted = count(status = 'NC')
open        = count(status = 'OPEN')
rate        = completed / nullif(completed + missed, 0)
```

Displayed as a segmented bar (green `C` / red `N` / grey `NC` / outlined `OPEN`) with the
rate as a large number beside it.

**Weighted variant:** if you use `weight`, also show `sum(weight) filter (C) / sum(weight)
filter (C or N)`. Show both, labelled "by count" and "by effort". They diverge exactly when
you are completing the easy things — which is worth seeing.

### 2.2 Goal progress

Per goal, per week:

```
attainment = least(completed_for_goal / target_per_week, 1)
```

Capped at 1 so overdelivering on one goal cannot mask neglecting another.

Cumulative since the goal's `start_week`:

```
expected  = weeks_elapsed * target_per_week
actual    = total completed for that goal
debt      = expected - actual        -- positive = behind
```

**`debt` is the number to show.** "You are 7 behind on Fitness" reads better and drives
action better than "63% attainment".

### 2.3 Time-to-close

Median hours between `finalized_at` and `closed_at`, per status.

*What it is for:* if your median time-to-close for `C` is 6 days, you are doing everything
on Sunday, which is fragile. Worth knowing.

---

## 3. Consistency metrics

### 3.1 Weekly streak

```
current_streak = number of consecutive completed weeks, counting backwards
                 from the most recent completed week, where kept_week = true.
                 Breaks on the first week that is not kept.
longest_streak = the maximum such run in all history.
```

**Decision needed (OQ-2): does a week with zero finalized tasks break the streak?**

- **Recommended: yes, it breaks.** A week where you committed to nothing is not a week you
  kept. Otherwise the easiest way to protect a streak is to stop planning — precisely the
  behaviour the app exists to catch.

### 3.2 Rolling consistency

```
consistency_12w = kept_weeks_in_last_12 / completed_weeks_in_last_12
```

More useful than the streak, honestly. A streak is brittle and one bad flu wipes it; a
12-week ratio survives real life and still tells you the truth. **Show this as the headline
consistency number, and the streak as a secondary badge.**

### 3.3 Day-of-week heatmap

For each weekday, across the last 12 weeks:

```
day_rate = count(C where closed_at::date's dow = d)
         / count(C or N where planned_for's dow = d)
```

*What it is for:* it shows which days you actually deliver on, so you can stop planning
four things for Fridays if Friday is where commitments go to die.

### 3.4 Goal reliability

Per goal, over the last 8 weeks:

```
reliability = weeks where the goal hit its target / weeks the goal was active
```

Ranked ascending. **The bottom item is the interesting one** — the goal you keep saying
yes to and keep not doing. Label the section honestly: "Goals you are not keeping".

---

## 4. Honesty metrics

These exist to catch you gaming your own app. They are the ones that make the whole thing
worth building.

### 4.1 NC rate

```
nc_rate_week = NC / (C + N + NC)
```

| Range | Display |
|---|---|
| 0 – 10% | Normal. Small grey number. |
| 10 – 20% | Amber. |
| > 20% | Red banner: *"1 in 5 tasks this week were marked Not Counted. Is that really true?"* |

Also track a 12-week NC trend. A rising NC rate with a stable completion rate is the
signature of quietly redefining failure as bad luck.

### 4.2 Late adds

```
late_add_rate = count(late_add) / count(finalized)
```

Tasks finalized after Wednesday. In the week breakdown, show the completion rate **with and
without** late adds. If they differ by more than 10 points, say so plainly.

### 4.3 Uncommitted drafts

```
uncommitted = drafts that reached Sunday without being finalized
```

Not a failure, but reported in the weekly review. A rising count means you are avoiding
commitment, which is a different problem from failing at it — and needs a different fix.

### 4.4 Note quality

```
median_note_length     = median(length(note)) for closing notes this week
voice_note_share       = notes that were voice / all notes
```

*What it is for:* when your notes get short, you have stopped reflecting and started
clicking through. It is an early warning that the habit is decaying, usually a week or two
before the completion rate drops.

---

## 5. Reflection surfaces

### 5.1 Notes timeline
Every closing note, newest first, filterable by status and goal. Voice notes play inline.
This is the single highest-value screen in the app after the planner, and it is trivial to
build — a FlashList over `task_status_events` joined to `tasks`.

### 5.2 Grouped `N` reasons
All `N` notes from the last 30 days in one view, so repeated excuses become visible by
simple proximity. **No AI clustering in v1** — reading twelve of your own sentences in a
row does the job, and it does it without a model inventing patterns that are not there.
(v2 candidate: embedding-based grouping. See OQ-7.)

### 5.3 Week-over-week comparison
Last week versus this week: rate, counts, which goals moved. Two columns, deltas coloured.

---

## 6. Dashboard layout

Top to bottom, in priority order:

```
┌──────────────────────────────────────────┐
│ THIS WEEK                                │
│  ▓▓▓▓▓▓▓░░░  72%     C 8 · N 3 · NC 1    │
│  4 still open · 2 days left              │
├──────────────────────────────────────────┤
│ CONSISTENCY                              │
│  9 of last 12 weeks kept   ·  🔥 4-week  │
│  ▁▃▅▂▆▇▅▇▆▇▄▇   12-week rate             │
├──────────────────────────────────────────┤
│ ⚠ 22% of this week was marked NC         │  ← only when triggered
├──────────────────────────────────────────┤
│ GOALS                                    │
│  Fitness      ████████░░  4/5   −7 behind│
│  Reading      ██████████  3/3   on track │
│  Side project ██░░░░░░░░  1/5   −18      │
├──────────────────────────────────────────┤
│ NOT KEEPING                              │
│  Side project — hit target 1 of last 8 wk│
├──────────────────────────────────────────┤
│ WHEN YOU DELIVER                          │
│  M ▇▇▇  T ▇▇▇▇  W ▇▇  T ▇▇▇▇▇  F ▇  S ▇▇ │
├──────────────────────────────────────────┤
│ RECENT NOTES                     see all │
└──────────────────────────────────────────┘
```

**Ordering principle:** current state, then trajectory, then warnings, then detail. The
number you should see first is the one you can still change — this week's.

---

## 7. Edge cases that must be handled explicitly

| Case | Behaviour |
|---|---|
| First week ever, no history | Show "not enough data yet" rather than 0%. A zero implies failure; absence does not. |
| A week with only `NC` tasks | Completion rate is **undefined**, shown as "—". Never 0%. That week is neither kept nor broken; it is skipped in the streak. |
| A goal created mid-week | Prorate nothing. It starts counting from its `start_week`. Simple beats clever. |
| Task reopened (`N` then later `C`) | The **current** status counts. The history shows the change, and the notes timeline shows both events. |
| Archived goal | Excluded from current-week views, included in all historical charts. Its past is still your past. |
| Timezone change while travelling | `profiles.timezone` is fixed at Asia/Kolkata by default and only changes if you change it. Weeks never retroactively shift. |

---

Related: [[01-product-requirements]], [[03-data-model-supabase]], [[04-architecture]], [[08-open-questions]]
