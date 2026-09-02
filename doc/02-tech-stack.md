# 02 — Tech Stack

App: **Cadence**
Status: **proposed — confirm before `npx create-expo-app`**
Verified against: Expo SDK **57** (current release as of 2026-09-02), React Native 0.86, React 19.2

> Rule for this file: every library listed has a **reason** and, where there was a real
> alternative, the alternative and why it lost. If you want to swap something, this is
> the file to argue with.

---

## 1. Locked decisions (you specified these)

| Layer | Choice |
|---|---|
| App framework | **Expo (React Native)** — managed workflow, EAS for builds |
| Language | **TypeScript**, `strict: true` |
| Backend | **Supabase** — Postgres, Auth, Storage, Edge Functions, RLS |
| Platform target | Android first, iOS second (confirm in OQ-6) |

---

## 2. Core stack

### 2.1 App framework

| Package | Version target | Why |
|---|---|---|
| `expo` | SDK 57 | Latest stable. RN 0.86, React 19.2, New Architecture on by default. |
| `expo-router` | v6 (bundled with SDK 57) | File-based routing. Typed routes, tab + stack layouts, deep links for free. You need tabs (Week / Chat / Dashboard / Goals) — this is the least-effort correct answer. |
| `react-native` | 0.86 | Ships with SDK 57. Do not pin independently. |
| `typescript` | 5.x | `strict` on from day one. Non-negotiable for a schema-driven app. |

**New Architecture note:** it is default-on in SDK 57. Every library below is chosen partly
because it supports it. Do not disable it to make an old library work — replace the library.

### 2.2 Backend — Supabase

| Package | Why |
|---|---|
| `@supabase/supabase-js` v2 | The client. Also gives you Realtime if you later want live dashboard updates. |
| `react-native-url-polyfill` | Required by supabase-js on RN. |
| `expo-secure-store` | Stores the auth session in the OS keychain / keystore, not AsyncStorage. This is a private journal — the session token belongs in secure storage. |

**Supabase services used:**
- **Postgres** — all domain data. All immutability rules live here as constraints,
  triggers and RLS policies (see [03-data-model-supabase.md](03-data-model-supabase.md)).
- **Auth** — email OTP / magic link. Single user, but Auth gives you `auth.uid()`, which
  is what every RLS policy keys off. Do not skip auth "because it is just me".
- **Storage** — a private `voice-notes` bucket. Signed URLs only.
- **Edge Functions** — cloud transcription, and the nightly analytics rollup.
- **`pg_cron`** — schedules the weekly rollup and the Sunday review reminder.

### 2.3 Data layer

| Package | Why | Alternative rejected |
|---|---|---|
| `@tanstack/react-query` v5 | Server state, caching, optimistic updates, retry. Closing a task must feel instant and then reconcile — this is exactly what optimistic mutations are for. | Raw `useEffect` + `useState`. Rejected: you will reimplement caching badly. |
| `@tanstack/query-async-storage-persister` | Persists the query cache so the planner opens from cache in under 300ms and works offline for reads. | — |
| `zustand` | Small client-only UI state (recording state, active sheet, filters). ~1KB, no boilerplate. | Redux Toolkit. Rejected: far too much ceremony for a single-user app. |
| `expo-sqlite` | The **write outbox** for offline. Queued mutations survive an app kill. Reads come from the React Query cache; writes go through the outbox. | WatermelonDB. Rejected: a full sync engine is more machinery than one user needs. |

> **The offline design in one line:** React Query cache for reads, a SQLite outbox for
> writes, flushed by a background task when connectivity returns. Detailed in
> [04-architecture.md](04-architecture.md).

### 2.4 Audio and speech-to-text

| Package | Why |
|---|---|
| `expo-audio` | Recording and playback. **This is the current API — `expo-av` is removed.** Gives you metering for the waveform. |
| `expo-file-system` | Local recording files before upload; the durability guarantee. |
| `expo-speech-recognition` (`@jamsch/expo-speech-recognition`) | **On-device** speech-to-text via Apple Speech framework and Android SpeechRecognizer. Free, offline-capable, live interim results, volume metering. This is the "simple one" you asked for. |
| OpenAI Whisper (or Deepgram) via Edge Function | **Optional second pass** for accuracy on longer recordings. See [06-voice-and-speech-to-text.md](06-voice-and-speech-to-text.md). |

**The recommendation is a hybrid:** on-device transcription while you speak, so the text
appears live and works with no network; then an optional cloud re-transcription for
recordings over ~20 seconds, where on-device accuracy drops. Start with on-device only —
ship it, use it for two weeks, and only add cloud if the transcripts are genuinely too
poor to search.

### 2.5 UI and styling

| Package | Why | Alternative rejected |
|---|---|---|
| `nativewind` v4 | Tailwind classes in React Native. Fast to write, trivially consistent, and the design tokens live in one `tailwind.config.js`. | StyleSheet only. Rejected: you will drift on spacing and colour within a week. |
| `react-native-reanimated` v4 | Bundled with SDK 57. Needed by the bottom sheet, the chat list, and the recording waveform. | — |
| `react-native-gesture-handler` | Press-and-hold mic, swipe actions on tasks, sheet gestures. | — |
| `@gorhom/bottom-sheet` v5 | The task-closing sheet (F3) and the "attach to" sheet. Best-in-class, Reanimated 4 compatible. | Modal. Rejected: worse feel for the app's most-used interaction. |
| `@shopify/flash-list` v2 | The chat log and the notes timeline. Recycling list — smooth at thousands of messages, which this will reach. | FlatList. Rejected: it degrades on long chat histories. |
| `expo-symbols` + `@expo/vector-icons` | Native SF Symbols on iOS, vector fallback on Android. | — |
| `expo-haptics` | Tap feedback when you finalize or close a task. Small thing; makes the commitment feel real. | — |

