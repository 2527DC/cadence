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
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#3B6FF5'} />
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

export const STATUS_META: Record<
  TaskStatus,
  { label: string; meaning: string; dot: string; text: string }
> = {
  OPEN: {
    label: 'Open',
    meaning: 'Committed, not yet resolved',
    dot: 'bg-status-open dark:bg-status-open-dark',
    text: 'text-status-open dark:text-status-open-dark',
  },
  C: {
    label: 'Completed',
    meaning: 'You did it',
    dot: 'bg-status-c dark:bg-status-c-dark',
    text: 'text-status-c dark:text-status-c-dark',
  },
  N: {
    label: 'Not completed',
    meaning: 'You did not do it',
    dot: 'bg-status-n dark:bg-status-n-dark',
    text: 'text-status-n dark:text-status-n-dark',
  },
  NC: {
    label: 'Not counted',
    meaning: 'Outside your control — excluded from the rate',
    dot: 'bg-status-nc dark:bg-status-nc-dark',
    text: 'text-status-nc dark:text-status-nc-dark',
  },
};

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
    <View className="flex-row items-center gap-1.5 rounded-full bg-raised px-2 py-1 dark:bg-raised-dark">
      <StatusDot status={status} className="h-2 w-2" />
      <RNText className={`text-micro font-semibold ${meta.text}`}>{status}</RNText>
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
    <View className="items-center px-6 py-12">
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
// Loading
// ---------------------------------------------------------------------------

export function Loading({ label }: { label?: string }) {
  return (
    <View className="items-center py-12">
      <ActivityIndicator />
      {label ? (
        <Text variant="meta" className="mt-3">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
