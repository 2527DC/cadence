# P07 — Speech-to-Text

Depends on: P06
Estimate: 1.5 days
Skills to load: `context7` (for `expo-speech-recognition`), `react-native-core`

---

## Decisions needed in this phase

### OQ-5 — Cloud transcription now, or later?
On-device speech-to-text is free, private, offline and live, but less accurate on longer or
noisier recordings.

**Recommendation: on-device only for v1.** Add a cloud pass later, and only when you actually
fail to find something you know you said. That is a real signal; anticipating it is not. The
schema already has `transcript_status = 'cloud'` waiting, so adding it later is purely
additive — no migration, no rework.

- [ ] Accept — on-device only (the tasks below assume this)
- [ ] Include cloud transcription in v1 — adds roughly one phase, costs ~$0.006/min

If you pick cloud, create `pending/P07b-cloud-transcription.md` from
[../../06-voice-and-speech-to-text.md](../../06-voice-and-speech-to-text.md) §7 rather than
expanding this phase.

---

## Goal
Every voice note gets a transcript, generated **on-device**, live while you speak.

Reference: [../../06-voice-and-speech-to-text.md](../../06-voice-and-speech-to-text.md) §2

## Scope decision
On-device only (OQ-5). Cloud transcription is deliberately deferred — the trigger for
adding it is failing to find something you know you said, not anticipating that you might.

## Tasks

### On-device recognition
- [ ] Install `expo-speech-recognition`, add its config plugin, rebuild the dev client
- [ ] iOS: `NSSpeechRecognitionUsageDescription`; Android: verify the recognizer is available
- [ ] Request speech permission alongside the mic permission
- [ ] Start recognition in parallel with recording — **not sequentially**
- [ ] Show interim results live under the recording UI, updating as you speak
- [ ] On stop: capture the final transcript, write it to the `voice_notes` row, set `transcript_status = 'on_device'`
- [ ] Handle the Android ~60s silence timeout: restart the session and concatenate
- [ ] Handle the iOS ~1 min per-request limit the same way
- [ ] Device has no recognizer, or the language is unsupported → `transcript_status = 'failed'`, recording still saves

### UI
- [ ] Transcript shown under each voice note, collapsed past ~3 lines with "show more"
- [ ] `failed` state: "Transcription failed" plus a retry button
- [ ] `pending` state: a subtle shimmer, never a blocking spinner
- [ ] Transcript is selectable and copyable

### Search
- [ ] Search screen querying `voice_notes.transcript_tsv`
- [ ] Results show a snippet with the match highlighted
- [ ] Tapping a result opens the voice note and plays it
- [ ] Debounced input, empty state, no-results state

## Acceptance criteria

- [ ] Speaking a sentence shows words appearing live, before you release
- [ ] The final transcript is stored and survives a restart
- [ ] Transcription works fully in airplane mode
- [ ] A 90-second recording transcribes without truncation
- [ ] A recording made where recognition fails **still saves and still plays**
- [ ] Searching a distinctive word from a note finds it

## Definition of done
Record five notes of ~30s each, in your normal speaking voice. Search for a word from each.
If you can find at least four, on-device is good enough — stay with it. If not, escalate to
cloud transcription and open a new phase file for it.

## If accuracy is not good enough
Do not silently struggle with it. Create `pending/P07b-cloud-transcription.md`, describing
the `transcribe-audio` Edge Function from
[../../06-voice-and-speech-to-text.md](../../06-voice-and-speech-to-text.md) §7. The schema
already supports it — `transcript_status = 'cloud'` exists for exactly this.
