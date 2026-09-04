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

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { VoiceRecorderButton } from '@/features/voice';
import { hapticSelect } from '@/lib/haptics';

import { MAX_BODY_LENGTH, sendProblem } from './model';

/** What a message can be attached to. Chosen in AttachSheet, shown here as a chip. */
export type MessageLink =
  | { kind: 'task'; id: string; title: string }
  | { kind: 'goal'; id: string; title: string };

export function Composer({
  disabled,
  link,
  onPickLink,
  onClearLink,
  onSendText,
  onSendVoice,
  error,
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
  placeholder: string;
}) {
  const [text, setText] = useState('');

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
    <View className="border-t border-border bg-bg px-gutter pb-2 pt-2 dark:border-border-dark dark:bg-bg-dark">
      {link ? (
        <View className="mb-2 flex-row items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full bg-raised py-1 pl-2.5 pr-1 dark:bg-raised-dark">
            <Text variant="micro" className="font-semibold uppercase tracking-wider">
              {link.kind === 'task' ? 'Task' : 'Goal'}
            </Text>
            <Text
              variant="micro"
              className="max-w-[200px] font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}>
              {link.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove the link"
              hitSlop={8}
              onPress={onClearLink}
              className="h-5 w-5 items-center justify-center rounded-full bg-border dark:bg-border-dark">
              <Text variant="micro" className="font-bold text-ink dark:text-ink-dark">
                ×
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-end gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={link ? 'Change the linked task or goal' : 'Link a task or goal'}
          disabled={disabled}
          onPress={() => {
            hapticSelect();
            onPickLink();
          }}
          className={`h-11 w-11 items-center justify-center rounded-full bg-raised dark:bg-raised-dark ${
            disabled ? 'opacity-50' : 'active:opacity-70'
          }`}>
          <Text className="text-xl font-semibold text-muted dark:text-muted-dark">+</Text>
        </Pressable>

        <View className="flex-1 justify-end">
          <TextInput
            className="max-h-[132px] min-h-[44px] rounded-[22px] border border-border bg-surface py-2.5 pl-4 pr-[68px] text-base leading-[22px] text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
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
          <View className="absolute bottom-0 right-0 flex-row items-end" pointerEvents="box-none">
            <View className={empty ? 'hidden' : 'p-0.5'}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={send}
                className={`h-10 w-10 items-center justify-center rounded-full bg-accent dark:bg-accent-dark ${
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
