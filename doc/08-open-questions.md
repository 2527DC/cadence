# 08 — Decision Index

**The questions themselves now live inside the implementation phase files**, next to the work
they affect. This page is just the map, so the `OQ-n` references in the other documents still
resolve to somewhere.

You do not need to work through this file. Each phase asks you its own questions when you
open it, and every one has a recommended default — so nothing blocks if you say nothing.

---

## Where each question lives

| # | Question | Asked in | Answered |
|---|---|---|---|
| OQ-1 | Timezone and week boundary | [P01](implementation/completed/P01-supabase-schema-and-rls.md) | **Asia/Kolkata, Monday–Sunday.** Fixed, not device-local. Locked 2026-09-02. |
| OQ-2 | What counts as a "kept week" | [P01](implementation/completed/P01-supabase-schema-and-rls.md), confirmed in [P09](implementation/pending/P09-analytics-dashboard.md) | **rate >= `profiles.streak_threshold` (0.70) AND at least 3 counted tasks.** A week with no finalized tasks breaks the streak. Locked 2026-09-02, confirmed unchanged 2026-09-04. |
| OQ-3 | Finalization granularity | [P04](implementation/pending/P04-weekly-planner-and-finalization.md) | **Both.** A lock per draft, and "Commit N tasks" for the week. |
| OQ-4 | Chat thread structure | [P08](implementation/pending/P08-chat-log.md) | **Per-goal threads plus a Daily log**, reached by a chip bar rather than a thread-list screen. |
| OQ-5 | Cloud transcription now or later | [P07](implementation/pending/P07-speech-to-text.md) | **Unanswered, and blocked.** P07 cannot be built under Expo Go. See [P13](implementation/pending/P13-ios-native-build.md). |
| OQ-6 | Platforms (Android / iOS / both) | [P00](implementation/pending/P00-project-setup.md) | **iPhone via Expo Go.** No Apple Developer account, no Mac. Decided 2026-09-02. |
| OQ-7 | AI features | [P09](implementation/pending/P09-analytics-dashboard.md) | **All three deferred.** Nothing on the dashboard is generated. |
| OQ-8 | Weights | [P01](implementation/completed/P01-supabase-schema-and-rls.md) (column), [P04](implementation/pending/P04-weekly-planner-and-finalization.md) (UI) | **Column now, no UI.** `tasks.weight` defaults to 1; the effort rate only appears once some task carries a weight above 1. |
| OQ-9 | Where the code lives | [P00](implementation/pending/P00-project-setup.md) | **`cadence/` inside this repo**, alongside `doc/` and `supabase/`. |
| OQ-10 | Notifications | [P11](implementation/pending/P11-notifications-weekly-review.md) | **Exactly two, local.** Sunday 20:00 IST to review, Monday 09:00 IST to plan. No badges, no daily prompts. |
| OQ-11 | Pay $99/yr for a native iOS build | [P13](implementation/pending/P13-ios-native-build.md) | **Unanswered.** Nothing depends on it except P07 and remote push. |

Each answer above is repeated, with its reasoning, in the completion record of the phase
that made it. Those records are the permanent version; this table is the index.

**What you actually chose** gets written into each phase file's completion record. That is
the permanent answer — not this table.

---

## Decisions already made (no action needed)

| # | Decision | Where |
|---|---|---|
| D-1 | Expo + React Native, TypeScript strict | [02-tech-stack.md](02-tech-stack.md) |
| D-2 | Supabase — Postgres, Auth, Storage, Edge Functions | [02-tech-stack.md](02-tech-stack.md) |
| D-3 | Immutability enforced in the database, not just the UI | [03-data-model-supabase.md](03-data-model-supabase.md) |
| D-4 | Status changes only via the `close_task` RPC | [03-data-model-supabase.md](03-data-model-supabase.md) §5 |
| D-5 | `NC` excluded from the completion-rate denominator | [05-analytics-spec.md](05-analytics-spec.md) §1 |
| D-6 | Analytics as live Postgres views, not materialized | [04-architecture.md](04-architecture.md) §5 |
| D-7 | Offline: React Query cache for reads, an outbox for writes. **Built on React Query's persisted mutation cache rather than SQLite — see the P10 completion record.** | [04-architecture.md](04-architecture.md) §3 |
| D-8 | Goals archive, never delete | [01-product-requirements.md](01-product-requirements.md) §5 |

---

Related: [[implementation/README]], [[01-product-requirements]], [[05-analytics-spec]]
