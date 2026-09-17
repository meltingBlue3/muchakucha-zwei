import { ThemeProvider, createBox, createText, useTheme } from '@shopify/restyle';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import House from 'lucide-react-native/icons/house';

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: activeTheme.layout.mobileInset,
            paddingVertical: activeTheme.spacing[6],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
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

export const Text = ({ variant = 'body', ...props }: OwnedTextProps) => (
  <RestyleText allowFontScaling maxFontSizeMultiplier={2} variant={variant} {...props} />
);

export const Heading = forwardRef<React.ElementRef<typeof RestyleText>, OwnedTextProps>(
  ({ variant = 'heading', ...props }, ref) => (
    <Text accessibilityRole="header" aria-level={1} ref={ref} variant={variant} {...props} />
  ),
);

Heading.displayName = 'Heading';

export const Spinner = ({ label = '正在处理', inverse = false }: { label?: string; inverse?: boolean }) => {
  const activeTheme = useTheme<Theme>();
  return (
    <ActivityIndicator
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      color={inverse ? activeTheme.colors.surface : activeTheme.colors.coral}
      size="small"
    />
  );
};

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  tone?: 'primary' | 'secondary';
};

export const getButtonFill = (state: { disabled: boolean; pressed: boolean }): string =>
  state.disabled
    ? theme.colors.disabled
    : state.pressed
      ? theme.colors.coralPressed
      : theme.colors.coral;

export const Button = ({ disabled, label, loading = false, tone = 'primary', style, ...props }: ButtonProps) => {
  const activeTheme = useTheme<Theme>();
  const unavailable = disabled || loading;
  const [focused, setFocused] = useState(false);
  const { onBlur, onFocus, ...pressableProps } = props;
  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={pressableProps.accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
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
            : getButtonFill({ disabled: unavailable, pressed: state.pressed }),
          borderColor: focused ? activeTheme.colors.focusRing : activeTheme.colors.transparent,
          borderRadius: activeTheme.borderRadii.lg,
          borderWidth: activeTheme.borderWidths.focus,
          flexDirection: 'row',
          gap: activeTheme.spacing[2],
          justifyContent: 'center',
          minHeight: activeTheme.controlSizes.primary,
          minWidth: activeTheme.controlSizes.touchTarget,
          paddingHorizontal: activeTheme.spacing[4],
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? <Spinner inverse label={`${label}，正在处理`} /> : null}
      <Text variant="button" color={unavailable ? 'ink' : tone === 'secondary' ? 'link' : 'surface'}>{label}</Text>
    </Pressable>
  );
};

export function FormActions({ onCancel, onSubmit, submitting, submitLabel }: {
  onCancel(): void;
  onSubmit(): void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <Inline gap={3} style={{ marginTop: theme.spacing[4] }}>
      <Button label="取消" tone="secondary" disabled={submitting} onPress={onCancel} style={{ flex: 1 }} />
      <Button label={submitLabel} loading={submitting} onPress={onSubmit} style={{ flex: 2 }} />
    </Inline>
  );
}

type IconButtonProps = Omit<PressableProps, 'children'> & {
  icon: ReactElement;
  label: string;
  visibleLabel?: boolean;
};

export const IconButton = ({ icon, label, style, visibleLabel = false, ...props }: IconButtonProps) => {
  const activeTheme = useTheme<Theme>();
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={(state) => [
        {
          alignItems: 'center',
          backgroundColor: state.pressed ? activeTheme.colors.coralSoft : activeTheme.colors.surface,
          borderColor: state.pressed ? activeTheme.colors.coral : activeTheme.colors.separator,
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

// Tracks whether the latest web interaction was a Tab key press rather than a pointer or other key.
const webFocusIntent = { tabbing: false };
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => { webFocusIntent.tabbing = event.key === 'Tab'; }, true);
  document.addEventListener('pointerdown', () => { webFocusIntent.tabbing = false; }, true);
}

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
    useEffect(() => {
      if (!error || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      // Blur validation must not pull focus back while the user tabs through the form;
      // only errors raised by a submit (click or Enter) move focus to the invalid field.
      if (webFocusIntent.tabbing) return undefined;
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
                  ? activeTheme.colors.coral
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

type BannerProps = PropsWithChildren<{ title?: string }>;

export const Banner = ({ children, title }: BannerProps) => (
  <Box
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    backgroundColor="destructiveSoft"
    borderColor="destructive"
    borderRadius="md"
    borderWidth={theme.borderWidths.default}
    padding={4}
  >
    <Inline gap={2}>
      <CircleAlert color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
      <Stack gap={1} style={{ flex: 1 }}>
        {title ? <Text variant="label">{title}</Text> : null}
        <Text variant="bodySm">{children}</Text>
      </Stack>
    </Inline>
  </Box>
);

export const BrandMark = () => (
  <Inline accessibilityLabel="Muchakucha Zwei" gap={2}>
    <Box
      accessibilityElementsHidden
      backgroundColor="coral"
      borderRadius="md"
      height={theme.spacing[8]}
      importantForAccessibility="no-hide-descendants"
      width={theme.spacing[8]}
      alignItems="center"
      justifyContent="center"
    ><House color={theme.colors.surface} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} /></Box>
    <Text variant="body" style={{ fontWeight: '600', flexShrink: 1 }}>Muchakucha Zwei</Text>
  </Inline>
);

export const getMotionDuration = (reducedMotion: boolean): number =>
  reducedMotion ? theme.motion.reducedTransitionMs : theme.motion.transitionMs;

export const shouldRenderAbstractFields = (preferences: {
  forcedColors: boolean;
  reducedMotion: boolean;
}): boolean => !preferences.forcedColors && !preferences.reducedMotion;

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
      {shouldRenderAbstractFields(preferences) ? (
        <Box
          accessibilityElementsHidden
          backgroundColor="coralSoft"
          borderRadius="full"
          height={theme.spacing[16]}
          importantForAccessibility="no-hide-descendants"
          position="absolute"
          right={theme.spacing[6]}
          testID="auth-decoration"
          top={theme.spacing[6]}
          width={theme.spacing[16]}
        />
      ) : null}
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
      <Text color="link" variant="label">
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
  const color = success ? activeTheme.colors.teal : kind === 'expired' ? activeTheme.colors.destructive : activeTheme.colors.ink;
  useEffect(() => {
    (headingRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);
  return (
    <Box
      accessibilityLiveRegion="polite"
      backgroundColor={success ? 'tealSoft' : kind === 'expired' ? 'destructiveSoft' : 'surfaceMuted'}
      borderColor={success ? 'teal' : kind === 'expired' ? 'destructive' : 'border'}
      borderRadius="lg"
      borderWidth={activeTheme.borderWidths.default}
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
