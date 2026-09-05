// Closing a task. P05, and the most important screen in the app.
//
// The rule it exists to serve (R3): you cannot close anything without saying why. Not
// as a nag — as the thing that makes the record worth keeping. A completion rate with
// no explanations behind it is a number you can lie to yourself about.
//
// The validation here mirrors close_task() exactly so the person is told before they
// hit send. It is a courtesy, not the gate. The database rejects the same things, and
// if these two ever disagree the database wins.
//
// Three things about how the sheet behaves are deliberate:
//
//   1. Save closes the sheet at once. useCloseTask is optimistic, so the row behind
//      the sheet has already flipped; waiting for the round trip here would only turn
//      an instant flip into a spinner — and on a train, into a spinner that never
//      ends, because the outbox holds the write until there is a network. If the
//      database then says no, the hook rolls the flip back and the message is shown
//      here verbatim, with the note offered back rather than lost.
//   2. There is no way out that skips the confirmation once a note is started. The
//      backdrop, the pull-down and the button all go through the same question.
//   3. A voice note makes the written one optional, and it is played back before
//      saving. Once attached it cannot be swapped for another: a recording is
//      evidence, and the voice module has no delete for the same reason.

import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, View, useColorScheme } from 'react-native';
import type { TextInput as GestureTextInput } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCloseTask, type NcReason, type Task } from '@/api/tasks';
import { Button, STATUS_META, Text } from '@/components/ui';
import {
  EMPTY_DRAFT,
  canSubmit,
  isDirty,
  noteCounter,
  submitBlocker,
  type ClosableStatus,
  type CloseDraft,
} from '@/features/closing/draft';
import { VoiceNotePlayer, VoiceRecorderButton } from '@/features/voice';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { hapticCommit, hapticReject, hapticSelect } from '@/lib/haptics';

// BottomSheetTextInput is not one of the components NativeWind registers, so its
// className would be dropped silently. Registering it once is what lets the note
// field share the INPUT classes every other field in the app uses.
cssInterop(BottomSheetTextInput, { className: 'style' });

const INPUT =
  'min-h-[120px] rounded-card border border-border bg-surface p-3 text-base text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark';

const CLOSABLE: ClosableStatus[] = ['C', 'N', 'NC'];

const NC_REASONS: { key: NcReason; label: string }[] = [
  { key: 'illness', label: 'Illness' },
  { key: 'blocked_by_others', label: 'Blocked by others' },
  { key: 'cancelled_externally', label: 'Cancelled externally' },
  { key: 'plan_changed', label: 'Plan changed' },
  { key: 'other', label: 'Other' },
];

const PLACEHOLDER: Record<ClosableStatus, string> = {
  C: 'What made it happen?',
  N: 'What got in the way? Be honest, nobody else reads this.',
  NC: 'What happened that was outside your control?',
};

// One tall detent. The form is long and the keyboard needs the room; a shorter
// first detent would only be somewhere to get stuck. Module-level so the sheet is
// not handed a new array on every keystroke.
const SNAP_POINTS = ['92%'];

import { SHEET_THEME } from '@/constants/theme';

