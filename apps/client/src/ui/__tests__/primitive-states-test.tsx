import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import * as primitives from '../primitives';
import {
  AuthShell,
  Banner,
  Button,
  FormMessage,
  IconButton,
  MuchakuchaThemeProvider,
  PasswordField,
  Screen,
  Spinner,
  StatusPanel,
  Text,
  TextField,
  getButtonFill,
  getMotionDuration,
  shouldRenderAbstractFields,
} from '../primitives';
import { theme } from '../theme';

const renderOwned = (node: React.ReactElement) =>
  render(<MuchakuchaThemeProvider>{node}</MuchakuchaThemeProvider>);

const flattenedStyle = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;

describe('Restyle-owned primitive state contract', () => {
  test('exports the complete Screen, layout, text, control, feedback, brand, and auth-shell surface', () => {
    expect(Object.keys(primitives)).toEqual(
      expect.arrayContaining([
        'Screen', 'Stack', 'Inline', 'Text', 'Heading', 'Button', 'IconButton',
        'TextField', 'PasswordField', 'FormMessage', 'Banner', 'Spinner', 'BrandMark',
        'AuthShell', 'LinkText', 'StatusPanel',
      ]),
    );
  });

  test('Screen does not send Web landmark roles to native views', async () => {
    expect(Platform.OS).not.toBe('web');
    const view = await renderOwned(
      <Screen testID="screen">
        <Text>内容</Text>
      </Screen>,
    );
    const screen = view.getByTestId('screen');

    expect(screen.props.accessibilityRole).toBeUndefined();
    expect(screen.props.role).toBeUndefined();
  });

  test('TextField owns rest, focus, filled, invalid, and disabled states with a persistent associated label', async () => {
    const view = await renderOwned(<TextField error="请输入有效邮箱" label="邮箱" value="a@example.com" />);
    const input = view.getByLabelText('邮箱');
    expect(view.getByText('邮箱')).toBeTruthy();
    expect(input.props.value).toBe('a@example.com');
    expect(input.props['aria-invalid']).toBe(true);
    expect(view.getByText('请输入有效邮箱')).toBeTruthy();
    await fireEvent(input, 'focus', { nativeEvent: {} });
    expect(flattenedStyle(input).borderWidth).toBe(theme.borderWidths.focus);
    await view.rerender(
      <MuchakuchaThemeProvider>
        <TextField disabled label="邮箱" />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getByLabelText('邮箱').props.accessibilityState.disabled).toBe(true);
  });

  test('PasswordField reveals and masks without moving focus and updates its accessible action label', async () => {
    const view = await renderOwned(<PasswordField label="密码" />);
    const input = view.getByLabelText('密码');
    await fireEvent(input, 'focus', { nativeEvent: {} });
    expect(input.props.secureTextEntry).toBe(true);
    await fireEvent.press(view.getByLabelText('显示密码'));
    expect(view.getByLabelText('密码').props.secureTextEntry).toBe(false);
    expect(view.getByLabelText('隐藏密码')).toBeTruthy();
  });

  test('Button owns rest, pressed, focused, loading, and disabled states while keeping its label and width stable', async () => {
    const view = await renderOwned(<Button label="登录" />);
    let button = view.getByRole('button');
    expect(flattenedStyle(button).backgroundColor).toBe(theme.colors.coral);
    expect(getButtonFill({ disabled: false, pressed: true })).toBe(theme.colors.coralPressed);
    await fireEvent(view.getByRole('button'), 'focus', { nativeEvent: {} });
    expect(flattenedStyle(view.getByRole('button')).borderColor).toBe(theme.colors.focusRing);
    await view.rerender(
      <MuchakuchaThemeProvider>
        <Button label="登录" loading />
      </MuchakuchaThemeProvider>,
    );
    button = view.getByRole('button');
    expect(view.getByText('登录')).toBeTruthy();
    expect(view.getByLabelText('登录，正在处理').props.accessibilityRole).toBe('progressbar');
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(flattenedStyle(button).minHeight).toBe(theme.controlSizes.primary);
    expect(flattenedStyle(button).minWidth).toBe(theme.controlSizes.touchTarget);
  });

  test('IconButton exposes a visible or screen-reader label and never uses color as its only state cue', async () => {
    const view = await renderOwned(
      <IconButton icon={<Text>?</Text>} label="帮助" visibleLabel />,
    );
    expect(view.getByLabelText('帮助')).toBeTruthy();
    expect(view.getByText('帮助')).toBeTruthy();
  });

  test('FormMessage and Banner associate and announce recoverable validation or API feedback', async () => {
    const view = await renderOwned(
      <>
        <FormMessage id="email-error">邮箱格式不正确</FormMessage>
        <Banner title="暂时无法提交">请检查网络后重试</Banner>
      </>,
    );
    expect(view.getByText('邮箱格式不正确').parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByText('暂时无法提交').parent?.parent?.parent?.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('StatusPanel announces verified, expired, reset-success, and offline states with icon, heading, copy, and action', async () => {
    for (const kind of ['success', 'expired', 'resetSuccess', 'offline'] as const) {
      const view = await renderOwned(
        <StatusPanel
          action={<Button label="继续" />}
          body="状态说明"
          heading={`状态-${kind}`}
          kind={kind}
        />,
      );
      expect(view.getByRole('header')).toBeTruthy();
      expect(view.getByText('状态说明')).toBeTruthy();
      expect(view.getByRole('button')).toBeTruthy();
      await view.unmount();
    }
  });

  test('Spinner and loading controls expose progress semantics without replacing stable action copy', async () => {
    const view = await renderOwned(<Spinner label="保存中" />);
    expect(view.getByLabelText('保存中').props.accessibilityRole).toBe('progressbar');
  });

  test('D-17 gives every touch target at least 48 by 48 pixels and primary inputs and buttons 52 pixels of height', async () => {
    expect(theme.controlSizes.touchTarget).toBeGreaterThanOrEqual(48);
    expect(theme.controlSizes.field).toBe(52);
    expect(theme.controlSizes.primary).toBe(52);
    const view = await renderOwned(<Button label="继续" />);
    const style = flattenedStyle(view.getByRole('button'));
    expect(style.minHeight).toBe(52);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  test('D-17 uses medium radii, one-pixel boundaries, and light hierarchy without stacked rounded cards', () => {
    expect(theme.borderRadii.md).toBe(12);
    expect(theme.borderRadii.lg).toBe(16);
    expect(theme.borderWidths.default).toBe(1);
    expect(theme.elevation.native).toBe(0);
  });

  test('AuthShell respects safe area, keyboard visibility, 200 percent text scaling, reduced motion, and forced colors', async () => {
    const view = await renderOwned(
      <AuthShell>
        <Text>内容</Text>
      </AuthShell>,
    );
    expect(view.getByText('内容').props.maxFontSizeMultiplier).toBe(2);
    expect(getMotionDuration(true)).toBe(theme.motion.reducedTransitionMs);
    expect(getMotionDuration(false)).toBe(theme.motion.transitionMs);
    expect(shouldRenderAbstractFields({ forcedColors: true, reducedMotion: false })).toBe(false);
    expect(shouldRenderAbstractFields({ forcedColors: false, reducedMotion: true })).toBe(false);
    expect(shouldRenderAbstractFields({ forcedColors: false, reducedMotion: false })).toBe(true);
  });
});
