import { ThemeProvider, createBox, createText, useTheme } from '@shopify/restyle';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import React, { forwardRef, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  TextInput as NativeTextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Info from 'lucide-react-native/icons/info';

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
  variant?: TextVariant;
};

export const Text = ({ variant = 'body', ...props }: OwnedTextProps) => (
  <RestyleText allowFontScaling maxFontSizeMultiplier={2} variant={variant} {...props} />
);

export const Heading = ({ variant = 'heading', ...props }: OwnedTextProps) => (
  <Text accessibilityRole="header" variant={variant} {...props} />
);

export const Spinner = ({ label = '正在处理' }: { label?: string }) => {
  const activeTheme = useTheme<Theme>();
  return (
    <ActivityIndicator
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      color={activeTheme.colors.surface}
      size="small"
    />
  );
};

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
};

export const getButtonFill = (state: { disabled: boolean; pressed: boolean }): string =>
  state.disabled
    ? theme.colors.disabled
    : state.pressed
      ? theme.colors.coralPressed
      : theme.colors.coral;

export const Button = ({ disabled, label, loading = false, style, ...props }: ButtonProps) => {
  const activeTheme = useTheme<Theme>();
  const unavailable = disabled || loading;
  const [focused, setFocused] = useState(false);
  const { onBlur, onFocus, ...pressableProps } = props;
  return (
    <Pressable
      {...pressableProps}
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
          backgroundColor: getButtonFill({ disabled: unavailable, pressed: state.pressed }),
          borderColor: focused ? activeTheme.colors.focusRing : activeTheme.colors.transparent,
          borderRadius: activeTheme.borderRadii.lg,
          borderWidth: focused ? activeTheme.borderWidths.focus : activeTheme.spacing[0],
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
      {loading ? <Spinner label={`${label}，正在处理`} /> : null}
      <Text variant="button">{label}</Text>
    </Pressable>
  );
};

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
          borderColor: state.pressed ? activeTheme.colors.coral : activeTheme.colors.border,
          borderRadius: activeTheme.borderRadii.md,
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
};

export const TextField = forwardRef<NativeTextInput, FieldProps>(
  ({ disabled, error, label, nativeID, onBlur, onFocus, style, ...props }, ref) => {
    const activeTheme = useTheme<Theme>();
    const generatedId = useId();
    const inputId = nativeID ?? `field-${generatedId}`;
    const errorId = `${inputId}-error`;
    const [focused, setFocused] = useState(false);
    return (
      <Stack gap={2}>
        <Text nativeID={`${inputId}-label`} variant="label">
          {label}
        </Text>
        <NativeTextInput
          {...props}
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          aria-describedby={error ? errorId : undefined}
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
            },
            style,
          ]}
        />
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
  const actionLabel = revealed ? '隐藏密码' : '显示密码';
  return (
    <Stack gap={2}>
      <TextField {...props} ref={setRefs} secureTextEntry={!revealed} />
      <Box alignSelf="flex-end">
        <IconButton
          icon={
            revealed ? (
              <EyeOff
                color={activeTheme.colors.ink}
                size={activeTheme.controlSizes.icon}
                strokeWidth={activeTheme.controlSizes.iconStroke}
              />
            ) : (
              <Eye
                color={activeTheme.colors.ink}
                size={activeTheme.controlSizes.icon}
                strokeWidth={activeTheme.controlSizes.iconStroke}
              />
            )
          }
          label={actionLabel}
          onPress={() => {
            setRevealed((current) => !current);
            internalRef.current?.focus();
          }}
        />
      </Box>
    </Stack>
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
      <Stack gap={1}>
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
    />
    <Text variant="heading">Muchakucha Zwei</Text>
  </Inline>
);

export const AuthShell = ({ children }: PropsWithChildren) => (
  <Screen>
    <Box alignSelf="center" maxWidth={theme.layout.authCardMaxWidth} width="100%">
      <Stack gap={8}>
        <BrandMark />
        {children}
      </Stack>
    </Box>
  </Screen>
);

export const getMotionDuration = (reducedMotion: boolean): number =>
  reducedMotion ? theme.motion.reducedTransitionMs : theme.motion.transitionMs;

export const shouldRenderAbstractFields = (preferences: {
  forcedColors: boolean;
  reducedMotion: boolean;
}): boolean => !preferences.forcedColors && !preferences.reducedMotion;

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
      <Text color="coral" variant="label">
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
  const success = kind === 'success' || kind === 'resetSuccess';
  const Icon = success ? CircleCheck : kind === 'offline' ? Info : CircleAlert;
  const color = success ? activeTheme.colors.teal : kind === 'expired' ? activeTheme.colors.destructive : activeTheme.colors.ink;
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
        <Heading>{heading}</Heading>
        <Text>{body}</Text>
        {action}
      </Stack>
    </Box>
  );
};
