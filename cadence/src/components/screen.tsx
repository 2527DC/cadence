import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

/**
 * Standard screen frame: safe area, page background, title block.
 * Every class here is NativeWind — if this renders styled, the Tailwind pipeline works.
 */
export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark" edges={['top']}>
      <ScrollView contentContainerClassName="px-gutter pb-12 pt-2">
        <Text className="text-3xl font-bold text-ink dark:text-ink-dark">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-meta text-muted dark:text-muted-dark">{subtitle}</Text>
        ) : null}
        <View className="mt-6">{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
