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
- [ ] `expo-audio` with the recording options from the doc (m4a, mono, 64kbps)
- [ ] Microphone permission requested at first use, in context, with a fallback explanation if denied
- [ ] `useVoiceRecorder` hook: start / stop / cancel, duration, metering
- [ ] Hold-to-record gesture with `react-native-gesture-handler`
- [ ] Slide-left-to-cancel, with a visible threshold
- [ ] Live waveform from metering, sampled at ~10 Hz
- [ ] Downsample to 60 points on stop
- [ ] Discard anything under 1000ms with "hold to record"

### Storage
- [ ] Save to `FileSystem.documentDirectory/voice/{uuid}.m4a` — **client-generated UUID**
- [ ] Insert the `voice_notes` row with duration, waveform, size
- [ ] Upload to `voice-notes/{user_id}/{uuid}.m4a`
- [ ] Set `storage_path` only after the upload is confirmed
- [ ] **Never delete the local file before confirmation.** Cache it for 30 days after.
- [ ] Orphan recovery on launch: scan the voice directory for files with no row

### Playback
- [ ] `VoiceNotePlayer` component: play/pause, waveform with progress, duration
- [ ] Scrub by tapping or dragging the waveform
- [ ] Speed toggle 1x / 1.5x / 2x
- [ ] One global player — starting one stops the other
- [ ] Signed URL minted on demand, cached for its lifetime
- [ ] Play the local file if cached, without touching the network
- [ ] Handle interruption by a phone call: stop, save what exists, mark partial

### Integration
- [ ] Wire the mic button in the P05 closing sheet
- [ ] A voice note satisfies the note requirement immediately (no transcript needed)
- [ ] The closing sheet shows the recorded note with a player before saving

## Acceptance criteria

- [ ] Record 10s → it appears, plays back, and survives an app restart
- [ ] Record in airplane mode → saves locally, plays, uploads when back online
- [ ] Kill the app mid-record → the partial file is recovered on next launch
- [ ] The waveform matches the audio (loud parts are visibly taller)
- [ ] Closing a task with only a voice note succeeds
- [ ] Denying the mic permission gives a clear message plus a Settings link

## Definition of done
Speak a 30-second note into a closing sheet, close the task, kill the app, reopen it, and
play the note back from the task history.

## Non-negotiable
**A recording is never lost.** Every failure path keeps the audio. If you have to choose
between clean state management and keeping a file, keep the file.
