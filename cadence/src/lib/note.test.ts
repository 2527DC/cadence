// noteProblem() mirrors what close_task() rejects, so the person is told before they
// hit send rather than after a round trip.
//
// The reason it is worth testing: it is a *duplicate* of a rule that really lives in
// the database, and duplicated rules drift. If one of these ever disagrees with
// migration 0007, the database wins and the user gets a confusing round trip — the
// button was enabled and the save still failed. These cases are lifted straight from
// the RPC and from supabase/tests/01_destructive.sql.

import { MIN_NOTE_LENGTH, noteProblem } from './note';

describe('noteProblem', () => {
  it('accepts a real note', () => {
    expect(noteProblem('Got out the door at six and finished the whole loop.', false)).toBeNull();
  });

  it('rejects a note one character short of the minimum', () => {
    const almost = 'x'.repeat(MIN_NOTE_LENGTH - 1);
    expect(noteProblem(almost, false)).toBe('1 more character needed.');
  });

  it('accepts a note exactly at the minimum', () => {
    expect(noteProblem('x'.repeat(MIN_NOTE_LENGTH), false)).toBeNull();
  });

  it('counts the trimmed length, so whitespace cannot pad it out', () => {
    expect(noteProblem('   short   ', false)).not.toBeNull();
  });

  it('pluralises the countdown', () => {
    expect(noteProblem('x'.repeat(MIN_NOTE_LENGTH - 2), false)).toBe('2 more characters needed.');
  });

  it('rejects placeholder notes that are long enough to pass the length check', () => {
    // Only the dot and dash branches of the RPC's regex are reachable, because every
    // word alternative is shorter than the minimum length and the length check runs
    // first. That is recorded as a finding in the P01 completion record.
    expect(noteProblem('.'.repeat(20), false)).toBe('Write a real note. That one says nothing.');
    expect(noteProblem('-'.repeat(20), false)).toBe('Write a real note. That one says nothing.');
  });

  it('lets a voice note stand in for the written note', () => {
    // R3 is "a note OR a voice note", so an empty string is fine once audio exists.
    expect(noteProblem('', true)).toBeNull();
  });

  it('does not reject a real note that merely starts with a placeholder word', () => {
    // The RPC's regex is anchored, so "done" alone is rejected but this is not.
    expect(noteProblem('Done, and it took half the time I expected.', false)).toBeNull();
  });
});
