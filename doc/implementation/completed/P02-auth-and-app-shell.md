# P02 — Auth and App Shell

Depends on: P00, P01
Estimate: 1 day
Skills to load: `expo-router`, `expo-design-system`, `frontend-design`

---

## Goal
Supabase auth working, the four-tab shell navigable, the theme system in place, and React
Query wired up with persistence.

## Tasks

### Supabase client
- [ ] `src/lib/supabase.ts` — client with `expo-secure-store` as the session store
- [ ] `react-native-url-polyfill/auto` imported at the app entry
- [ ] Auto token refresh on app foreground, paused on background

### Auth
- [ ] Email OTP sign-in screen (magic link / 6-digit code)
- [ ] `_layout.tsx` route guard: unauthenticated goes to `/sign-in`
- [ ] Session restored on cold start without a visible flash of the sign-in screen
- [ ] Sign out, which also clears the React Query cache
- [ ] A profile row is created on first sign-in (trigger from P01) with timezone Asia/Kolkata

### Shell
- [ ] `(tabs)` layout: Week · Chat · Dashboard · Goals, with icons
- [ ] `app/_layout.tsx`: QueryClientProvider, GestureHandlerRootView, BottomSheetModalProvider, SafeAreaProvider
- [ ] React Query persister (AsyncStorage), `staleTime` 5 min, `gcTime` 24 h
- [ ] Placeholder screens for all four tabs

### Theme
- [ ] Tailwind tokens: colours (including status colours for C / N / NC / OPEN), spacing, radii, type scale
- [ ] Dark mode via `useColorScheme` (decide once now, not per-screen later)
- [ ] Base components: `Text`, `Button`, `Card`, `Screen`, `EmptyState`

## Acceptance criteria

- [ ] Sign in with email OTP works on the device
- [ ] Killing and reopening the app keeps you signed in, with no auth flash
- [ ] All four tabs navigate, back gesture behaves
- [ ] The status colours are defined **once** and imported everywhere
- [ ] `npx tsc --noEmit` passes

## Definition of done
The app is a real, signed-in, navigable shell. Every subsequent phase fills in a screen
rather than setting up plumbing.

## Note on status colours
Pick them now and never redefine them. `C` green, `N` red, `NC` neutral grey, `OPEN`
outlined. **`NC` must not look like a success.** It is neither good nor bad, and it should
read as neither.

---
## Completion record
- Completed: 2026-09-03
- Decisions made: none required by this phase. Email OTP as planned; no password, so
  there is nothing to store or leak.
- Verified by: `npx tsc --noEmit`, `npm run lint`, `npx expo export --platform ios`
  (bundles clean), and 32 jest assertions. The hosted project answers `GoTrue v2.196.0`
  and `close_task` / `v_week_rollup` resolve in the PostgREST schema cache — both return
  "permission denied" rather than "not found", which is the correct answer for `anon`.
  **Not verified on the physical iPhone.** The first real sign-in happens there.

### Deviations from plan

1. **A plain `Modal`, not `@gorhom/bottom-sheet`.** One fewer dependency to check
   against P00's Expo Go list, and `presentationStyle="pageSheet"` gives the same
   gesture on iOS. If the closing sheet needs snap points in P05 polish, revisit it.
2. **Sign-out lives on the Dashboard** rather than a settings screen, which does not
   exist yet. It is the "about you" tab, so it is not a bad home; P12 can move it.
3. **The session store chunks.** `expo-secure-store` rejects values over 2048 bytes and
   a Supabase session routinely exceeds that, so the adapter splits across numbered keys
   and writes the count last — an interrupted write reads back as "no session" rather
   than a corrupt half-session. Without this, sign-in appears to work and then the
   session vanishes on relaunch.

### Two bugs found while building this

- **`.env` location.** Expo loads `.env` files from the directory the CLI starts in, so
  the `EXPO_PUBLIC_*` values had to move from the repo root to `cadence/.env.local`. In
  the root they are invisible to the bundler and the app throws at import. Caught because
  the jest run failed on the missing variable, not because anything was tested for it.
  The bundler now prints `env: load .env.local` on every build, which is the proof.
- **`AGENTS.md` still pointed at the SDK 57 docs** after the downgrade to 54. Corrected,
  with the specific API differences that actually bit (`ThemeProvider`, `NativeTabs`).

### Not done
- Haptics on state changes (P12 polish).
- No `@testing-library/react-native`, so no rendering tests. Pure logic only, by design
  — component tests belong with P12.
