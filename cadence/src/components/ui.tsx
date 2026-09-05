// The base components every screen is built from.
//
// P02 asks for these to exist once, so that the status colours in particular are
// defined in a single place. A `C` that is a slightly different green on the
// dashboard than on the week screen makes the whole record feel approximate, which
// is the opposite of what this app is for.

import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type TextProps as RNTextProps,
  type ViewProps,
} from 'react-native';

import { PALETTE, STATUS_THEME } from '@/constants/theme';
import type { Database } from '@/types/database.types';

type TaskStatus = Database['public']['Enums']['task_status'];

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextVariant = 'title' | 'heading' | 'body' | 'meta' | 'micro';

const TEXT_VARIANTS: Record<TextVariant, string> = {
  title: 'text-3xl font-bold text-ink dark:text-ink-dark',
  heading: 'text-lg font-semibold text-ink dark:text-ink-dark',
  body: 'text-base text-ink dark:text-ink-dark',
  meta: 'text-meta text-muted dark:text-muted-dark',
  micro: 'text-micro text-faint dark:text-faint-dark',
};

export function Text({
  variant = 'body',
  className = '',
  ...rest
}: RNTextProps & { variant?: TextVariant; className?: string }) {
  return <RNText className={`${TEXT_VARIANTS[variant]} ${className}`} {...rest} />;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  className?: string;
};

const BUTTON_BASE =
  'min-h-[48px] flex-row items-center justify-center rounded-card px-5 active:opacity-80';

const BUTTON_VARIANTS = {
  primary: 'bg-accent dark:bg-accent-dark',
  secondary: 'border border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
  ghost: 'bg-transparent',
} as const;

const BUTTON_LABELS = {
  primary: 'text-base font-semibold text-white',
  secondary: 'text-base font-semibold text-ink dark:text-ink-dark',
  ghost: 'text-base font-semibold text-accent dark:text-accent-dark',
} as const;

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : PALETTE.light.accent} />
      ) : (
        <RNText className={BUTTON_LABELS[variant]}>{label}</RNText>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * `draft` switches the border to dashed. That is not decoration: a dashed edge means
 * editable and deletable, a solid edge means finalized and permanent. It carries rule
 * R1, which is why it is a prop here rather than a class written at each call site.
 */
export function Card({
  draft = false,
  className = '',
  ...rest
}: ViewProps & { draft?: boolean; className?: string }) {
  const edge = draft
    ? 'border-draft border-dashed bg-transparent'
    : 'border bg-surface dark:bg-surface-dark';
  return (
    <View
      className={`rounded-card border-border p-card dark:border-border-dark ${edge} ${className}`}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// StatusDot / StatusPill
// ---------------------------------------------------------------------------

export const STATUS_META = STATUS_THEME;

export function StatusDot({ status, className = '' }: { status: TaskStatus; className?: string }) {
  return (
    <View
      accessibilityLabel={STATUS_META[status].label}
      className={`h-3 w-3 rounded-full ${STATUS_META[status].dot} ${className}`}
    />
  );
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <View
      className={`gap-1.5 px-2.5 py-1 flex-row items-center rounded-full border ${meta.pillBg} ${meta.pillBorder}`}>
      <StatusDot status={status} className="h-2 w-2" />
      <RNText className={`text-micro font-bold ${meta.text}`}>{status}</RNText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="px-6 py-12 items-center">
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      <Text variant="meta" className="mt-2 text-center">
        {body}
      </Text>
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

/** Whatever a query, a mutation or a `catch` handed us, as something readable. */
export function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Something went wrong, and it did not say what.';
}

/**
 * The one shape every failed read takes. P12.
 *
 * Three rules it exists to enforce across the app:
 *
 *   1. The message is shown verbatim. The database's refusals were written to be read
 *      by a person, and replacing them with "Something went wrong" throws away the
 *      only sentence that says what to do next.
 *   2. There is always a way to try again when the caller can offer one, so a failed
 *      read is never a dead end that needs the app killed.
 *   3. Red is never the only signal — the dot sits next to a heading that says the
 *      same thing in words, for a colour-blind reader and for VoiceOver.
 */
export function ErrorState({
  title = 'That did not load',
  message,
  onRetry,
  className = '',
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={`mt-4 ${className}`} accessibilityRole="alert">
      <View className="gap-2 flex-row items-center">
        <View className="bg-status-n dark:bg-status-n-dark h-2 w-2 rounded-full" />
        <Text variant="heading" className="flex-1">
          {title}
        </Text>
      </View>
      <Text variant="meta" className="mt-2" selectable>
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" className="mt-4" onPress={onRetry} />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function Loading({ label }: { label?: string }) {
  return (
    <View className="py-12 items-center" accessible accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator />
      {label ? (
        <Text variant="meta" className="mt-3">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
