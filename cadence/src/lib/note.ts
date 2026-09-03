// The mandatory-note rule, client side. R3.
//
// This lives in its own module, away from anything that imports the Supabase client,
// for two reasons: it is pure, and it is a duplicate of a rule that really lives in
// migration 0007. Duplicated rules drift, so it gets its own unit tests — and those
// tests should not need a network client, an API key, or an environment to run.

/** The minimum a note must be before close_task() will accept it. Mirrors the RPC. */
export const MIN_NOTE_LENGTH = 15;

/**
 * Returns a human-readable reason the note is not acceptable yet, or null when it is.
 *
 * A courtesy, not a gate. close_task() rejects exactly the same things, and if the two
 * ever disagree the database wins — which shows up as a save that fails after the
 * button was enabled. Keep this in step with 0007.
 */
export function noteProblem(note: string, hasVoiceNote: boolean): string | null {
  // R3 is "a note OR a voice note", so audio makes the written note optional.
  if (hasVoiceNote) return null;

  const trimmed = note.trim();

  if (trimmed.length < MIN_NOTE_LENGTH) {
    const missing = MIN_NOTE_LENGTH - trimmed.length;
    return `${missing} more character${missing === 1 ? '' : 's'} needed.`;
  }

  // The RPC's placeholder regex, anchored the same way. Only the dot and dash branches
  // are actually reachable — every word alternative is shorter than MIN_NOTE_LENGTH and
  // the length check runs first. Recorded as a finding in the P01 completion record.
  if (/^(ok|done|na|n\/a|nil|asdf|test|\.+|-+)$/i.test(trimmed)) {
    return 'Write a real note. That one says nothing.';
  }

  return null;
}
