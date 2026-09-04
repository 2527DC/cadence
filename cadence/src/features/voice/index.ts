// Voice notes. P06.
//
// What other features import:
//
//   <VoiceRecorderButton onRecorded={(id) => …} />   record → upload → row; gives back the id
//   <VoiceNotePlayer voiceNoteId={id} />              waveform, play/pause, scrub, speed, duration
//   useVoiceNote(id)                                  the voice_notes row, via React Query
//
// There is no delete export and there will not be one. voice_notes has no DELETE
// grant and the bucket has no delete policy; a recording is evidence, and evidence
// that can be removed is not evidence.

export { VoiceRecorderButton } from './voice-recorder-button';
export { VoiceNotePlayer } from './voice-note-player';
export { WaveformView } from './waveform-view';
export { useVoiceRecorder, RECORDING_OPTIONS } from './use-voice-recorder';
export type {
  FinishedRecording,
  MicPermission,
  RecorderPhase,
  StopResult,
} from './use-voice-recorder';
export { listPendingRecordings, retryPendingUploads, pruneLocalCache } from './recovery';
export type { RecoveryReport } from './recovery';
export { formatDuration, WAVEFORM_POINTS } from './waveform';

export {
  useVoiceNote,
  useVoiceNoteSignedUrl,
  useSaveVoiceNote,
  saveVoiceNote,
  voiceNoteKeys,
  type VoiceNote,
  type SaveVoiceNoteInput,
} from '@/api/voice-notes';
