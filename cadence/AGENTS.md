# Cadence — notes for whoever works on this next

## Expo SDK 57

Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

This project was scaffolded on 57, downgraded to 54 on a mistaken belief that Expo Go
needed it, and put back on **57** on 2026-09-04. Expo Go from the App Store tracks the
current SDK, so 57 is the version that actually opens on the phone. **Do not downgrade it
again.** What the round trip cost, in case any of it resurfaces:

| Thing | SDK 54 | SDK 57, what this project uses |
|---|---|---|
| Theme provider | `@react-navigation/native` | exported from `expo-router` |
| Native tab parts | top-level `Label` / `Icon` | `NativeTabs.Trigger.Label` / `.Icon` |
| react-navigation | a real dependency | **must not be installed** — see below |
| TypeScript | 5.9, auto-included `@types/*` | 6.0, `types` must be listed in tsconfig |

**Never install `@react-navigation/*`.** As of SDK 56 expo-router no longer sits on top of
react-navigation — it vendors its own copy. Importing the standalone package loads a
second navigation library and Metro refuses to bundle. That refusal is correct; do not set
`EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK=1` to get past it.

**Hoisting bites here.** `babel-preset-expo` and `expo-modules-core` each resolved only
under `expo/node_modules` after a reinstall — the first broke every bundle, the second
broke the entire jest suite. Both are now explicit top-level dependencies. If a tool
reports a module missing that clearly exists, run `npm ls <pkg>` and check for nesting
before anything else.

## React 19 rules are enforced, and reactCompiler is on

`app.config.ts` sets `experiments.reactCompiler: true`, so a render may be retried or
discarded. `const ref = useRef(v); ref.current = v` during render is rejected by
`react-hooks/refs`, and the objection is real, not stylistic — that write can happen twice
or be thrown away.

In order of preference:

1. **Remove the need for the ref.** State plus a `useMemo` keyed on the plain values it
   closes over. `src/features/voice/waveform-view.tsx` is the worked example.
2. **`src/hooks/use-latest-ref.ts`** when the value is only ever read from an effect, a
   timer, or an async continuation.
3. A targeted `// eslint-disable-next-line react-hooks/refs` **only** when an imperative
   API must be built once *and* see values that change while it lives.
   `voice-recorder-button.tsx` is the one such case: its PanResponder accumulates `dx`
   across the hold to arm slide-to-cancel, so rebuilding it mid-gesture silently breaks
   cancelling.

`useEffectEvent` exists in React 19.2 and looks like the answer, but its result **cannot
be passed into another function or a dependency array** — it trips `rules-of-hooks`. It
does not help with PanResponder or any other imperative API.

## Before adding any dependency

Check it against the ❌ list in P00. Expo Go ships a fixed set of native modules, and one
outside it red-screens the whole app at *import* time, not at call time. `@shopify/react-native-skia`,
`@jamsch/expo-speech-recognition` and remote push are all out until P13.

## Environment

Two `.env.local` files, and they are not interchangeable:

- **`cadence/.env.local`** — `EXPO_PUBLIC_*`. Expo loads `.env` from the directory the
  CLI starts in, so these must sit here, next to `app.config.ts`. A value in the repo
  root is invisible to the bundler.
- **`../.env.local`** — `DATABASE_URL` and `PG*`, read by `supabase/db.mjs`. The app
  never sees these.

`EXPO_PUBLIC_*` values are inlined into the bundle and are not secret. That is fine for
the Supabase publishable key and wrong for anything else — the `service_role` key must
never appear in this app.

## Auth

Email and password, with **Log in** (`app/sign-in.tsx`) and **Create account**
(`app/register.tsx`) as separate screens. There is no OTP or magic-link flow; do not
reintroduce one. Both screens share `src/features/auth/auth-form.tsx` so their validation
cannot drift apart.

Wrong password and unknown address deliberately produce the same message, and password
reset always says "if that address has an account" — a form that distinguishes them is an
account-enumeration oracle.

## Logging

Every Supabase request and response is logged in dev through a `fetch` wrapper
(`src/lib/http-log.ts`) on the client. Passwords and tokens are redacted at any depth; if
you add a field that carries a credential, add its name to `SECRET_KEYS`.

## The rules that are not negotiable

Load the `cadence-domain` skill before touching tasks, goals, closing or the dashboard.
The short version: a finalized task can never be deleted or renamed, status only moves
through the `close_task` RPC, closing needs a real note, and the status ledger is
append-only. None of that is enforced in TypeScript — it is enforced in Postgres, and the
app simply avoids asking for what it cannot have.

**Never add a delete button, swipe-to-delete or edit affordance to a finalized task.**
Drafts are where all the flexibility lives.

## Commands

```bash
npm run start        # dev server; add --tunnel for the phone
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # jest, pure logic only — 12 suites, 268 tests

node ../supabase/db.mjs test    # 86 assertions against the local database
node ../supabase/db.mjs migrate # apply migrations (uses DATABASE_URL)
node ../supabase/gen-types.mjs  # regenerate src/types/database.types.ts
```
