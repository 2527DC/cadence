# 06 — Voice Notes and Speech-to-Text

App: **Cadence**
Status: draft
Covers: F4 (chat log), F5 (voice closing notes)

---

## 1. What you asked for

> "a whats app type where it must convert from speech to text and also store the recordings
> and must be able to access those too... i need the whatsapp type simple one, speech to text one"

Read literally, that is three separate capabilities that people usually conflate:

1. **A chat-style capture surface** — bubbles, hold-to-record, instant, low friction.
2. **Speech-to-text** — the words, so you can search and read.
3. **Recording storage** — the audio itself, permanent and replayable.

WhatsApp does all three. So will this. The important design point is that **the transcript
is an addition to the recording, never a replacement for it.** If transcription fails, you
still have your voice. That is the durable artefact.

---

## 2. Speech-to-text: the options

| Approach | Accuracy | Cost | Offline | Latency | Verdict |
|---|---|---|---|---|---|
| **On-device** (`expo-speech-recognition` — Apple Speech / Android SpeechRecognizer) | Good for short, clear speech. Degrades on long recordings, accents, background noise. | Free | Yes | Live, word by word | ✅ **Start here** |
| **Cloud Whisper** (OpenAI `whisper-1` / `gpt-4o-transcribe`) via Edge Function | Excellent, including Indian English and code-switching | ~$0.006/min | No | 2–10s after upload | ✅ Optional second pass |
| **Deepgram Nova** via Edge Function | Excellent, fastest, has streaming | ~$0.004/min | No | Sub-second streaming | Alternative to Whisper |
| On-device Whisper (`whisper.rn`, ExecuTorch) | Very good | Free | Yes | Slow on mid-range Android; large model download | ❌ Overkill for v1 |

### Recommendation

**Ship on-device only. Add cloud later, if and only if you find yourself unable to search
your own notes.**

Reasoning:
- Your recordings are short — a closing note is 10–30 seconds. On-device handles that well.
- It is free, private, and works on the train with no signal.
- It gives **live interim results**, which changes how the feature feels: you watch the
  words appear as you speak, which is the WhatsApp-quality detail.
- Adding cloud later is a purely additive change: one Edge Function and one status column
  that already exists (`transcript_status`).

**The trigger for adding cloud transcription:** when you search for something you know you
said and cannot find it. Not before. That is a real signal; anticipating it is not.

---

## 3. Recording

```ts
// expo-audio — the current API. expo-av is removed as of recent SDKs.
const RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,          // mono — voice, not music. Halves the file size.
  bitRate: 64000,               // ~30s ≈ 240 KB
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios:     { outputFormat: 'mpeg4aac', audioQuality: 'medium' },
};
```

**Why m4a/AAC mono at 64kbps:** universally playable on both platforms with no transcoding,
small enough that a year of daily notes is well under 100 MB, and quality is more than
enough for speech.

### Metering and the waveform

`expo-audio` exposes a metering value while recording. Sample it at ~10 Hz, normalise, and
downsample to a fixed **60 points** stored in `voice_notes.waveform smallint[]`.

Sixty points is enough for a recognisable WhatsApp-style waveform at any bubble width, and
it is trivially small in the database. Do not store the raw envelope.

---

## 4. The full pipeline

```
┌─ press and hold mic ──────────────────────────────────────────────────┐
│                                                                        │
│  1. Request permission (once)                                          │
│     - Android: RECORD_AUDIO                                            │
│     - iOS: NSMicrophoneUsageDescription + NSSpeechRecognitionUsage...  │
│                                                                        │
│  2. Start expo-audio recorder     ──► file: documentDirectory/voice/   │
│  3. Start speech recognition      ──► interim transcript, live on UI   │
│  4. Sample metering @10Hz         ──► live waveform + a timer          │
│                                                                        │
├─ release ──────────────────────────────────────────────────────────────┤
│                                                                        │
│  5. Stop both. Get duration, final transcript, waveform array.         │
│  6. If duration < 1000ms → discard, show "hold to record".             │
│  7. Insert voice_notes row (client-generated uuid):                    │
│       transcript_status = 'on_device'  (or 'failed')                   │
│  8. Queue upload in the outbox.                                        │
│                                                                        │
├─ background ───────────────────────────────────────────────────────────┤
│                                                                        │
│  9. Upload to Storage: voice-notes/{user_id}/{uuid}.m4a                │
│ 10. On confirm → set storage_path. Keep the local file 30 days.        │
│ 11. [optional] if duration > 20s → invoke `transcribe-audio` function  │
└────────────────────────────────────────────────────────────────────────┘
```

