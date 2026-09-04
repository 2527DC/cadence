// "How did this week actually go?" P11.
//
// One question. Not five, not a mood slider, not a set of prompts — the phase's
// definition of done is that a real review takes under five minutes, and every extra
// field is a reason to stop doing it.
//
// Text or voice, the same choice the closing sheet offers, for the same reason: the
// honest answer to "what happened" is often easier said than typed, and doc/06 exists
// so that speaking it is never the slower path.
//
// Unlike a closing note there is no minimum length and no placeholder check. close_task()
// enforces those because a note is the price of changing a status; a weekly review is
// not a gate on anything, and a one-line answer that is true beats fifteen characters
// of filler. What is required is that there is *something* — text or audio — because a
// review with neither is just a button press.

import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { VoiceNotePlayer, VoiceRecorderButton } from '@/features/voice';

const INPUT =
  'min-h-[120px] rounded-card border border-border bg-surface p-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

export function ReviewAnswer({
  initialSummary,
  initialVoiceNoteId,
  savedAt,
  saving,
  onSave,
}: {
  initialSummary: string | null;
  initialVoiceNoteId: string | null;
  /** When this week has been reviewed before. Re-reviewing updates that same row. */
  savedAt: Date | null;
  saving: boolean;
  onSave: (input: { summary: string | null; voiceNoteId: string | null }) => void;
}) {
  const [summary, setSummary] = useState(initialSummary ?? '');
  // Once a recording is attached it stays attached. The voice module has no delete and
  // no re-record for the same reason the closing sheet does not: a recording is part of
  // the record, not a draft of one.
  const [voiceNoteId, setVoiceNoteId] = useState<string | null>(initialVoiceNoteId);

  const trimmed = summary.trim();
  const hasAnswer = trimmed.length > 0 || voiceNoteId !== null;
  const changed = trimmed !== (initialSummary ?? '').trim() || voiceNoteId !== initialVoiceNoteId;

  return (
    <Card className="mt-2">
      <Text variant="heading">How did this week actually go?</Text>
      <Text variant="meta" className="mt-1">
        Nobody else reads this. The numbers above are the record; this is the part that makes them
        mean something.
      </Text>

      <TextInput
        className={`mt-3 ${INPUT}`}
        multiline
        textAlignVertical="top"
        placeholder="Say it plainly."
        value={summary}
        onChangeText={setSummary}
        accessibilityLabel="How did this week actually go?"
      />

      <View className="mt-3">
        {voiceNoteId ? (
          <VoiceNotePlayer voiceNoteId={voiceNoteId} />
        ) : (
          <VoiceRecorderButton compact onRecorded={setVoiceNoteId} disabled={saving} />
        )}
      </View>

      <Button
        label={savedAt ? 'Save this version' : 'Save the review'}
        className="mt-4"
        loading={saving}
        disabled={!hasAnswer || (!changed && !!savedAt)}
        onPress={() => onSave({ summary: trimmed || null, voiceNoteId })}
      />

      <Text variant="micro" className="mt-2">
        {!hasAnswer
          ? 'Write a line or record one first.'
          : savedAt
            ? `Reviewed ${savedAt.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Kolkata',
              })}. Saving again replaces the answer and re-freezes the numbers as they are now.`
            : 'Saving freezes the numbers above into this review, so it still reads the same in a year.'}
      </Text>
    </Card>
  );
}
