import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as NativeText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { theme } from '../../../ui/theme';
import {
  SeriesScopeSheet,
  type SeriesScope,
  type SeriesScopeMode,
} from '../series-scope-sheet';

const FAILURE_MESSAGE =
  '没有完成。这个重复安排没有发生任何改变，请重试。';

interface HarnessProps {
  error?: string | null;
  mode?: SeriesScopeMode;
  submitting?: SeriesScope | null;
  visible?: boolean;
  write?: jest.Mock;
}

function Harness({
  error = null,
  mode = 'edit',
  submitting = null,
  visible = false,
  write = jest.fn(),
}: HarnessProps) {
  const [open, setOpen] = useState(visible);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 800, width: 360, x: 0, y: 0 },
        insets: { bottom: 16, left: 0, right: 0, top: 0 },
      }}
    >
      <MuchakuchaThemeProvider>
        <Pressable accessibilityLabel="保存改动" onPress={() => setOpen(true)}>
          <NativeText>保存改动</NativeText>
        </Pressable>
        <SeriesScopeSheet
          error={error}
          mode={mode}
          onClose={() => setOpen(false)}
          onSelect={(scope) => write(scope)}
          submitting={submitting}
          visible={open}
        />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>
  );
}

describe('SeriesScopeSheet', () => {
  test('does not issue a write until the user chooses an explicit scope', async () => {
    const write = jest.fn();
    const view = await render(<Harness write={write} />);

    await fireEvent.press(view.getByLabelText('保存改动'));
    expect(write).toHaveBeenCalledTimes(0);

    await fireEvent.press(view.getByLabelText('仅此一次'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('this_only');
  });

  test('offers exactly two scope actions plus cancel and explains the boundary', async () => {
    const view = await render(<Harness visible />);

    expect(view.getAllByLabelText('仅此一次')).toHaveLength(1);
    expect(view.getAllByLabelText('此后所有')).toHaveLength(1);
    expect(view.getAllByLabelText('取消')).toHaveLength(1);
    expect(view.queryByText('整个系列')).toBeNull();
    expect(
      view.getByText(
        '「此后所有」只影响这一次和之后的重复，已经过去的不受影响。',
      ),
    ).toBeTruthy();
  });

  test('renders edit copy and a single coral primary scope', async () => {
    const view = await render(<Harness mode="edit" visible />);

    expect(view.getByText('保存这次改动？')).toBeTruthy();
    expect(
      view.getByText('这是一个重复安排。选择这次改动的影响范围。'),
    ).toBeTruthy();
    expect(StyleSheet.flatten(view.getByLabelText('仅此一次').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: theme.colors.coral }),
    );
  });

  test('renders delete copy, destructive treatments, and cancel last in DOM order', async () => {
    const view = await render(<Harness mode="delete" visible />);

    expect(view.getByText('删除这次重复？')).toBeTruthy();
    expect(view.getByText(/此操作不可撤销/)).toBeTruthy();
    expect(StyleSheet.flatten(view.getByLabelText('仅此一次').props.style)).toEqual(
      expect.objectContaining({ borderColor: theme.colors.destructive }),
    );
    expect(StyleSheet.flatten(view.getByLabelText('此后所有').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: theme.colors.destructive }),
    );

    const labels = view
      .getAllByRole('button')
      .map((node) => node.props.accessibilityLabel)
      .filter((label) => ['仅此一次', '此后所有', '取消'].includes(label));
    expect(labels).toEqual(['仅此一次', '此后所有', '取消']);
  });

  test('disables this-only for rule changes and explains why', async () => {
    const view = await render(<Harness mode="rule-change" visible />);

    expect(view.getByText('更改重复规则？')).toBeTruthy();
    expect(view.getByLabelText('仅此一次').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(
      view.getByText('重复规则的改动只能应用到这一次和之后。'),
    ).toBeTruthy();
    expect(view.getByLabelText('此后所有').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  test.each<SeriesScope>(['this_only', 'this_and_following'])(
    'keeps the sheet open and disables every action while submitting %s',
    async (scope) => {
      const view = await render(<Harness submitting={scope} visible />);

      for (const label of ['仅此一次', '此后所有', '取消']) {
        expect(view.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
      }
      expect(view.getByLabelText('正在处理')).toBeTruthy();
      expect(view.getByText('保存这次改动？')).toBeTruthy();
    },
  );

  test('keeps the sheet open after failure, announces atomic failure, and re-enables actions', async () => {
    const view = await render(<Harness error={FAILURE_MESSAGE} visible />);

    expect(view.getByText(FAILURE_MESSAGE)).toBeTruthy();
    for (const label of ['仅此一次', '此后所有', '取消']) {
      expect(view.getByLabelText(label).props.accessibilityState.disabled).toBe(false);
    }
  });

  test('unmounts the modal subtree when closed', async () => {
    const view = await render(<Harness />);

    expect(view.queryByText('保存这次改动？')).toBeNull();
    expect(view.queryByText('仅此一次')).toBeNull();
  });

  test('keeps every action at the primary control height', async () => {
    const view = await render(<Harness visible />);

    for (const label of ['仅此一次', '此后所有', '取消']) {
      expect(StyleSheet.flatten(view.getByLabelText(label).props.style).minHeight).toBeGreaterThanOrEqual(
        theme.controlSizes.primary,
      );
    }
  });
});
