# P08 — Chat Log (WhatsApp-style)

Depends on: P06, P07
Estimate: 2 days
Skills to load: `react-native-performance`, `expo-animation`, `react-native-reusables`

---

## Decisions needed in this phase

### OQ-4 — Chat thread structure
How many conversations?

**Recommendation: one thread per goal, plus one "Daily log" thread.** Enough structure to find
things later, not so much that you have to decide where a thought belongs before you can write
it down. The tasks below assume this.

- [x] Accept — per-goal threads + Daily log
- [ ] Single thread only — everything in one stream, simplest possible (drop the thread-list tasks)
- [ ] Free-form threads I create myself (adds a thread-management screen)

---

## Goal
The informal capture surface: a chat where you type or speak thoughts, blockers and wins,
optionally attached to a task or goal.

## Tasks

### Threads
- [x] Auto-create a "Daily log" thread on first sign-in
- [x] Auto-create one thread per goal, on goal creation
- [ ] Thread list: title, last message preview, timestamp, unread-style ordering
- [x] Chat tab opens the last-used thread, not the list

### Messages
- [ ] `FlashList`, inverted, newest at the bottom
- [x] Date separators ("Today", "Yesterday", then the date)
- [x] Text bubbles with timestamps
- [ ] Voice bubbles: waveform, duration, play/pause, transcript below
- [x] Input bar: text field, send button, mic button — mic swaps in when the field is empty (the WhatsApp behaviour)
- [x] Hold-to-record in the chat, reusing the P06 recorder
- [x] Pagination: 50 messages per page, loads more on scroll
- [x] Optimistic send — the bubble appears immediately with a "sending" state

### Linking
- [ ] Long-press a message → "Attach to task" / "Attach to goal"
- [x] A linked message shows a chip with the task or goal title
- [ ] Linked messages appear in the task detail timeline as well
- [x] Tapping the chip navigates to that task or goal

### Search
- [x] Extend the P07 search to cover `messages.body_tsv` as well
- [ ] Union and rank results across text and transcripts
- [x] Filter by thread

## Acceptance criteria

- [ ] Scrolling stays smooth at 1000+ messages
- [ ] Send a voice message from the chat, and it plays from the bubble
- [ ] Attach a message to a task, and it appears in that task's detail timeline
- [ ] Search finds both a typed word and a spoken word
- [ ] Sending offline queues, and the bubble shows "sending" until it lands
- [ ] The keyboard does not cover the input bar on either platform

## Definition of done
Use it for two days as an actual daily log. If typing a thought takes more than two taps,
the input design needs another pass.

## Scope guard
This is a **log**, not a messaging app. No reactions, no replies, no forwarding, no editing.
One person is talking to their own record. Every "chat feature" you are tempted to add is
almost certainly not needed here.

---
## Completion record
- **Not complete: 0 of 6 acceptance criteria met, as of 2026-09-04.** The log itself
  works; two criteria are blocked by P07 never having been built, one names a feature
  that genuinely does not exist, and the other three need the phone.
- Decisions made:
  - **OQ-4 — per-goal threads plus a Daily log.** The recommendation, unchanged. What
    changed is how you move between them: a row of chips above the log rather than a
    thread-list screen, so switching is one tap and the log never leaves the screen.
  - **No long-press menu, anywhere.** A message cannot be edited, deleted, forwarded or
    reacted to. The log is only worth reading later because it cannot be tidied
    afterwards, which is the same argument as the task ledger.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest`.
  - `src/features/chat/model.test.ts` — day separators computed *forwards* in an
    inverted list (the thing that is easy to get backwards), page cursors, the
    text/voice `body_matches_kind` split that migration 0008 enforces, and search
    normalisation.
  - `src/lib/outbox.test.ts` — the send path's ordering, replay and idempotency rules.
  - `node supabase/db.mjs test` (2026-09-04): `04_grants.sql` confirms `messages` and
    `threads` carry no DELETE grant, which is why `src/api/chat.ts` has no delete
    function and cannot have one.
- **Not verified on a physical device**, and no iOS bundle was produced in this run.

### Deviations from plan
1. **`FlatList`, not `FlashList`.** `@shopify/flash-list` is not in Expo Go's bundled
   modules (P00), so this is a hard constraint rather than a preference. The list is
   inverted, windowed (`windowSize={11}`, `removeClippedSubviews`) and paginated at 50.
   Whether that is enough at 1000 messages is acceptance criterion 1, and unmeasured.
2. **No thread-list screen.** A `ThreadBar` of chips replaces it, so there is no "last
   message preview, timestamp, unread-style ordering". For one person with three or
   four goals, a list of four rows was a screen to get out of rather than a feature.
3. **Threads are created on demand, not on a hook.** The Daily log is created the first
   time the tab is opened and a goal thread the first time its chip is tapped, rather
   than at sign-in and at goal creation. Identical outcome, no orphan threads for goals
   nobody ever writes about.
4. **A link is attached at send time, through a sheet, not by long-pressing a message
   afterwards.** Messages are insert-only, so "attach later" would need an UPDATE the
   grants do not allow. The composer shows the chosen chip before you send.
5. **No transcripts anywhere**, because P07 cannot be built under Expo Go (see the
   platform note in `../README.md`). Voice bubbles carry a waveform, a duration and
   play/pause, and that is all they can carry until P13.

### Follow-ups created
None as files. Three things are outstanding and belong to this phase, not to P12:
- Linked messages do not appear in the task detail timeline. `useLinkedTask` exists for
  the chip's title, but nothing queries messages *by* task on `app/task/[id].tsx`.
- Search covers `messages.body_tsv` only. The union with transcripts is P07's half.
- Nothing has been measured at 1000 messages.

---
## Progress — 2026-09-04 (built, three gaps)

Typing, speaking, threads, day separators, pagination, optimistic send, linking at send
time and text search all work as far as the type checker and the unit tests can tell.

- [ ] Scrolling stays smooth at 1000+ messages — never measured, and it is a `FlatList`.
- [ ] Send a voice message from the chat and it plays from the bubble — needs the phone.
- [ ] Attach a message to a task and it appears in that task's detail timeline —
      **genuinely not built.** The task screen shows the status ledger and nothing else.
- [ ] Search finds both a typed word and a spoken word — **blocked by P07.** There are
      no transcripts to find. Half of this criterion passes; the other half cannot
      until P13 lifts the Expo Go ceiling.
- [ ] Sending offline queues and the bubble shows "sending" — the code path is there
      (`usePendingMessageIds`, the outbox scope) and has not been run offline.
- [ ] The keyboard does not cover the input bar — `KeyboardAvoidingView` is in place;
      whether it is right is something you look at.
