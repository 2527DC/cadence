import {
  EMPTY_DRAFT,
  canSubmit,
  isDirty,
  noteCounter,
  submitBlocker,
  type CloseDraft,
} from './draft';

const FOURTEEN = 'fourteen chars'; // 14
const FIFTEEN = 'fifteen chars!!'; // 15
const HONEST = 'Slept through the alarm, then chose the gym over it.';

describe('noteCounter', () => {
  it('reads "N / 15 minimum" and counts the trimmed note', () => {
    expect(noteCounter('', false)).toEqual({ count: 0, valid: false, label: '0 / 15 minimum' });
    expect(noteCounter(`  ${FOURTEEN}  `, false)).toEqual({
      count: 14,
      valid: false,
      label: '14 / 15 minimum',
    });
  });

  it('turns valid at exactly 15', () => {
    expect(noteCounter(FOURTEEN, false).valid).toBe(false);
    expect(noteCounter(FIFTEEN, false)).toEqual({
      count: 15,
      valid: true,
      label: '15 / 15 minimum',
    });
  });

  it('does not turn valid for a 15-character placeholder', () => {
    const dots = '.'.repeat(15);
    expect(noteCounter(dots, false)).toEqual({ count: 15, valid: false, label: '15 / 15 minimum' });
  });

  it('makes the written note optional once a voice note is attached', () => {
    expect(noteCounter('', true)).toEqual({
      count: 0,
      valid: true,
      label: 'Optional — you recorded it',
    });
    expect(noteCounter('a few words', true).valid).toBe(true);
  });
});

describe('submitBlocker / canSubmit', () => {
  const withStatus = (patch: Partial<CloseDraft>): CloseDraft => ({ ...EMPTY_DRAFT, ...patch });

  it('asks for a status before anything else', () => {
    expect(submitBlocker(EMPTY_DRAFT)).toBe('Choose what happened first.');
    expect(submitBlocker(withStatus({ note: HONEST }))).toBe('Choose what happened first.');
  });

  it('cannot be triggered with a 14-character note', () => {
    expect(canSubmit(withStatus({ status: 'C', note: FOURTEEN }))).toBe(false);
    expect(submitBlocker(withStatus({ status: 'C', note: FOURTEEN }))).toBe(
      '1 more character needed.',
    );
    expect(canSubmit(withStatus({ status: 'C', note: FIFTEEN }))).toBe(true);
  });

  it('refuses placeholder notes with the same words the database uses', () => {
    expect(submitBlocker(withStatus({ status: 'N', note: 'done' }))).toBe(
      '11 more characters needed.',
    );
    expect(submitBlocker(withStatus({ status: 'N', note: '-'.repeat(20) }))).toBe(
      'Write a real note. That one says nothing.',
    );
  });

  it('NC without a reason cannot be saved, even with a good note', () => {
    expect(submitBlocker(withStatus({ status: 'NC', note: HONEST }))).toBe(
      'NC needs a reason before it can be saved.',
    );
    expect(canSubmit(withStatus({ status: 'NC', note: HONEST, ncReason: 'illness' }))).toBe(true);
  });

  it('accepts a voice note in place of the written one', () => {
    expect(canSubmit(withStatus({ status: 'N', voiceNoteId: 'vn-1' }))).toBe(true);
    // ...but not in place of the NC reason.
    expect(canSubmit(withStatus({ status: 'NC', voiceNoteId: 'vn-1' }))).toBe(false);
  });
});

describe('isDirty', () => {
  it('is clean with nothing typed, whitespace, or only a status', () => {
    expect(isDirty(EMPTY_DRAFT)).toBe(false);
    expect(isDirty({ ...EMPTY_DRAFT, note: '   ' })).toBe(false);
    expect(isDirty({ ...EMPTY_DRAFT, status: 'C' })).toBe(false);
  });

  it('is dirty once a character is typed or a recording is attached', () => {
    expect(isDirty({ ...EMPTY_DRAFT, note: 'a' })).toBe(true);
    expect(isDirty({ ...EMPTY_DRAFT, voiceNoteId: 'vn-1' })).toBe(true);
  });
});
