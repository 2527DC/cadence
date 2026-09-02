# 08 — Decision Index

**The questions themselves now live inside the implementation phase files**, next to the work
they affect. This page is just the map, so the `OQ-n` references in the other documents still
resolve to somewhere.

You do not need to work through this file. Each phase asks you its own questions when you
open it, and every one has a recommended default — so nothing blocks if you say nothing.

---

## Where each question lives

| # | Question | Asked in | Blocking? |
|---|---|---|---|
| OQ-1 | Timezone and week boundary | [P01](implementation/pending/P01-supabase-schema-and-rls.md) | Yes — schema |
| OQ-2 | What counts as a "kept week" | [P01](implementation/pending/P01-supabase-schema-and-rls.md), confirmed in [P09](implementation/pending/P09-analytics-dashboard.md) | Yes — schema |
| OQ-3 | Finalization granularity | [P04](implementation/pending/P04-weekly-planner-and-finalization.md) | Yes — UI scope |
| OQ-4 | Chat thread structure | [P08](implementation/pending/P08-chat-log.md) | Yes — UI scope |
| OQ-5 | Cloud transcription now or later | [P07](implementation/pending/P07-speech-to-text.md) | Yes — phase scope |
| OQ-6 | Platforms (Android / iOS / both) | [P00](implementation/pending/P00-project-setup.md) | No |
| OQ-7 | AI features | [P09](implementation/pending/P09-analytics-dashboard.md) | No |
| OQ-8 | Weights | [P01](implementation/pending/P01-supabase-schema-and-rls.md) (column), [P04](implementation/pending/P04-weekly-planner-and-finalization.md) (UI) | No |
| OQ-9 | Where the code lives | [P00](implementation/pending/P00-project-setup.md) | No |
| OQ-10 | Notifications | [P11](implementation/pending/P11-notifications-weekly-review.md) | No |

**What you actually chose** gets written into each phase file's completion record when it
moves to `completed/`. That is the permanent answer — not this table.

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
| D-7 | Offline: React Query cache for reads, SQLite outbox for writes | [04-architecture.md](04-architecture.md) §3 |
| D-8 | Goals archive, never delete | [01-product-requirements.md](01-product-requirements.md) §5 |

---

Related: [[implementation/README]], [[01-product-requirements]], [[05-analytics-spec]]