export function CloseTaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const close = useCloseTask();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const keyboardHeight = useKeyboardHeight();

  const sheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const noteRef = useRef<GestureTextInput>(null);
  const presentedRef = useRef(false);

  // The task being closed is copied into state rather than read from the prop, so
  // that a rejected close can offer the sheet back with the same task and the same
  // words after the parent has already let go of it.
  const [active, setActive] = useState<Task | null>(null);
  const [draft, setDraft] = useState<CloseDraft>(EMPTY_DRAFT);
  const [noteFocused, setNoteFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-closing an already-closed task is the honest correction path, and it is worth
  // saying so out loud — people assume a closed task is finished with.
  const isCorrection = !!active && active.status !== 'OPEN';
  const dirty = isDirty(draft);
  const blocker = submitBlocker(draft);
  const counter = noteCounter(draft.note, draft.voiceNoteId !== null);

  // ---- Opening and closing ---------------------------------------------------

  const open = useCallback((target: Task, initial: CloseDraft) => {
    setActive(target);
    setDraft(initial);
    setSubmitting(false);
    setNoteFocused(false);
    presentedRef.current = true;
    sheetRef.current?.present();
  }, []);

  // Opening from the prop is split in two, because the two halves want different
  // places. Seeding the form is a state adjustment — new task in, fresh draft out —
  // and React 19's react-hooks/set-state-in-effect rejects doing that in an effect:
  // the effect version renders the sheet once with the previous task's words still in
  // it. Done during render, React re-runs the component before anything is painted.
  //
  // `requested` starts null rather than at `task` so that a sheet mounted with a task
  // already in hand still seeds itself on that first render.
  const [requested, setRequested] = useState<Task | null>(null);
  if (task !== requested) {
    setRequested(task);
    if (task) {
      setActive(task);
      setDraft(EMPTY_DRAFT);
      setSubmitting(false);
      setNoteFocused(false);
    }
  }

  // Presenting and dismissing are imperative calls into the sheet, so they stay in an
  // effect — after the commit, exactly where they ran before.
  useEffect(() => {
    if (task) {
      presentedRef.current = true;
      sheetRef.current?.present();
    } else if (presentedRef.current) {
      sheetRef.current?.dismiss();
    }
  }, [task]);

  // Fires once the sheet has finished sliding away, whichever way it went.
  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    setActive(null);
    setDraft(EMPTY_DRAFT);
    setNoteFocused(false);
    onClose();
  }, [onClose]);

  // The one exit. Words typed and recordings made are worth a question; a status
  // picked and nothing else is one tap to redo, so that goes quietly.
  const requestClose = useCallback(() => {
    if (submitting) return;
    if (!dirty) {
      sheetRef.current?.dismiss();
      return;
    }
    Alert.alert(
      'Throw this away?',
      draft.voiceNoteId
        ? 'The voice note you recorded and anything you typed will not be attached to this task.'
        : 'What you have typed will be lost. Nothing is recorded.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => sheetRef.current?.dismiss() },
      ],
    );
  }, [dirty, draft.voiceNoteId, submitting]);

  // ---- Saving ----------------------------------------------------------------

  // The database refused. Its messages are written to be read by a person, so the
  // text is shown as it came rather than replaced with something vaguer — and the
  // words already typed come back with it, unless another sheet is open by now.
  const offerBack = useCallback(
    (target: Task, sent: CloseDraft, error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not close that task.';
      Alert.alert(
        `“${target.title}” was not closed`,
        message,
        presentedRef.current
          ? [{ text: 'OK' }]
          : [
              { text: 'Not now', style: 'cancel' },
              { text: 'Try again', onPress: () => open(target, sent) },
            ],
      );
    },
    [open],
  );

  const { mutate } = close;
  const submit = useCallback(() => {
    if (!active || !draft.status || submitting || !canSubmit(draft)) return;
    const target = active;
    const sent = draft;
    setSubmitting(true);
    Keyboard.dismiss();

    mutate(
      {
        taskId: target.id,
        status: draft.status,
        // An empty string is not a note. With a voice note attached the RPC wants
        // p_note absent, not blank.
        note: sent.note.trim() || undefined,
        voiceNoteId: sent.voiceNoteId,
        ncReason: draft.status === 'NC' ? sent.ncReason : null,
        weekStart: target.week_start,
      },
      {
        onSuccess: () => hapticCommit(),
        onError: (error) => {
          hapticReject();
          offerBack(target, sent, error);
        },
      },
    );

    // Not awaited. The cache flipped in onMutate; the sheet has nothing left to wait
    // for, and offline it would be waiting until the train reaches a town.
    sheetRef.current?.dismiss();
  }, [active, draft, submitting, mutate, offerBack]);

  // ---- Form ------------------------------------------------------------------

  // The note is the next thing needed, so it takes focus without another tap. NC
  // is the exception: its reason comes first, and the field takes focus once that
  // is picked — a keyboard over the reason chips would hide the thing being asked.
  const focusNote = useCallback(() => {
    requestAnimationFrame(() => noteRef.current?.focus());
  }, []);

  function pickStatus(status: ClosableStatus) {
    hapticSelect();
    setDraft((d) => ({ ...d, status, ncReason: status === 'NC' ? d.ncReason : null }));
    if (status !== 'NC') focusNote();
  }

  function pickReason(reason: NcReason) {
    hapticSelect();
    setDraft((d) => ({ ...d, ncReason: reason }));
    focusNote();
  }

  function attachVoiceNote(voiceNoteId: string) {
    setDraft((d) => ({ ...d, voiceNoteId }));
  }

  // ---- Sheet chrome ----------------------------------------------------------

  const colors = scheme === 'dark' ? SHEET_THEME.dark : SHEET_THEME.light;
  const backgroundStyle = useMemo(() => ({ backgroundColor: colors.background }), [colors]);
  const handleStyle = useMemo(() => ({ backgroundColor: colors.handle }), [colors]);

  // The sheet lifts itself clear of the keyboard but does not shrink its content,
  // so the end of the form can sit behind the keys with no way to scroll to it.
  // Padding the content by the keyboard's height is the whole fix. Android resizes
  // the window instead (adjustResize), so it needs none.
  const contentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24 + (Platform.OS === 'ios' ? keyboardHeight : 0),
    }),
    [keyboardHeight],
  );

  // The backdrop and footer are handed to the sheet as component types, so a new
  // function means a remount. Reading the latest handlers through refs keeps the
  // backdrop stable for good, and the footer stable until something it shows changes.
  //
  // useLatestRef, not `ref.current = fn` during render: the React Compiler is on and a
  // render can be retried or thrown away, so the assignment belongs in an effect. Both
  // of these are only ever read from a press, which is long after effects have flushed.
  const requestCloseRef = useLatestRef(requestClose);
  const submitRef = useLatestRef(submit);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="none"
        onPress={() => requestCloseRef.current()}
      />
    ),
    [requestCloseRef],
  );

  // Pinned above the keyboard by the sheet, so Save is never behind the keys. The
  // reason it is disabled sits right beside it — never a silent grey button.
  const bottomInset = insets.bottom;
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={bottomInset}>
        <View className="gap-2 border-border bg-bg px-gutter pb-2 pt-3 dark:border-border-dark dark:bg-bg-dark border-t">
          <Text variant="micro" className="text-center" accessibilityLiveRegion="polite">
            {blocker ?? 'Once closed, this cannot be deleted — only closed again with the truth.'}
          </Text>
          <Button
            label={isCorrection ? 'Record the correction' : 'Close this task'}
            onPress={() => submitRef.current()}
            disabled={!!blocker || submitting}
            loading={submitting}
          />
          <Button
            label="Not yet"
            variant="ghost"
            disabled={submitting}
            onPress={() => requestCloseRef.current()}
          />
        </View>
      </BottomSheetFooter>
    ),
    [blocker, isCorrection, submitting, bottomInset, requestCloseRef, submitRef],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      topInset={insets.top}
      // A pull-down with words in the box snaps back instead of closing; the way
      // out is the button, which asks. Clean, it closes like any sheet.
      enablePanDownToClose={!dirty}
      // Only the handle drags the sheet. The content gesture is a native pan that
      // would take the touch off the mic button a few pixels into a hold-to-record
      // and end the recording early; the recorder's own guard against that only
      // covers RN's responder system, not gesture-handler.
      enableContentPanningGesture={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={backgroundStyle}
      handleIndicatorStyle={handleStyle}
      onDismiss={handleDismiss}>
      <BottomSheetScrollView
        ref={scrollRef}
        contentContainerStyle={contentStyle}
        enableFooterMarginAdjustment
        keyboardShouldPersistTaps="handled"
        // While the note has focus, anything that grows the form — the keyboard
        // padding arriving, the text wrapping, the player appearing — keeps the
        // field in view rather than pushing it under the keys.
        onContentSizeChange={() => {
          if (noteFocused) scrollRef.current?.scrollToEnd({ animated: true });
        }}>
        <Text variant="micro" className="tracking-wider uppercase">
          {isCorrection ? `Correcting · currently ${active?.status}` : 'Closing'}
        </Text>
        <Text variant="title" className="mt-1">
          {active?.title}
        </Text>

        {isCorrection ? (
          <Text variant="meta" className="mt-2">
            This will be recorded as a change. The original close stays in the record — this adds a
            second entry rather than replacing the first.
          </Text>
        ) : null}

        {/* Status ----------------------------------------------------------- */}
        <Text variant="heading" className="mt-7">
          What happened?
        </Text>
        <View className="mt-3 gap-2">
          {CLOSABLE.map((s) => {
            const meta = STATUS_META[s];
            const on = draft.status === s;
            const already = active?.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => pickStatus(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: already }}
                disabled={already || submitting}
                className={`gap-3 rounded-card p-card flex-row items-center border ${
                  on
                    ? 'border-accent bg-raised dark:border-accent-dark dark:bg-raised-dark'
                    : 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark'
                } ${already ? 'opacity-40' : ''}`}>
                <View className={`h-4 w-4 rounded-full ${meta.dot}`} />
                <View className="flex-1">
                  <Text className="font-semibold">
                    {s} · {meta.label}
                    {already ? ' (already)' : ''}
                  </Text>
                  <Text variant="micro">
                    {s === 'NC'
                      ? 'Something outside your control made this impossible. This will not count for or against you.'
                      : meta.meaning}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* NC reason -------------------------------------------------------- */}
        {draft.status === 'NC' ? (
          <View className="mt-5">
            <Text variant="heading">Why was it out of your control?</Text>
            <Text variant="meta" className="mt-1">
              NC is left out of your completion rate, so it needs a category. This is the one status
              that can make a bad week look good.
            </Text>
            <View className="mt-3 gap-2 flex-row flex-wrap">
              {NC_REASONS.map((r) => {
                const on = draft.ncReason === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => pickReason(r.key)}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    className={`px-3 py-2 rounded-full ${
                      on ? 'bg-accent dark:bg-accent-dark' : 'bg-raised dark:bg-raised-dark'
                    }`}>
                    <Text
                      className={`text-meta font-semibold ${
                        on ? 'text-white' : 'text-muted dark:text-muted-dark'
                      }`}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Note ------------------------------------------------------------- */}
        <Text variant="heading" className="mt-7">
          In your own words
        </Text>
        <Text variant="meta" className="mt-1">
          {draft.status === 'NC'
            ? 'What made this impossible? This is what you will actually read back in six months.'
            : 'This is what you will actually read back in six months.'}
        </Text>
        <BottomSheetTextInput
          ref={noteRef}
          className={`${INPUT} mt-3`}
          value={draft.note}
          onChangeText={(note) => setDraft((d) => ({ ...d, note }))}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
          placeholder={draft.status ? PLACEHOLDER[draft.status] : 'Pick a status first.'}
          editable={!submitting}
          multiline
          textAlignVertical="top"
          maxLength={2000}
          accessibilityLabel="Closing note"
        />
        <Text
          variant="micro"
          className={`mt-1.5 text-right tabular-nums ${
            counter.valid ? 'text-status-c dark:text-status-c-dark' : ''
          }`}
          accessibilityLiveRegion="polite">
          {counter.label}
        </Text>

        {/* Voice ------------------------------------------------------------ */}
        {draft.voiceNoteId ? (
          <View className="mt-3 gap-1.5">
            <Text variant="micro" className="tracking-wider uppercase">
              Voice note
            </Text>
            <VoiceNotePlayer voiceNoteId={draft.voiceNoteId} />
            <Text variant="micro">
              Listen back before saving. It stays with this close for good, and the written note
              above is now optional.
            </Text>
          </View>
        ) : (
          <View className="mt-3">
            <VoiceRecorderButton onRecorded={attachVoiceNote} disabled={submitting} />
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** The keyboard's height on screen, 0 when hidden. Will-events on iOS so the padding lands with the keys, not after them. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
