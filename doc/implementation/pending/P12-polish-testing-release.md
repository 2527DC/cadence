# P12 — Polish, Testing and Release

Depends on: every other phase
Estimate: 2 days
Skills to load: `react-native-testing`, `eas-workflows`, `eas-app-stores`, `code-review`

---

## Goal
Make it something you can rely on for a year without thinking about it.

## Tasks

### Testing
- [x] Database tests re-run and all still pass (P01's destructive suite — **run these last, too**)
- [x] Analytics tests: completion rate with NC, streak across a gap week, empty weeks, weighted rate
- [x] Outbox tests: ordering, idempotency, retry cap, survives an app kill
- [x] Week-boundary tests: Sunday 23:59 IST, Monday 00:01 IST, 31 Dec / 1 Jan
- [ ] Component test: the closing sheet's Save stays disabled until R3 is satisfied
- [ ] Maestro E2E flow A: finalize a task, then confirm no delete affordance exists anywhere
- [ ] Maestro E2E flow B: close a task with a voice note, end to end

### Polish
- [ ] Loading skeletons on every screen — no bare spinners
- [x] Empty states everywhere, each with a sentence that says what to do next
- [x] Error boundaries around each tab, so one bad screen does not kill the app
- [x] Haptics on finalize, close and record-stop
- [x] Accessibility: labels on icon buttons, minimum 44pt hit targets, dynamic type respected
- [ ] Dark mode verified on every screen
- [ ] App icon and splash screen
- [ ] All copy reviewed once, in one sitting, for a consistent voice

### Performance
- [ ] Planner opens in under 300ms from cache
- [ ] Dashboard renders in under 500ms
- [ ] The chat stays smooth at 1000+ messages
- [ ] No re-render storms (profile the planner and the chat with the React DevTools profiler)
- [ ] Bundle size checked; drop anything unused

### Release
- [x] EAS production profile, `preview` for internal builds
- [ ] EAS Update channel configured — you will iterate, and OTA saves a store round-trip every time
- [ ] Production build installed on your device
- [x] Backup plan documented: how to export the Supabase database, and where a dump goes
- [ ] Optional: `eas-observe` for crash reporting

### Documentation
- [x] Write `cadence-domain` skill if P01 did not (see [../../07-skills-and-tooling.md](../../07-skills-and-tooling.md) §5.2)
- [x] Update `doc/` with anything that drifted from the plan during implementation
- [x] Record the OQ answers in `doc/08-open-questions.md`
- [ ] Move every phase file to `completed/` with its completion record

## Acceptance criteria

- [x] All tests green
- [ ] Both Maestro flows pass
- [ ] The production build runs standalone, with no dev server
- [ ] A full database backup has been taken and restored once, successfully
- [ ] All performance targets met on your actual device, not a simulator

## Definition of done
You have used the app for four consecutive weeks without needing to open a terminal.

## The real test
After a month, open the dashboard and ask whether you learned something about yourself that
you did not already know. That is what this was for. If the answer is no, the problem is
almost certainly in [../../05-analytics-spec.md](../../05-analytics-spec.md), not in the code —
go back and change what is measured.

---
## Completion record
- **Not complete: 1 of 5 acceptance criteria met, as of 2026-09-04.** Everything that
  can be done from a Windows PC with no phone attached is done. Everything that cannot
  is listed at the bottom, and it is the whole release half of the phase.
- Decisions made:
  - **No `@testing-library/react-native`.** It was not installed and this run added no
    dependencies, so the test suite stays pure logic. That is why the closing sheet's
    "Save stays disabled until R3" is proven at the `canSubmit` / `submitBlocker` level
    in `src/features/closing/draft.test.ts` rather than by rendering the sheet.
  - **Two error boundaries, not one.** A root one outside every provider, and a
    per-route one inside them. See below.
  - **Nothing was deleted from `assets/` or `src/` to shrink the bundle**, although the
    dead files were identified. See the outstanding list.
- Verified by:
  - `npx tsc --noEmit` — clean.
  - `npm run lint` — clean, zero warnings.
  - `npx jest` — **268 assertions across 12 suites, all passing.**
  - `node supabase/db.mjs test` — **86 assertions across 4 files, all passing**, re-run
    on 2026-09-04 as this phase asks. (The README and `cadence/AGENTS.md` both said 82;
    corrected.)
  - Two mechanical audits, written for this phase and run over `cadence/src`:
    - **Every `Pressable` in the app has an `accessibilityRole`** (33 of them). The 14
      without an `accessibilityLabel` all carry visible text, which is what a screen
      reader announces instead.
    - **Every `bg-*`, `text-*` and `border-*` that uses a themed token has a `dark:`
      pair — 184 uses, zero gaps.**
- **Nothing has been verified on a physical device, and no iOS bundle was produced in
  this run.** No `expo start`, no `expo export`, no `npm install`. Every claim in this
  record comes from the type checker, the linter, the two test suites, or reading the
  code.

### What this phase actually changed

1. **A root error boundary** — `src/components/error-boundary.tsx`, exported as
   `ErrorBoundary` from `app/_layout.tsx`. expo-router wraps the layout route in it,
   which puts it *outside* the query client, the auth provider, the theme and the
   navigator, so a throw in any of them still draws something readable. It uses no
   NativeWind classes and no context — if the styling pipeline is what failed, a
   className-styled fallback would fail with it — so it is inline styles read from the
   same hex values as `tailwind.config.js`, switched on `useColorScheme()`. It also
   calls `SplashScreen.hideAsync()`: the root layout holds the splash up until the
   session has been read, and a crash before that point would otherwise leave the
   splash sitting on top of the error. That is the white screen again, just blue.
2. **A per-route boundary** on all seven routes — the four tabs, the task detail, the
   review and sign-in — so one bad screen leaves the tab bar and the other tabs alive.
3. **`ErrorState` in `src/components/ui.tsx`**, with every screen's failed-read branch
   moved onto it. The message is shown verbatim (the database's refusals were written
   to be read by a person), there is always a "Try again" where the caller can offer
   one, and the red dot always sits beside a heading that says the same thing in words.
   Two screens gained error handling they did not have: the task detail now
   distinguishes "this query failed" from "that task is not in this week", and its
   history has a failure state.
4. **Keyboard handling on the two forms that lacked it** — the new-goal sheet is now
   inside a `KeyboardAvoidingView` (its Create button sat under the keyboard), and the
   weekly review's scroll view persists taps and adjusts its keyboard inset, so Save
   works on the first tap with the keyboard up.
5. **Orphan voice-note recovery is finally called.** `retryPendingUploads()` had been
   exported since P06 and invoked by nothing; `resumeOutbox()` now runs it, then
   `pruneLocalCache()`, fire-and-forget after the queue replay. Until this change P06's
   "kill the app mid-record, recovered on next launch" could not have passed.
6. **`eas.json`** with `development` / `preview` / `production` profiles, internal
   distribution on preview, and `appVersionSource: "remote"` — this project has a
   dynamic `app.config.ts`, so `autoIncrement` has nowhere on disk to write a version
   back to.
7. **`app.config.ts`** — `ITSAppUsesNonExemptEncryption: false` declared honestly, the
   `expo-notifications` plugin added for P13's native build, and a comment recording
   that iOS has **no** Info.plist usage string for notifications: the only explanation
   anyone ever sees is the sentence in the Reminders card, directly above the button
   that triggers the system prompt.
8. **Docs** — completion records on P04, P05, P06, P08, P09, P10, P11 and this file;
   the OQ answers written into `doc/08-open-questions.md`; a backup plan in
   `supabase/README.md`, with `backups/` and `*.dump` gitignored; `cadence/README.md`
   written; `doc/RESUME.md` rewritten; the phase table and the root README brought in
   line with what is actually true.

### Deviations from plan
1. **Labelled spinners, not skeletons.** `Loading` is an `ActivityIndicator` with a
   sentence under it — "Reading your weeks", "Opening", "Reading what you wrote" — and
   an `accessibilityLabel`. A skeleton would be better and is not built. The task said
   "no bare spinners", and there are none.
2. **No Maestro.** Not installed, and installing it was out of scope for this run.
   Both flows remain unwritten and unrun.
3. **The app icon and splash are still Expo's scaffold images.**
   `assets/images/icon.png` and `splash-icon.png` have never been replaced.

### Follow-ups created
None as files. The outstanding work is in the Progress note below.

---
## Progress — 2026-09-04 (the desk half is done; the phone half has not started)

**Green:** `npx tsc --noEmit`, `npm run lint`, `npx jest` (268 assertions),
`node supabase/db.mjs test` (86 assertions).

Outstanding, and none of this needs a phone:

- [ ] **Component test: the closing sheet's Save stays disabled until R3 is satisfied.**
      Needs `@testing-library/react-native`, which is not installed. The logic behind
      Save is covered — `it('cannot be triggered with a 14-character note')` — but the
      component itself is never rendered by a test.
- [ ] **Loading skeletons.** See deviation 1.
- [ ] **App icon and splash screen.** Still Expo's defaults.
- [ ] **All copy reviewed once, in one sitting.** Not done. Most of it was read while
      writing these records and it is consistent, but that is not the same as sitting
      down with all of it at once.
- [ ] **Bundle size: drop anything unused.** The dead files were found and **not**
      removed, because file deletion was refused in this session. They are:
      `cadence/src/constants/theme.ts`, `cadence/src/hooks/use-color-scheme.ts` and
      `use-color-scheme.web.ts` (nothing imports any of them),
      `cadence/scripts/reset-project.js` with its `reset-project` npm script,
      `package.json.sdk57.bak` at the repo root, and in `cadence/assets/images/`:
      `react-logo*.png`, `expo-badge*.png`, `expo-logo.png`, `logo-glow.png`,
      `tutorial-web.png` and the whole `tabIcons/` folder — none of which is referenced
      by `src/` or by `app.config.ts`. Deleting them is a five-minute job.
- [ ] **EAS Update channel.** `eas.json` names a channel per profile, but
      `expo-updates` is not installed and `app.config.ts` has no `updates.url` or
      `runtimeVersion` — both need an EAS project id, which needs an account. This
      belongs with P13.
- [ ] **Move every phase file to `completed/`.** Only **P05** met all of its acceptance
      criteria and moved. P04 (5 of 6), P11 (4 of 5), P09 (3 of 6), P10 (1 of 6), P06
      (1 of 6) and P08 (0 of 6) stayed, each with a completion record and a truthful
      Progress note naming exactly what is left. **P07 and P13 were not touched.**

Outstanding, and needs the phone:

- [ ] Maestro flow A (finalize a task, then confirm no delete affordance exists
      anywhere) and flow B (close a task with a voice note, end to end). Neither is
      written.
- [ ] Every performance target: planner under 300ms from cache, dashboard under 500ms,
      chat smooth at 1000+ messages, no re-render storms — all on the actual device.
- [ ] Dark mode looked at on every screen. The palette is provably complete (184
      utility uses, every one paired); whether it *reads* well is a thing you look at.
- [ ] A production build installed and running standalone with no dev server.
- [ ] A full database backup taken and restored once. The plan is written
      (`supabase/README.md`, "Backups") and has never been rehearsed — which means
      there is, right now, no backup.
