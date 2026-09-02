# P12 — Polish, Testing and Release

Depends on: every other phase
Estimate: 2 days
Skills to load: `react-native-testing`, `eas-workflows`, `eas-app-stores`, `code-review`

---

## Goal
Make it something you can rely on for a year without thinking about it.

## Tasks

### Testing
- [ ] Database tests re-run and all still pass (P01's destructive suite — **run these last, too**)
- [ ] Analytics tests: completion rate with NC, streak across a gap week, empty weeks, weighted rate
- [ ] Outbox tests: ordering, idempotency, retry cap, survives an app kill
- [ ] Week-boundary tests: Sunday 23:59 IST, Monday 00:01 IST, 31 Dec / 1 Jan
- [ ] Component test: the closing sheet's Save stays disabled until R3 is satisfied
- [ ] Maestro E2E flow A: finalize a task, then confirm no delete affordance exists anywhere
- [ ] Maestro E2E flow B: close a task with a voice note, end to end

### Polish
- [ ] Loading skeletons on every screen — no bare spinners
- [ ] Empty states everywhere, each with a sentence that says what to do next
- [ ] Error boundaries around each tab, so one bad screen does not kill the app
- [ ] Haptics on finalize, close and record-stop
- [ ] Accessibility: labels on icon buttons, minimum 44pt hit targets, dynamic type respected
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
- [ ] EAS production profile, `preview` for internal builds
- [ ] EAS Update channel configured — you will iterate, and OTA saves a store round-trip every time
- [ ] Production build installed on your device
- [ ] Backup plan documented: how to export the Supabase database, and where a dump goes
- [ ] Optional: `eas-observe` for crash reporting

### Documentation
- [ ] Write `cadence-domain` skill if P01 did not (see [../../07-skills-and-tooling.md](../../07-skills-and-tooling.md) §5.2)
- [ ] Update `doc/` with anything that drifted from the plan during implementation
- [ ] Record the OQ answers in `doc/08-open-questions.md`
- [ ] Move every phase file to `completed/` with its completion record

## Acceptance criteria

- [ ] All tests green
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
