import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ConfirmActions, MuchakuchaThemeProvider, getButtonFill } from '../primitives';
import { theme } from '../theme';

const fill = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style) as { backgroundColor?: string }).backgroundColor;

test('offers the safe choice before the committing one', async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <ConfirmActions cancelLabel="保留邀请" confirmLabel="撤销邀请" onCancel={onCancel} onConfirm={onConfirm} />
    </MuchakuchaThemeProvider>,
  );
  expect(view.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['保留邀请', '撤销邀请']);
  await fireEvent.press(view.getByRole('button', { name: '保留邀请' }));
  await fireEvent.press(view.getByRole('button', { name: '撤销邀请' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('a destructive confirmation is filled with the destructive color, not the brand color', async () => {
  const view = await render(
    <MuchakuchaThemeProvider>
      <ConfirmActions confirmLabel="确认删除笔记" destructive onCancel={jest.fn()} onConfirm={jest.fn()} />
    </MuchakuchaThemeProvider>,
  );
  expect(fill(view.getByRole('button', { name: '确认删除笔记' }))).toBe(theme.colors.destructive);
  expect(getButtonFill({ disabled: false, pressed: true }, 'destructive')).toBe(theme.colors.destructivePressed);
});

test('while the confirmation runs, neither answer can be pressed again', async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <ConfirmActions confirmLabel="确认离开家庭" destructive busy onCancel={onCancel} onConfirm={onConfirm} />
    </MuchakuchaThemeProvider>,
  );
  expect(view.getByRole('button', { name: '取消' }).props.accessibilityState.disabled).toBe(true);
  expect(view.getByRole('button', { name: '确认离开家庭' }).props.accessibilityState).toEqual({ busy: true, disabled: true });
  await fireEvent.press(view.getByRole('button', { name: '确认离开家庭' }));
  expect(onConfirm).not.toHaveBeenCalled();
});