### 2.6 Charts (the dashboard)

| Package | Why |
|---|---|
| `victory-native` (XL) + `@shopify/react-native-skia` | Skia-rendered, runs on the UI thread, handles the sparkline, bar charts and heatmap. Genuinely smooth. |

**Alternative if Skia feels heavy:** `react-native-gifted-charts` — pure RN, zero native
deps, much simpler API, slightly less polished output. If the dashboard turns out to be
the hard part, downgrade to this rather than fight Skia.

### 2.7 Forms and validation

| Package | Why |
|---|---|
| `react-hook-form` | Task and goal forms without re-render storms. |
| `zod` | One schema per entity, shared between the form, the API boundary and the outbox. The 15-character note rule is a zod refinement **and** a Postgres check — belt and braces. |

### 2.8 Supporting

| Package | Why |
|---|---|
| `date-fns` + `date-fns-tz` | ISO weeks, Monday starts, Asia/Kolkata pinning. Small, tree-shakeable. |
| `expo-notifications` | Sunday review reminder, optional daily nudge. |
| `expo-task-manager` + `expo-background-task` | Flushes the outbox and retries failed uploads in the background. |
| `expo-crypto` | UUIDs generated client-side, so offline-created rows already have their final ID. |
| `expo-localization` | Locale-correct date formatting. |

---

## 3. Tooling

| Tool | Purpose |
|---|---|
| `eslint-config-expo` + `prettier` | Lint and format. Run in a pre-commit hook. |
| `supabase` CLI | Local Postgres, migrations, type generation. **Every schema change is a migration file** — never a click in the dashboard. |
| `supabase gen types typescript` | Generates `database.types.ts`. Your client is then type-safe against the real schema. Re-run on every migration. |
| `jest` + `@testing-library/react-native` | Unit and component tests. |
| `maestro` | E2E flows. Two flows matter: finalize-then-try-to-delete, and close-with-note. |
| **EAS Build / EAS Update** | Cloud builds and over-the-air updates. You will iterate a lot; OTA saves you a store round-trip every time. |
| `expo-dev-client` | Required — `expo-speech-recognition`, Skia and SQLite are native modules, so **Expo Go will not work**. Build a dev client on day one. |

> **Set expectations now:** the moment you add `expo-speech-recognition`, you leave Expo Go
> behind. Budget the first session for getting a dev client onto your phone.

---

## 4. Project structure

```
cadence/
├── app/                          # expo-router routes
│   ├── (tabs)/
│   │   ├── index.tsx             # Weekly planner (default)
│   │   ├── chat.tsx              # WhatsApp-style log
│   │   ├── dashboard.tsx         # Analytics
│   │   └── goals.tsx
│   ├── task/[id].tsx
│   ├── goal/[id].tsx
│   ├── review/[week].tsx
│   └── _layout.tsx
├── src/
│   ├── api/                      # supabase queries + RPC wrappers
│   ├── components/               # dumb, reusable UI
│   ├── features/                 # tasks/ goals/ chat/ analytics/ voice/
│   ├── db/                       # sqlite outbox + migrations
│   ├── hooks/
│   ├── lib/                      # supabase client, date utils, config
│   ├── types/                    # database.types.ts (generated) + domain types
│   └── theme/                    # tailwind config, tokens
├── supabase/
│   ├── migrations/               # timestamped SQL, source of truth
│   ├── functions/                # edge functions
│   └── seed.sql
├── doc/                          # these documents
└── .claude/skills/               # project-local skills
```

---

## 5. Environment and secrets

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — safe on the client
  **only because RLS is correct**. The anon key is not a secret; RLS is the security.
- `SUPABASE_SERVICE_ROLE_KEY` — Edge Functions only. **Never** in the app bundle.
- `OPENAI_API_KEY` / `DEEPGRAM_API_KEY` — Edge Function secrets only, if you add cloud
  transcription. The app never calls the transcription vendor directly.

---

## 6. Deliberate non-choices

Things a tutorial would tell you to add, and why this project does not:

| Not using | Why |
|---|---|
| Redux / MobX | One user, one device. React Query plus Zustand covers it. |
| A custom Node backend | Supabase RPC and Edge Functions do everything you need. A server is one more thing to keep alive. |
| Firebase | You already chose Supabase, and Postgres is the right call here — your immutability rules are constraints and triggers, which Firestore cannot express. |
| GraphQL | One consumer. Adds a layer for nothing. |
| A component library (Tamagui, Gluestack) | NativeWind plus a handful of your own components is less to learn and less to fight. Revisit only if you find yourself rebuilding the same primitives. |
| Sentry / PostHog | v1 is private and single-user. Add Sentry if you start shipping to others. |

---

Related: [[01-product-requirements]], [[03-data-model-supabase]], [[04-architecture]],
[[06-voice-and-speech-to-text]], [[07-skills-and-tooling]]
