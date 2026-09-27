import { fireEvent, render } from '@testing-library/react-native';

import { Button, EmptyState, LoadError, LoadingState, MuchakuchaThemeProvider } from '../primitives';

const renderOwned = (node: React.ReactElement) => render(<MuchakuchaThemeProvider>{node}</MuchakuchaThemeProvider>);

test('a load error announces what failed and retries from the same place', async () => {
  const onRetry = jest.fn();
  const view = await renderOwned(<LoadError message="无法加载任务，请检查网络连接后重试。" onRetry={onRetry} retryAccessibilityLabel="重试加载任务" />);
  const message = view.getByText('无法加载任务，请检查网络连接后重试。');
  expect(message.parent?.parent?.parent?.props.accessibilityRole).toBe('alert');
  await fireEvent.press(view.getByRole('button', { name: '重试加载任务' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('a retry that is running or blocked cannot be pressed again', async () => {
  const onRetry = jest.fn();
  const view = await renderOwned(<LoadError message="暂时无法连接" onRetry={onRetry} retrying />);
  await fireEvent.press(view.getByRole('button', { name: '重试' }));
  const blocked = await renderOwned(<LoadError message="暂时无法连接" onRetry={onRetry} disabled />);
  await fireEvent.press(blocked.getByRole('button', { name: '重试' }));
  expect(onRetry).not.toHaveBeenCalled();
});

test('loading is announced as progress, never as an empty list', async () => {
  const view = await renderOwned(<LoadingState label="正在加载笔记" />);
  expect(view.getByLabelText('正在加载笔记').props.accessibilityRole).toBe('progressbar');
});

test('an empty state can offer the next step', async () => {
  const onPress = jest.fn();
  const view = await renderOwned(<EmptyState message="没有符合筛选条件的任务。" action={<Button label="清除筛选" tone="secondary" onPress={onPress} />} />);
  await fireEvent.press(view.getByRole('button', { name: '清除筛选' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
