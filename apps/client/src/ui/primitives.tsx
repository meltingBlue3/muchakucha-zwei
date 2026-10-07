import { ThemeProvider, createBox, createText, useTheme } from '@shopify/restyle';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import React, { forwardRef, useContext, useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput as NativeTextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Info from 'lucide-react-native/icons/info';

import { BrandLogo } from './brand-logo';
import { KeyboardArea, scrollKeyboardDismissMode } from './keyboard-area';
import { SheetActionSlot } from './sheet-action';
import { theme, type Space, type TextVariant, type Theme } from './theme';

const Box = createBox<Theme>();
const RestyleText = createText<Theme>();

export const MuchakuchaThemeProvider = ({ children }: PropsWithChildren) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

type ScreenProps = PropsWithChildren<{
  accessibilityLabel?: string;
  testID?: string;
}>;

export const Screen = ({ accessibilityLabel, children, testID }: ScreenProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <SafeAreaView
      accessibilityLabel={accessibilityLabel}
      role={Platform.OS === 'web' ? 'main' : undefined}
      style={{ backgroundColor: activeTheme.colors.canvas, flex: 1 }}
      testID={testID}
    >
      <KeyboardArea style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: activeTheme.layout.mobileInset,
            paddingVertical: activeTheme.spacing[6],
          }}
          keyboardDismissMode={scrollKeyboardDismissMode}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardArea>
    </SafeAreaView>
  );
};

type LayoutProps = PropsWithChildren<ViewProps & { gap?: Space }>;

export const Stack = ({ children, gap = 4, style, ...props }: LayoutProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <View {...props} style={[{ gap: activeTheme.spacing[gap] }, style]}>
      {children}
    </View>
  );
};

export const Inline = ({ children, gap = 2, style, ...props }: LayoutProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <View
      {...props}
      style={[
        { alignItems: 'center', flexDirection: 'row', gap: activeTheme.spacing[gap] },
        style,
      ]}
    >
      {children}
    </View>
  );
};

type OwnedTextProps = React.ComponentProps<typeof RestyleText> & {
  // React Native Web makes text programmatically focusable; native text ignores it.
  tabIndex?: 0 | -1;
  variant?: TextVariant;
};

const tabularFigures = { fontVariant: ['tabular-nums' as const] };

export const Text = ({ variant = 'body', style, ...props }: OwnedTextProps) => (
  <RestyleText
    allowFontScaling
    maxFontSizeMultiplier={2}
    variant={variant}
    // Times and counts line up in columns when every figure is the same width.
    style={variant === 'time' || variant === 'numeral' ? [tabularFigures, style] : style}
    {...props}
  />
);

type HeadingProps = OwnedTextProps & {
  /**
   * Outline level for assistive technology. Defaults follow the visual size:
   * page and window titles are 1, section titles 2, anything smaller 3.
   */
  level?: 1 | 2 | 3;
};

const defaultHeadingLevel = (variant: TextVariant): 1 | 2 | 3 =>
  variant === 'heading' || variant === 'display' ? 1 : variant === 'section' ? 2 : 3;

export const Heading = forwardRef<React.ElementRef<typeof RestyleText>, HeadingProps>(
  ({ variant = 'heading', level, ...props }, ref) => (
    <Text accessibilityRole="header" aria-level={level ?? defaultHeadingLevel(variant)} ref={ref} variant={variant} {...props} />
  ),
);

Heading.displayName = 'Heading';

export const Spinner = ({ label = '正在处理', inverse = false }: { label?: string; inverse?: boolean }) => {
  const activeTheme = useTheme<Theme>();
  return (
    <ActivityIndicator
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      color={inverse ? activeTheme.colors.surface : activeTheme.colors.inkMuted}
      size="small"
    />
  );
};

type ButtonTone = 'primary' | 'secondary' | 'destructive';

type ButtonProps = Omit<PressableProps, 'children'> & {
  /** Lets a dialog return focus to the button that opened it. */
  ref?: React.Ref<View>;
  label: string;
  loading?: boolean;
  /** `destructive` commits an irreversible or access-removing change. */
  tone?: ButtonTone;
  /** Set on a button that shows or hides content, so its state is announced. */
  expanded?: boolean;
  /**
   * `compact` is a smaller pill for a secondary action beside a title, in a
   * row or in a phone sheet; it keeps the full touch target through hit slop.
   */
  size?: 'regular' | 'compact';
};

