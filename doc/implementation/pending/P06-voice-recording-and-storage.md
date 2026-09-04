# P06 — Voice Recording and Storage

Depends on: P02
Estimate: 2 days
Skills to load: `expo-examples`, `react-native-core`, `context7` (for `expo-audio`)

---

## Goal
Record audio, store it permanently in Supabase Storage, play it back. **No transcription
yet** — that is P07.

Reference: [../../06-voice-and-speech-to-text.md](../../06-voice-and-speech-to-text.md)

## Tasks

### Recording
- [x] `expo-audio` with the recording options from the doc (m4a, mono, 64kbps)
- [x] Microphone permission requested at first use, in context, with a fallback explanation if denied
- [x] `useVoiceRecorder` hook: start / stop / cancel, duration, metering
- [x] Hold-to-record gesture with `react-native-gesture-handler`
- [x] Slide-left-to-cancel, with a visible threshold
- [x] Live waveform from metering, sampled at ~10 Hz
- [x] Downsample to 60 points on stop
- [x] Discard anything under 1000ms with "hold to record"

### Storage
- [x] Save to `FileSystem.documentDirectory/voice/{uuid}.m4a` — **client-generated UUID**
- [x] Insert the `voice_notes` row with duration, waveform, size
- [x] Upload to `voice-notes/{user_id}/{uuid}.m4a`
- [x] Set `storage_path` only after the upload is confirmed
- [x] **Never delete the local file before confirmation.** Cache it for 30 days after.
- [x] Orphan recovery on launch: scan the voice directory for files with no row

### Playback
- [x] `VoiceNotePlayer` component: play/pause, waveform with progress, duration
- [x] Scrub by tapping or dragging the waveform
- [x] Speed toggle 1x / 1.5x / 2x
- [x] One global player — starting one stops the other
- [x] Signed URL minted on demand, cached for its lifetime
- [x] Play the local file if cached, without touching the network
- [x] Handle interruption by a phone call: stop, save what exists, mark partial

### Integration
- [x] Wire the mic button in the P05 closing sheet
- [x] A voice note satisfies the note requirement immediately (no transcript needed)
- [x] The closing sheet shows the recorded note with a player before saving

## Acceptance criteria

- [ ] Record 10s → it appears, plays back, and survives an app restart
- [ ] Record in airplane mode → saves locally, plays, uploads when back online
- [ ] Kill the app mid-record → the partial file is recovered on next launch
- [ ] The waveform matches the audio (loud parts are visibly taller)
- [ ] Closing a task with only a voice note succeeds
- [x] Denying the mic permission gives a clear message plus a Settings link

## Definition of done
Speak a 30-second note into a closing sheet, close the task, kill the app, reopen it, and
play the note back from the task history.

## Non-negotiable
**A recording is never lost.** Every failure path keeps the audio. If you have to choose
between clean state management and keeping a file, keep the file.

---
## Completion record
- **Not complete: 1 of 6 acceptance criteria met, as of 2026-09-04.** Every task in the
  phase is built and typechecks; five of the six criteria are things you can only find
  out by holding the phone. See the Progress note below.
- Decisions made: none were asked for. Three were taken while building:
  - **The audio is safe on disk before anything network-shaped happens.** `stop()` does
    not resolve until the m4a and its JSON sidecar are in
    `documentDirectory/voice/`. Upload and row-insert come afterwards and can fail
    freely. This is the phase's non-negotiable, and it is structural rather than
    careful.
  - **The first-ever permission prompt does not start a recording.** Someone holding
    the mic while an OS dialog appears has let go by the time they answer it, and a
    recording nobody is holding is a surprise. Grant, then hold again.
  - **Row order is upload-then-insert.** `storage_path` is only written once the object
    is confirmed, so a row never points at an object that does not exist. The reverse
    failure — an object with no row — is just an orphan, and `retryPendingUploads()`
    finishes it.
- Verified by:
  - `npx tsc --noEmit`, `npm run lint`, `npx jest`.
  - `src/features/voice/waveform.test.ts` — 15 assertions on the metering transform:
    silence clamps to zero, full scale maps to 100, downsampling always returns exactly
    60 points and **keeps the peak of each bucket so a shout is not averaged away**,
    and "draws the loud half taller than the quiet half".
  - `src/features/voice/paths.test.ts` — the object name starts with the user id,
    which is exactly what the Storage RLS policy checks
    (`(storage.foldername(name))[1] = auth.uid()`), and a segment that could escape the
    user's folder is refused.
  - `src/features/voice/uuid.test.ts` — the client-generated id is a v4 UUID.
  - `node supabase/db.mjs test` (2026-09-04): `01_destructive.sql` proves a voice note
    cannot be deleted, which is why there is no delete function in `src/api/voice-notes.ts`.
- **Not verified on a physical device**, and no iOS bundle was produced in this run.
  Nothing in this phase has ever recorded a real second of audio.

### Deviations from plan
1. **No Skia waveform.** `@shopify/react-native-skia` is outside Expo Go's bundled
   modules and would red-screen the app at import (P00). `waveform-view.tsx` draws the
   sixty bars as plain `View`s. No practical loss — the data is identical.
2. **Orphan recovery is called from the outbox's launch hook, not from its own.** P06
   said "P10 owns the launch hook"; **that wiring landed in P12** (`resumeOutbox()` in
   `src/features/sync/outbox-setup.ts` now calls `retryPendingUploads()` and then
   `pruneLocalCache()`, fire-and-forget, after the queue replay). Until this session
   `retryPendingUploads` was exported and never called, so acceptance criterion 3 could
   not have passed. It should now — but see the Progress note.
3. **`expo-file-system/legacy`.** The new SDK 54 API does not cover the upload shape
   this needs; the legacy import is the supported path and is what Expo's own examples
   use.

### Follow-ups created
None as files.

---
## Progress — 2026-09-04 (built, unverified)

The whole feature exists: record, cancel, waveform, upload, playback with scrub and
speed, one global player, interruption handling, orphan recovery on launch. What has
not happened is any of it running.

- [x] Denying the mic permission gives a clear message plus a Settings link — read out
      of `voice-recorder-button.tsx`; `permission === 'blocked'` puts up an alert with
      a "Open Settings" action.
- [ ] Record 10s → it appears, plays back, and survives an app restart.
- [ ] Record in airplane mode → saves locally, plays, uploads when back online.
- [ ] Kill the app mid-record → the partial file is recovered on next launch. The code
      path now exists end to end (deviation 2) and has never been exercised.
- [ ] The waveform matches the audio. The *transform* is proven by unit test; whether
      the bars line up with what you hear is a thing you look at.
- [ ] Closing a task with only a voice note succeeds. `canSubmit` allows it and
      `close_task` takes `p_voice_note_id`, but the round trip has not been run.

Five checks with the phone in hand would close this file.
