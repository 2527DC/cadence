# P13 — iOS Native Build (lifting the Expo Go ceiling)

Depends on: P06 (and unblocks P07)
Estimate: 0.5 day of work, gated on money or hardware — not on effort
Skills to load: `expo-dev-client`, `eas-build`

---

## Why this phase exists

P00 chose Expo Go because it is the only ₹0 way onto an iPhone from a Windows PC with no Apple
Developer account. That choice has a fixed, known ceiling — the ❌ list in
[P00](P00-project-setup.md#the-expo-go-compatibility-contract):

- **No speech-to-text.** Voice notes record, store and play back, but produce no transcript,
  so there is nothing to search. This is the one that actually hurts — F4 promises transcript
  search and it cannot be delivered inside Expo Go.
- **No Skia waveform.** Mitigated with a metering-driven bar view; barely a loss.
- **No remote push.** Mitigated with local notifications; arguably better for one user.
- **The dev server must be running on the PC.** The app is not independently installed.

This phase removes all four. It is deliberately last, because none of it is needed to find out
whether the core loop works.

---

## Do not start this phase until

You have used the app through P05 **for at least two full weeks**, and you can name a specific
moment where you tried to find something you know you said and could not. That is the trigger
described in [../../06-voice-and-speech-to-text.md](../../06-voice-and-speech-to-text.md) §2.
Anticipating it is not.

---

## Decisions needed in this phase

### OQ-11 — How do we get a signed iOS build?

| Option | Cost | Mac needed | Install expires | Verdict |
|---|---|---|---|---|
| **Apple Developer Program + `eas build`** | $99/yr | No — EAS builds in the cloud from Windows | No | ✅ **Recommended.** The only path that leaves the app permanently installed and buildable from the existing Windows setup. |
| Mac + free Apple ID | ₹0 | Yes | **Every 7 days** | Workable if a Mac is genuinely to hand. Re-signing weekly is a real ongoing tax. |
| Rented Mac (MacinCloud etc.) | ~$1–2/hr | Rented | Every 7 days | Fine for a one-off experiment, bad as a routine. |
| Switch to an Android device | ₹0 | No | No | Everything works immediately via `eas build -p android`. Only viable if an Android phone exists. |

- [ ] Apple Developer Program ($99/yr)
- [ ] Mac + free Apple ID
- [ ] Move to Android
- [ ] Stay on Expo Go, accept no transcription — **close this phase as won't-do**

The last option is legitimate. If two weeks of use show that you read your own voice notes
rather than search them, this phase is not worth $99.

---

## Tasks

- [ ] Record the OQ-11 choice above
- [ ] Add `expo-dev-client` to the project
- [ ] Add `@jamsch/expo-speech-recognition` + its config plugin, with the `NSSpeechRecognitionUsageDescription` string
- [ ] Add `@shopify/react-native-skia`, swap the fallback waveform for the Skia one
- [ ] `eas build --profile development --platform ios`, install on the device
- [ ] Enable Settings → Privacy & Security → **Developer Mode** on the iPhone
- [ ] `npx expo start --dev-client` connects and hot-reloads
- [ ] Work [P07](P07-speech-to-text.md) for real
- [ ] Backfill transcripts for every voice note recorded during the Expo Go period
- [ ] Swap the local Sunday notification for the push-based one, if wanted

## Acceptance criteria

- [ ] The dev client is installed on the iPhone and connects to the dev server
- [ ] A new voice note produces a live interim transcript while speaking
- [ ] Every pre-P13 voice note now has a transcript, or an explicit `transcript_status = 'failed'`
- [ ] Transcript search returns a phrase spoken before this phase existed
- [ ] `npx tsc --noEmit` and `npm run lint` still pass

## Definition of done
You can search your own voice, including the notes you recorded before this phase.