export const getButtonFill = (state: { disabled: boolean; pressed: boolean }, tone: Exclude<ButtonTone, 'secondary'> = 'primary'): string =>
  state.disabled
    ? theme.colors.disabled
    : tone === 'destructive'
      ? state.pressed ? theme.colors.destructivePressed : theme.colors.destructive
      : state.pressed ? theme.colors.primaryPressed : theme.colors.primary;

/**
 * Button's Web focus ring: a vermilion outline drawn outside the pill, so
 * focusing never shifts the layout. Every other focusable element gets the
 * same ring from the global `:focus-visible` rule (platform/focus-ring).
 */
const webFocusRing = (focused: boolean) =>
  Platform.OS === 'web' && focused
    ? { outlineColor: theme.colors.focusRing, outlineOffset: theme.focus.offset, outlineStyle: 'solid' as const, outlineWidth: theme.focus.width }
    : {};

export const Button = ({ disabled, label, loading = false, tone = 'primary', expanded, size = 'regular', style, ...props }: ButtonProps) => {
  const activeTheme = useTheme<Theme>();
  const unavailable = disabled || loading;
  const [focused, setFocused] = useState(false);
  const { onBlur, onFocus, ...pressableProps } = props;
  const compact = size === 'compact';
  const slop = (activeTheme.controlSizes.touchTarget - activeTheme.controlSizes.compact) / 2;
  return (
    <Pressable
      {...(compact ? { hitSlop: { top: slop, bottom: slop } } : {})}
      {...pressableProps}
      accessibilityLabel={pressableProps.accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable, ...(expanded === undefined ? {} : { expanded }) }}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      disabled={unavailable}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      style={(state) => [
        {
          alignItems: 'center',
          backgroundColor: tone === 'secondary' && !unavailable
            ? state.pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface
            : getButtonFill({ disabled: unavailable, pressed: state.pressed }, tone === 'destructive' ? 'destructive' : 'primary'),
          // A secondary button on a white surface needs an edge to read as a button; focus still wins.
          borderColor: focused ? activeTheme.colors.focusRing : tone === 'secondary' && !unavailable ? activeTheme.colors.outline : activeTheme.colors.transparent,
          borderRadius: activeTheme.borderRadii.full,
          borderWidth: activeTheme.borderWidths.default,
          flexDirection: 'row',
          gap: activeTheme.spacing[2],
          justifyContent: 'center',
          minHeight: compact ? activeTheme.controlSizes.compact : activeTheme.controlSizes.primary,
          minWidth: activeTheme.controlSizes.touchTarget,
          paddingHorizontal: compact ? activeTheme.spacing[4] : activeTheme.spacing[5],
          ...webFocusRing(focused),
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? <Spinner inverse={tone !== 'secondary'} label={`${label}，正在处理`} /> : null}
      <Text variant={compact ? 'label' : 'button'} color={unavailable ? 'inkMuted' : tone === 'secondary' ? 'ink' : 'surface'}>{label}</Text>
    </Pressable>
  );
};

export function FormActions({ onCancel, onSubmit, submitting, submitLabel, disabled = false }: {
  onCancel(): void;
  onSubmit(): void;
  submitting: boolean;
  submitLabel: string;
  /** Keeps the submit unavailable, for example when there is nothing to save. */
  disabled?: boolean;
}) {
  const sheet = useContext(SheetActionSlot);
  const submit = useRef(onSubmit);
  submit.current = onSubmit;
  useEffect(() => {
    if (!sheet) return;
    sheet({ label: submitLabel, submitting, disabled, onPress: () => submit.current() });
    return () => sheet(null);
  }, [sheet, submitLabel, submitting, disabled]);
  // A compact editor sheet shows the submit in its header and cancels through its close button.
  if (sheet) return null;
  return (
    <Inline gap={3} style={{ marginTop: theme.spacing[4] }}>
      <Button label="取消" tone="secondary" disabled={submitting} onPress={onCancel} style={{ flex: 1 }} />
      <Button label={submitLabel} loading={submitting} disabled={disabled} onPress={onSubmit} style={{ flex: 2 }} />
    </Inline>
  );
}

/**
 * The two answers to a confirmation: the safe choice first, the committing
 * choice second. Side by side when both labels fit, stacked otherwise, so
 * every confirmation in the app reads the same way.
 */
export function ConfirmActions({
  cancelLabel = '取消',
  cancelAccessibilityLabel,
  confirmLabel,
  confirmAccessibilityLabel,
  onCancel,
  onConfirm,
  busy = false,
  destructive = false,
  confirmDisabled = false,
}: {
  cancelLabel?: string;
  cancelAccessibilityLabel?: string;
  confirmLabel: string;
  confirmAccessibilityLabel?: string;
  onCancel(): void;
  onConfirm(): void;
  busy?: boolean;
  destructive?: boolean;
  confirmDisabled?: boolean;
}) {
  // Each answer starts at its label's width and shares the rest, so the pair
  // wraps only when the labels themselves do not fit side by side.
  const actionStyle = { flexGrow: 1 };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}>
      <Button
        label={cancelLabel}
        {...(cancelAccessibilityLabel ? { accessibilityLabel: cancelAccessibilityLabel } : {})}
        tone="secondary"
        disabled={busy}
        onPress={onCancel}
        style={actionStyle}
      />
      <Button
        label={confirmLabel}
        {...(confirmAccessibilityLabel ? { accessibilityLabel: confirmAccessibilityLabel } : {})}
        tone={destructive ? 'destructive' : 'primary'}
        loading={busy}
        disabled={confirmDisabled}
        onPress={onConfirm}
        style={actionStyle}
      />
    </View>
  );
}

