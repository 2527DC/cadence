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
