# Cadence — notes for whoever works on this next

## Expo SDK 54, not 57

Read the versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This project was scaffolded on SDK 57 and then deliberately downgraded to **SDK 54**,
because that is what Expo Go on the App Store runs and Expo Go is the only free route
onto the iPhone (see `doc/implementation/pending/P00-project-setup.md`). The two are not
API-compatible in the places this app touches:

| Thing | SDK 57 | SDK 54, what this project uses |
|---|---|---|
| Theme provider | exported from `expo-router` | `@react-navigation/native` |
| Native tab parts | `NativeTabs.Trigger.Label` / `.Icon` | top-level `Label` / `Icon` from `expo-router/unstable-native-tabs` |

`package.json.sdk57.bak` is a leftover of that downgrade and is not used.

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

## The rules that are not negotiable

Load the `cadence-domain` skill before touching tasks, goals, closing or the dashboard.
The short version: a finalized task can never be deleted or renamed, status only moves
through the `close_task` RPC, closing needs a real note, and the status ledger is
append-only. None of that is enforced in TypeScript — it is enforced in Postgres, and
the app simply avoids asking for what it cannot have.

**Never add a delete button, swipe-to-delete or edit affordance to a finalized task.**
Drafts are where all the flexibility lives.

## Commands

```bash
npm run start        # dev server; add --tunnel for the phone
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # jest, pure logic only

node ../supabase/db.mjs test    # 82 assertions against the local database
node ../supabase/db.mjs migrate # apply migrations (uses DATABASE_URL)
node ../supabase/gen-types.mjs  # regenerate src/types/database.types.ts
```