type IconButtonProps = Omit<PressableProps, 'children'> & {
  ref?: React.Ref<View>;
  icon: ReactElement;
  label: string;
  visibleLabel?: boolean;
  /** `plain` sits in a header beside other bare icons; `outlined` groups tools such as a formatting bar. */
  appearance?: 'outlined' | 'plain';
};

export const IconButton = ({ icon, label, style, visibleLabel = false, appearance = 'outlined', ...props }: IconButtonProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={(state) => [
        {
          alignItems: 'center',
          backgroundColor: state.pressed ? activeTheme.colors.surfaceMuted : appearance === 'plain' ? activeTheme.colors.transparent : activeTheme.colors.surface,
          borderColor: appearance === 'plain' ? activeTheme.colors.transparent : activeTheme.colors.outline,
          borderRadius: activeTheme.borderRadii.full,
          borderWidth: activeTheme.borderWidths.default,
          flexDirection: 'row',
          gap: activeTheme.spacing[2],
          justifyContent: 'center',
          minHeight: activeTheme.controlSizes.touchTarget,
          minWidth: activeTheme.controlSizes.touchTarget,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {icon}
      {visibleLabel ? <Text variant="label">{label}</Text> : null}
    </Pressable>
  );
};

type FieldProps = TextInputProps & {
  disabled?: boolean;
  error?: string;
  label: string;
  hint?: string;
  /** Submit attempt counter; each increase re-focuses the first invalid field even if its error is unchanged. */
  submitAttempt?: number;
  trailing?: ReactNode;
};

export const TextField = forwardRef<NativeTextInput, FieldProps>(
  ({ disabled, error, hint, submitAttempt, trailing, label, nativeID, onBlur, onFocus, style, ...props }, ref) => {
    const activeTheme = useTheme<Theme>();
    const preferences = useAccessibilityPreferences();
    const generatedId = useId();
    const inputId = nativeID ?? `field-${generatedId}`;
    const errorId = `${inputId}-error`;
    const [focused, setFocused] = useState(false);
    const seenSubmitAttempt = useRef(submitAttempt);
    useEffect(() => {
      // Only a submit moves focus to the first invalid field. react-hook-form raises
      // submitCount together with that submission's errors, server errors included.
      // Blur validation leaves focus wherever Tab, a pointer, or a tap sent it.
      if (submitAttempt === seenSubmitAttempt.current) return undefined;
      seenSubmitAttempt.current = submitAttempt;
      if (!error || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const timeout = setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
      return () => clearTimeout(timeout);
    }, [error, submitAttempt]);
    return (
      <Stack gap={2}>
        <Text nativeID={`${inputId}-label`} variant="label">
          {label}
        </Text>
        <View>
        <NativeTextInput
          {...props}
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          aria-describedby={error ? errorId : hint ? `${inputId}-hint` : undefined}
          aria-invalid={Boolean(error)}
          aria-labelledby={`${inputId}-label`}
          editable={!disabled}
          nativeID={inputId}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          ref={ref}
          style={[
            {
              backgroundColor: disabled ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface,
              borderColor: error
                ? activeTheme.colors.destructive
                : focused
                  ? activeTheme.colors.ink
                  : activeTheme.colors.border,
              borderRadius: activeTheme.borderRadii.md,
              borderWidth: focused
                ? activeTheme.borderWidths.focus
                : activeTheme.borderWidths.default,
              color: activeTheme.colors.ink,
              fontFamily: activeTheme.fontFamilies.regular,
              fontSize: activeTheme.typography.body.fontSize,
              lineHeight: activeTheme.typography.body.lineHeight,
              minHeight: activeTheme.controlSizes.field,
              paddingHorizontal: activeTheme.spacing[4],
              ...(trailing ? { paddingRight: activeTheme.spacing[16] } : {}),
              ...(Platform.OS === 'web' && preferences.forcedColors
                ? {
                    outlineColor: 'CanvasText',
                    outlineStyle: 'solid',
                    outlineWidth: activeTheme.borderWidths.focus,
                  }
                : {}),
            },
            style,
          ]}
        />
        {trailing ? <View style={{ position: 'absolute', right: activeTheme.spacing[1], top: activeTheme.spacing[0], height: activeTheme.controlSizes.field, justifyContent: 'center' }}>{trailing}</View> : null}
        </View>
        {hint && !error ? <Text nativeID={`${inputId}-hint`} variant="caption">{hint}</Text> : null}
        {error ? <FormMessage id={errorId}>{error}</FormMessage> : null}
      </Stack>
    );
  },
);

TextField.displayName = 'TextField';

export const PasswordField = forwardRef<NativeTextInput, FieldProps>((props, forwardedRef) => {
  const activeTheme = useTheme<Theme>();
  const internalRef = useRef<NativeTextInput>(null);
  const [revealed, setRevealed] = useState(false);
  const setRefs = (node: NativeTextInput | null) => {
    internalRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const actionLabel = `${revealed ? '隐藏' : '显示'}${props.label}`;
  return (
    <TextField
      {...props}
      ref={setRefs}
      secureTextEntry={!revealed}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: Boolean(props.disabled) }}
          disabled={props.disabled}
          onPress={() => {
            setRevealed((current) => !current);
            internalRef.current?.focus();
          }}
          style={{ minWidth: activeTheme.controlSizes.touchTarget, minHeight: activeTheme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          {revealed ? <EyeOff color={activeTheme.colors.inkMuted} size={activeTheme.controlSizes.icon} /> : <Eye color={activeTheme.colors.inkMuted} size={activeTheme.controlSizes.icon} />}
        </Pressable>
      }
    />
  );
});

PasswordField.displayName = 'PasswordField';

export const FormMessage = ({ children, id }: PropsWithChildren<{ id?: string }>) => (
  <Inline accessibilityLiveRegion="polite" gap={1} nativeID={id}>
    <CircleAlert color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
    <Text color="destructive" variant="bodySm">
      {children}
    </Text>
  </Inline>
);

type BannerProps = PropsWithChildren<{ title?: string; action?: ReactNode }>;

export const Banner = ({ children, title, action }: BannerProps) => (
  <Box
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    backgroundColor="destructiveSoft"
    borderRadius="lg"
    padding={4}
  >
    {/* Top-aligned: the icon sits beside the first line however tall the message grows. */}
    <Inline gap={2} style={{ alignItems: 'flex-start' }}>
      <CircleAlert color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
      <Stack gap={1} style={{ flex: 1 }}>
        {title ? <Text variant="label">{title}</Text> : null}
        <Text variant="bodySm">{children}</Text>
        {action ? <View style={{ alignSelf: 'flex-start', marginTop: theme.spacing[2] }}>{action}</View> : null}
      </Stack>
    </Inline>
  </Box>
);

/**
 * A failed load: what went wrong and a way to try again, in one place. Screens
 * keep showing any content they already have beneath it.
 */
export const LoadError = ({ title, message, onRetry, retryLabel = '重试', retryAccessibilityLabel, retrying = false, disabled = false }: {
  title?: string;
  message: string;
  onRetry(): void;
  retryLabel?: string;
  retryAccessibilityLabel?: string;
  retrying?: boolean;
  /** Another operation owns the screen; retrying now would race it. */
  disabled?: boolean;
}) => (
  <Banner
    {...(title ? { title } : {})}
    action={
      <Button
        label={retryLabel}
        {...(retryAccessibilityLabel ? { accessibilityLabel: retryAccessibilityLabel } : {})}
        tone="secondary"
        loading={retrying}
        disabled={disabled}
        onPress={onRetry}
      />
    }
  >
    {message}
  </Banner>
);

/** An unknown amount of content still on its way; never shown as an empty list. */
export const LoadingState = ({ label }: { label: string }) => (
  <View style={{ alignItems: 'center', paddingVertical: theme.spacing[6] }}>
    <Spinner label={label} />
  </View>
);

/**
 * Nothing to show yet. Aligned with the page's text edge; an optional action
 * offers the obvious next step, such as clearing a filter.
 */
export const EmptyState = ({ title, message, action }: { title?: string; message: string; action?: ReactNode }) => (
  <Stack gap={2} style={{ paddingVertical: theme.spacing[4] }}>
    {title ? <Text variant="section">{title}</Text> : null}
    <Text variant="bodySm" color="inkMuted">{message}</Text>
    {action ? <View style={{ alignSelf: 'flex-start', marginTop: theme.spacing[1] }}>{action}</View> : null}
  </Stack>
);

export const BrandMark = () => (
  <Inline accessibilityLabel="Muchakucha Zwei" gap={2}>
    <BrandLogo />
    <Text variant="section" style={{ flexShrink: 1 }}>Muchakucha Zwei</Text>
  </Inline>
);

export const getMotionDuration = (reducedMotion: boolean): number =>
  reducedMotion ? theme.motion.reducedTransitionMs : theme.motion.transitionMs;

const readWebPreference = (query: string): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia(query).matches;

const useAccessibilityPreferences = () => {
  const [reducedMotion, setReducedMotion] = useState(() =>
    readWebPreference('(prefers-reduced-motion: reduce)'),
  );
  const [forcedColors, setForcedColors] = useState(() =>
    readWebPreference('(forced-colors: active)'),
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const forcedQuery = window.matchMedia('(forced-colors: active)');
    const sync = () => {
      setReducedMotion(reducedQuery.matches);
      setForcedColors(forcedQuery.matches);
    };
    reducedQuery.addEventListener?.('change', sync);
    forcedQuery.addEventListener?.('change', sync);
    sync();
    return () => {
      reducedQuery.removeEventListener?.('change', sync);
      forcedQuery.removeEventListener?.('change', sync);
    };
  }, []);

  return { forcedColors, reducedMotion };
};

export const AuthShell = ({ children }: PropsWithChildren) => {
  const preferences = useAccessibilityPreferences();
  const duration = getMotionDuration(preferences.reducedMotion);
  return (
    <Screen>
      <View style={{ flex: 1, width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center', justifyContent: 'center', gap: theme.spacing[8] }}>
        <BrandMark />
      <Box
        alignSelf="center"
        maxWidth={theme.layout.authCardMaxWidth}
        testID="auth-shell"
        backgroundColor="surface"
        borderRadius="xl"
        borderColor="separator"
        borderWidth={theme.borderWidths.default}
        padding={6}
        width="100%"
        {...(Platform.OS === 'web'
          ? {
              style: {
                transform: 'none',
                transitionDuration: `${duration}ms`,
                transitionProperty: 'opacity',
              } as never,
            }
          : {})}
      >
        <Stack gap={8}>
          {children}
        </Stack>
      </Box>
      </View>
    </Screen>
  );
};

type LinkTextProps = Omit<PressableProps, 'children'> & { children: ReactNode };

export const LinkText = ({ children, style, ...props }: LinkTextProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <Pressable
      {...props}
      accessibilityRole="link"
      style={(state) => [
        {
          alignSelf: 'flex-start',
          justifyContent: 'center',
          minHeight: activeTheme.controlSizes.touchTarget,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Text color="link" variant="label" style={{ textDecorationLine: 'underline' }}>
        {children}
      </Text>
    </Pressable>
  );
};

type StatusKind = 'success' | 'expired' | 'resetSuccess' | 'offline';
type StatusPanelProps = {
  action: ReactNode;
  body: string;
  heading: string;
  kind: StatusKind;
};

export const StatusPanel = ({ action, body, heading, kind }: StatusPanelProps) => {
  const activeTheme = useTheme<Theme>();
  const headingRef = useRef<React.ElementRef<typeof RestyleText>>(null);
  const success = kind === 'success' || kind === 'resetSuccess';
  const Icon = success ? CircleCheck : kind === 'offline' ? Info : CircleAlert;
  const color = success ? activeTheme.colors.success : kind === 'expired' ? activeTheme.colors.destructive : activeTheme.colors.ink;
  useEffect(() => {
    (headingRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);
  return (
    <Box
      accessibilityLiveRegion="polite"
      backgroundColor={success ? 'successSoft' : kind === 'expired' ? 'destructiveSoft' : 'surfaceMuted'}
      borderRadius="lg"
      padding={6}
    >
      <Stack gap={4}>
        <Icon color={color} size={activeTheme.spacing[6]} strokeWidth={activeTheme.controlSizes.iconStroke} />
        <Heading ref={headingRef} tabIndex={-1}>{heading}</Heading>
        <Text>{body}</Text>
        {action}
      </Stack>
    </Box>
  );
};
