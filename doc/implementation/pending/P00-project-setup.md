# P00 — Project Setup (Expo Go on iPhone)

Depends on: nothing
Estimate: 0.5 day
Skills to load: `expo-project-structure`, `expo-overview`

---

## Decisions needed in this phase

### OQ-6 — Platforms
- [x] **iPhone first, via Expo Go** (LOCKED 2026-09-02)
- [ ] Android first
- [ ] Both from day one

**Why this changed from the original recommendation.** The original plan said *Android first,
with an EAS dev client*. The constraint that decided it instead: the only device available is
an **iPhone**, the only computer is **Windows**, and there is **no Apple Developer account**.

That combination rules out every native-build path:

| Path to a native iOS build | Blocked by |
|---|---|
| `eas build -p ios` (cloud, from Windows) | Ad-hoc device provisioning requires the **paid** $99/yr Apple Developer Program |
| Xcode + free Apple ID | Requires a **Mac**; also expires every 7 days, max 3 apps |
| Unsigned IPA + AltStore/Sideloadly | Still needs a Mac to *produce* the IPA |
| `eas build -p ios --profile simulator` | Produces a `.app` for the macOS Simulator only — useless on hardware |

iOS refuses to launch any binary that is not signed against a provisioning profile containing
the device UDID. That is enforced by the OS. There is no Expo-side workaround.

**Expo Go is therefore the only ₹0 route onto this iPhone**, and it is a good one: it covers
P00–P06 completely. See the compatibility contract below for exactly what it costs us.

### OQ-9 — Where does the code live?
- [x] **Local git only, no remote for now** (LOCKED 2026-09-02)

`git init` at `personal/` so `doc/`, `cadence/` and `supabase/` share one history — a migration
you cannot diff is a migration you cannot trust. A private GitHub remote can be added any time
with `git remote add`; nothing depends on it existing today.

---

## Goal
A running Expo SDK 57 app **on the physical iPhone, through Expo Go**, with TypeScript strict,
NativeWind, linting, and the folder structure from
[../../02-tech-stack.md](../../02-tech-stack.md) section 4.

---

## The Expo Go compatibility contract

This is the constraint every later phase must respect. **Read it before adding any dependency.**

Expo Go ships a fixed set of native modules. Anything outside that set cannot be `require`d —
the app will red-screen at import time, not at call time, so one bad dependency breaks the
whole build. The original P00 said flatly *"Expo Go cannot run this app"*; that was checked
module by module and is **too strong**. The accurate split:

### ✅ Available in Expo Go — safe to use now
`expo-router` · `expo-sqlite` · `expo-audio` · `expo-file-system` · `expo-secure-store` ·
`expo-crypto` · `expo-network` · `expo-haptics` · `react-native-reanimated` ·
`react-native-gesture-handler` · `react-native-safe-area-context` · `react-native-screens`

JS-only, so always fine: `nativewind` · `@tanstack/react-query` · `zustand` ·
`@supabase/supabase-js` · `@gorhom/bottom-sheet` · `date-fns`

### ❌ NOT in Expo Go — deferred to P13
| Module | Used by | Deferred consequence |
|---|---|---|
| `@jamsch/expo-speech-recognition` | P07 speech-to-text | **Voice notes record and play, but do not transcribe.** No transcript search until P13. |
| `@shopify/react-native-skia` | P06 waveform | Use a plain `View`-bar waveform driven by `expo-audio` metering instead. Visually simpler, functionally identical. |
| `expo-notifications` (remote push) | P11 | Local notifications still work in Expo Go; **remote push does not**. The Sunday review reminder becomes a scheduled *local* notification, which is what a single-user app needs anyway. |

### The rule
> **Do not install a native module without checking it against this list first.**
> If a phase needs one, it goes to P13 — it does not quietly break the only way we can run
> the app.

---

## Tasks

- [x] Name locked: `Cadence`, slug `cadence`, bundle id `com.bharath.cadence`
- [ ] `npx create-expo-app@latest cadence --template default` (Expo Router + TypeScript)
- [ ] Confirm SDK 57 / React Native 0.86 in `package.json`, and that Expo Go on the App Store supports that SDK
- [ ] `tsconfig.json`: `"strict": true`, path alias `@/*` → `src/*`
- [ ] Install NativeWind v4 + tailwindcss, create `tailwind.config.js` with the colour and spacing tokens
- [ ] Verify `babel.config.js` plugin order (Reanimated must be last)
- [ ] Create the folder structure: `app/(tabs)/`, `src/{api,components,features,db,hooks,lib,types,theme}`
- [ ] ESLint (`eslint-config-expo`) + Prettier, plus npm scripts `lint` and `typecheck`
- [ ] `app.config.ts` — slug, bundle id, mic permission string. **No `expo-dev-client`.**
- [ ] `eas.json` with `preview` / `production` profiles, kept for P13; not used yet
- [ ] Install Expo Go from the App Store on the iPhone
- [ ] `npx expo start --tunnel` → scan QR → app loads on the iPhone
- [ ] `git init` at `personal/`, `.gitignore` (node_modules, .env*, ios/, android/, .expo/)
- [ ] `.env.example` documenting every variable

## Acceptance criteria

- [ ] The app opens in Expo Go on the physical iPhone over `--tunnel` (works off the local Wi-Fi)
- [ ] A NativeWind-styled element renders correctly (proves the Tailwind pipeline works)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes
- [ ] Fast Refresh works end to end
- [ ] `package.json` contains **no** module from the ❌ list above

## Definition of done
You can change a string in `app/(tabs)/index.tsx` and see it on the iPhone in under three
seconds, with no type errors.

## Notes
- Do **not** `expo prebuild`, and do not commit `ios/` or `android/`. The moment those exist,
  Expo Go stops being the source of truth and P13 arrives early.
- The dev server must be running on the PC for the app to load. That is the real cost of this
  route, and it is why P13 exists.
