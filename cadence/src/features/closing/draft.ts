// The closing sheet's form, as data. P05.
//
// Pure — no React, no Supabase — so what the sheet tells the person can be unit
// tested without a device. The rule itself (fifteen characters or a voice note, no
// placeholder notes, NC needs a reason) is not restated here: noteProblem() in
// src/lib/note.ts is the one client-side copy of close_task()'s checks, and this
// module only asks it. Two copies of the rule would drift; one copy and a counter
// cannot.

import { MIN_NOTE_LENGTH, noteProblem } from '@/lib/note';
import type { Database } from '@/types/database.types';

type TaskStatus = Database['public']['Enums']['task_status'];
type NcReason = Database['public']['Enums']['nc_reason'];

export type ClosableStatus = Exclude<TaskStatus, 'OPEN'>;

export type CloseDraft = {
  status: ClosableStatus | null;
  note: string;
  ncReason: NcReason | null;
  /** Set once the recording is uploaded and its row exists — never before. */
  voiceNoteId: string | null;
};

export const EMPTY_DRAFT: CloseDraft = {
  status: null,
  note: '',
  ncReason: null,
  voiceNoteId: null,
};

export type NoteCounter = {
  /** What the database will count: the trimmed length. */
  count: number;
  /** "3 / 15 minimum" — or, with a voice note attached, that the text is optional. */
  label: string;
  /** True once close_task() would accept the note. Turns at 15, unless it is a placeholder. */
  valid: boolean;
};

export function noteCounter(note: string, hasVoiceNote: boolean): NoteCounter {
  const count = note.trim().length;
  const valid = noteProblem(note, hasVoiceNote) === null;
  if (hasVoiceNote) {
    return { count, valid, label: 'Optional — you recorded it' };
  }
  return { count, valid, label: `${count} / ${MIN_NOTE_LENGTH} minimum` };
}

/**
 * Why Save cannot be pressed right now, or null when it can. Shown next to the
 * button, always — a grey button with no explanation is the "silent disable" the
 * phase forbids.
 */
export function submitBlocker(draft: CloseDraft): string | null {
  if (!draft.status) return 'Choose what happened first.';
  if (draft.status === 'NC' && !draft.ncReason) {
    return 'NC needs a reason before it can be saved.';
  }
  return noteProblem(draft.note, draft.voiceNoteId !== null);
}

export function canSubmit(draft: CloseDraft): boolean {
  return submitBlocker(draft) === null;
}

/**
 * Anything that deserves a "throw this away?" before the sheet is dismissed. A
 * status on its own is one tap to redo; typed words and a recording are not.
 */
export function isDirty(draft: CloseDraft): boolean {
  return draft.note.trim().length > 0 || draft.voiceNoteId !== null;
}
