// The input bar. P08.
//
// WhatsApp's arrangement, because it is the one everybody's thumb already knows:
// a text field, a mic while the field is empty, a send arrow once it is not. The
// mic is the P06 recorder in its compact form — hold to record, release to send —
// and the moment it hands back a voice_notes id the message is posted. A link to a
// task or goal is chosen before sending and shown as a chip above the field; it
// cannot be added afterwards, because a message is never updated.
//
// Both the mic and the send button stay mounted and are toggled with `hidden`,
// not swapped: the recorder holds a native audio session, and tearing it down on
// every keystroke that empties the field would be wasteful and occasionally audible.

import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { VoiceRecorderButton } from '@/features/voice';
import { hapticSelect } from '@/lib/haptics';

import { MAX_BODY_LENGTH, sendProblem } from './model';

/** What a message can be attached to. Chosen in AttachSheet, shown here as a chip. */
export type MessageLink =
  { kind: 'task'; id: string; title: string } | { kind: 'goal'; id: string; title: string };

/**
 * Words to put back in the field after the database refused them. `token` rises with
 * each rejection so that two refusals of the same sentence are two separate events;
 * comparing the text alone would swallow the second.
 */
export type RestoreText = { text: string; token: number };

export function Composer({
  disabled,
  link,
  onPickLink,
  onClearLink,
  onSendText,
  onSendVoice,
  error,
  restore,
  placeholder,
}: {
  /** No thread yet, or the thread failed to open. */
  disabled: boolean;
  link: MessageLink | null;
  onPickLink: () => void;
  onClearLink: () => void;
  onSendText: (text: string) => void;
  onSendVoice: (voiceNoteId: string) => void;
  /** The database's message for the last rejected send, shown as it came. */
  error: string | null;
  /** A refused message, handed back so it is not lost. */
  restore?: RestoreText | null;
  placeholder: string;
}) {
  const [text, setText] = useState('');

  // The field is uncontrolled from the screen's point of view — a chat with a
  // thousand bubbles must not re-render on every keystroke — so a rejection is
  // handed back as a token instead. Anything already typed wins: getting your words
  // back must never cost you the ones you have started writing since.
  const restoreToken = restore?.token ?? 0;
  const restoredToken = useRef(restoreToken);
  useEffect(() => {
    if (restoreToken === restoredToken.current) return;
    restoredToken.current = restoreToken;
    const words = restore?.text ?? '';
    if (words) setText((current) => (current.trim().length === 0 ? words : current));
  }, [restore, restoreToken]);

  const problem = sendProblem({ text });
  const canSend = !disabled && !problem;
  const empty = text.trim().length === 0;

  function send() {
    if (!canSend) return;
    hapticSelect();
    onSendText(text);
    setText('');
  }

  return (
    <View className="border-border bg-bg px-gutter pb-2 pt-2 dark:border-border-dark dark:bg-bg-dark border-t">
      {link ? (
        <View className="mb-2 gap-2 flex-row items-center">
          <View className="gap-1.5 bg-raised py-1 pl-2.5 pr-1 dark:bg-raised-dark flex-row items-center rounded-full">
            <Text variant="micro" className="font-semibold tracking-wider uppercase">
              {link.kind === 'task' ? 'Task' : 'Goal'}
            </Text>
            <Text
              variant="micro"
              className="font-semibold text-ink dark:text-ink-dark max-w-[200px]"
              numberOfLines={1}>
              {link.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove the link"
              hitSlop={8}
              onPress={onClearLink}
              className="h-5 w-5 bg-border dark:bg-border-dark items-center justify-center rounded-full">
              <Text variant="micro" className="font-bold text-ink dark:text-ink-dark">
                ×
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="gap-2 flex-row items-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={link ? 'Change the linked task or goal' : 'Link a task or goal'}
          disabled={disabled}
          onPress={() => {
            hapticSelect();
            onPickLink();
          }}
          className={`h-11 w-11 bg-raised dark:bg-raised-dark items-center justify-center rounded-full ${
            disabled ? 'opacity-50' : 'active:opacity-70'
          }`}>
          <Text className="text-xl font-semibold text-muted dark:text-muted-dark">+</Text>
        </Pressable>

        <View className="flex-1 justify-end">
          <TextInput
            className="border-border bg-surface py-2.5 pl-4 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark max-h-[132px] min-h-[44px] rounded-[22px] border pr-[68px] leading-[22px]"
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#98A2B3"
            multiline
            maxLength={MAX_BODY_LENGTH}
            editable={!disabled}
            accessibilityLabel="Message"
            textAlignVertical="center"
          />

          {/* The right-hand slot floats over the field's end so the recorder's
              live meter can grow leftwards over the text instead of squeezing it. */}
          <View className="bottom-0 right-0 absolute flex-row items-end" pointerEvents="box-none">
            <View className={empty ? 'hidden' : 'p-0.5'}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={send}
                className={`h-10 w-10 bg-accent dark:bg-accent-dark items-center justify-center rounded-full ${
                  canSend ? 'active:opacity-80' : 'opacity-50'
                }`}>
                <Text className="text-lg font-bold text-white">↑</Text>
              </Pressable>
            </View>
            <View className={empty ? '-mb-1.5 -mr-1.5' : 'hidden'}>
              <VoiceRecorderButton compact disabled={disabled} onRecorded={onSendVoice} />
            </View>
          </View>
        </View>
      </View>

      {error ? (
        <Text variant="micro" className="mt-1.5 text-status-n dark:text-status-n-dark">
          {error}
        </Text>
      ) : text.length > MAX_BODY_LENGTH - 200 ? (
        <Text variant="micro" className="mt-1.5 text-right">
          {MAX_BODY_LENGTH - text.length} left
        </Text>
      ) : null}
    </View>
  );
}
