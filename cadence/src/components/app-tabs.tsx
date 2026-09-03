import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * The four tabs from doc/04-architecture.md §1: Week · Chat · Dashboard · Goals.
 *
 * SF Symbols rather than PNG assets — this is an iPhone-first build (OQ-6), and the
 * system symbols give a native tab bar with no image pipeline to maintain.
 *
 * Label and Icon are imported directly rather than reached through
 * NativeTabs.Trigger.*, which is the SDK 57 shape. This project runs SDK 54, where
 * they are top-level exports of expo-router/unstable-native-tabs.
 */
export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>Week</Label>
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <Label>Chat</Label>
        <Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dashboard">
        <Label>Dashboard</Label>
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="goals">
        <Label>Goals</Label>
        <Icon sf={{ default: 'flag', selected: 'flag.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