### Slide-to-cancel

WhatsApp's gesture, and it is worth copying exactly: drag left past a threshold while
holding to abort. Anyone who has used WhatsApp will try it without being told.

### Lock-to-record

Swipe up to lock, so long recordings do not require holding the phone. Second priority —
build it after the core loop works.

---

## 5. Playback

| Requirement | Notes |
|---|---|
| Play / pause | One player instance app-wide. Starting a new one stops the previous. |
| Scrub | Tap or drag the waveform to seek. |
| Progress on the waveform | Played portion filled, remainder outlined. |
| Speed | 1x / 1.5x / 2x. You will re-listen to your own notes; 1.5x is genuinely useful. |
| Continue in background | `expo-audio` background mode, so it keeps playing while you scroll. |
| Signed URLs | Storage is private. Mint a signed URL (1 hour) on demand and cache it. |
| Offline | If the local file is still cached, play it directly and skip the network entirely. |

---

## 6. Search

Two full-text indexes, already defined in
[03-data-model-supabase.md](03-data-model-supabase.md):

- `voice_notes.transcript_tsv` — everything you ever said
- `messages.body_tsv` — everything you ever typed

One search screen queries both, unions the results, ranks by `ts_rank`, and shows a snippet
with the term highlighted. Tapping a voice result opens the bubble **and seeks to roughly
where the term occurs** if word timings are available (cloud transcription provides these;
on-device generally does not — degrade gracefully to playing from the start).

---

## 7. Edge Function: `transcribe-audio` (optional, phase 2)

```
POST /functions/v1/transcribe-audio
body: { voice_note_id: uuid }

1. Verify the caller owns the row (service role + explicit user_id check).
2. Download the object from Storage.
3. POST to the transcription vendor.
4. update voice_notes set transcript = ..., transcript_status = 'cloud'.
5. On failure: transcript_status = 'failed', transcript_error = <message>.
   The on-device transcript, if any, is NOT overwritten by a failure.
```

**The vendor API key lives only in Edge Function secrets.** The app never holds it and
never calls the vendor directly. If you ever hand this app to anyone else, that decision is
what stops your key leaking out of a decompiled APK.

---

## 8. Permissions and store copy

| Permission | Where | User-facing text |
|---|---|---|
| Microphone | iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO` | "Cadence records voice notes so you can speak your reflections instead of typing them." |
| Speech recognition | iOS `NSSpeechRecognitionUsageDescription` | "Your voice notes are transcribed on this device so you can search them later." |

Ask for permission **at the moment of first use**, not at launch. Ask with context showing
on screen, and if it is denied, the mic button gets a one-line explanation plus a link to
Settings — it does not just silently do nothing.

---

## 9. Known pitfalls

| Pitfall | Handling |
|---|---|
| Android `SpeechRecognizer` times out after ~60s of silence | Cap continuous recognition, restart the session if the recording runs long. |
| iOS on-device recognition has a ~1 minute limit per request | Same: segment and concatenate. |
| Recording while another app holds the audio session | Catch and show "another app is using the microphone". |
| Interrupted by a phone call | `expo-audio` emits an interruption event: stop, save what exists, and mark the note partial. Never lose the audio already captured. |
| App killed mid-recording | The file on disk is already partially written. On next launch, scan `documentDirectory/voice/` for orphans and offer to recover them. |
| Storage upload fails repeatedly | The note stays local and playable, flagged "not backed up". It is never deleted to reclaim space. |

---

Related: [[01-product-requirements]], [[02-tech-stack]], [[03-data-model-supabase]], [[04-architecture]]
