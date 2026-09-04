// The two switches. P11.
//
// OQ-10 in a card: two reminders, each independently toggleable, and nothing else on
// offer. There is no "notify me about streaks", no daily reminder and no master
// switch, because the shortest route to never opening this app again is for it to
// start nagging.
//
// The permission ask lives here rather than on launch, and the sentence explaining why
// is directly above the button that triggers it. iOS shows its prompt exactly once per
// install: a refusal is permanent, so the one chance to ask is worth spending on a
// screen where the person already knows what they are being asked for.

import { useEffect } from 'react';
import { AppState, Linking, Switch, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { hapticSelect } from '@/lib/haptics';

import { REMINDERS, REMINDER_KINDS, type ReminderKind } from './schedule';
import {
  askForReminderPermission,
  refreshReminderPermission,
  setReminderEnabled,
  useReminderState,
} from './store';

export function ReminderSettings() {
  const { prefs, permission, loaded } = useReminderState();

  // Coming back from the Settings app is the one way permission changes without this
  // app being involved, and there is no event for it. A foreground check is enough.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshReminderPermission();
    });
    return () => sub.remove();
  }, []);

  return (
    <Card className="mt-4">
      <Text variant="micro" className="tracking-wider uppercase">
        Reminders
      </Text>

      <Text variant="meta" className="mt-2">
        Two, on purpose. One to review the week that just ended, one to plan the next. Nothing else
        will ever be sent.
      </Text>

      <View className="mt-3">
        {REMINDER_KINDS.map((kind) => (
          <ReminderRow
            key={kind}
            kind={kind}
            enabled={prefs[kind]}
            // Until the stored preferences have been read, a switch would be showing a
            // guess. Disabled is better than wrong.
            disabled={!loaded || permission !== 'granted'}
          />
        ))}
      </View>

      {permission === 'granted' ? null : permission === 'undetermined' ? (
        <View className="mt-3">
          <Text variant="meta">
            To send these, Cadence needs permission to show notifications. It is used for these two
            and nothing else — no badges, no daily prompts.
          </Text>
          <Button
            label="Allow reminders"
            variant="secondary"
            className="mt-3"
            onPress={() => {
              hapticSelect();
              void askForReminderPermission();
            }}
          />
        </View>
      ) : (
        <View className="mt-3">
          <Text variant="meta">
            Notifications are off for Cadence, so neither reminder can be sent. Everything else
            works — the review is always here, and the dashboard says when one is due.
          </Text>
          <Button
            label="Open Settings"
            variant="secondary"
            className="mt-3"
            onPress={() => {
              hapticSelect();
              void Linking.openSettings();
            }}
          />
        </View>
      )}
    </Card>
  );
}

function ReminderRow({
  kind,
  enabled,
  disabled,
}: {
  kind: ReminderKind;
  enabled: boolean;
  disabled: boolean;
}) {
  const reminder = REMINDERS[kind];
  return (
    <View className="border-border dark:border-border-dark py-3 flex-row items-center justify-between border-t">
      <View className="mr-4 flex-1">
        <Text className="font-semibold">{reminder.title}</Text>
        <Text variant="micro" className="mt-0.5">
          {reminder.description}
        </Text>
      </View>
      <Switch
        value={enabled}
        disabled={disabled}
        accessibilityLabel={reminder.title}
        onValueChange={(next) => {
          hapticSelect();
          void setReminderEnabled(kind, next);
        }}
      />
    </View>
  );
}
