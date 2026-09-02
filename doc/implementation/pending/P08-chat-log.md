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

- [ ] Accept — per-goal threads + Daily log
- [ ] Single thread only — everything in one stream, simplest possible (drop the thread-list tasks)
- [ ] Free-form threads I create myself (adds a thread-management screen)

---

## Goal
The informal capture surface: a chat where you type or speak thoughts, blockers and wins,
optionally attached to a task or goal.

## Tasks

### Threads
- [ ] Auto-create a "Daily log" thread on first sign-in
- [ ] Auto-create one thread per goal, on goal creation
- [ ] Thread list: title, last message preview, timestamp, unread-style ordering
- [ ] Chat tab opens the last-used thread, not the list

### Messages
- [ ] `FlashList`, inverted, newest at the bottom
- [ ] Date separators ("Today", "Yesterday", then the date)
- [ ] Text bubbles with timestamps
- [ ] Voice bubbles: waveform, duration, play/pause, transcript below
- [ ] Input bar: text field, send button, mic button — mic swaps in when the field is empty (the WhatsApp behaviour)
- [ ] Hold-to-record in the chat, reusing the P06 recorder
- [ ] Pagination: 50 messages per page, loads more on scroll
- [ ] Optimistic send — the bubble appears immediately with a "sending" state

### Linking
- [ ] Long-press a message → "Attach to task" / "Attach to goal"
- [ ] A linked message shows a chip with the task or goal title
- [ ] Linked messages appear in the task detail timeline as well
- [ ] Tapping the chip navigates to that task or goal

### Search
- [ ] Extend the P07 search to cover `messages.body_tsv` as well
- [ ] Union and rank results across text and transcripts
- [ ] Filter by thread

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
