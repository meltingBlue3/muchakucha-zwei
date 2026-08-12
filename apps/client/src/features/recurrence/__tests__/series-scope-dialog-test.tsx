import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as NativeText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { theme } from '../../../ui/theme';
import { seriesScopeModeFor } from '../series-scope-mode';
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

  test('classifies an unchanged rule on a mid-series occurrence as a plain edit', () => {
    // The rule starts on 2026-08-12; the picker anchors the form value's
    // startsOn to the occurrence being edited (2026-08-16). Nothing about the
    // rule changed, so 仅此一次 must stay reachable.
    const rule = {
      id: 'rule-1',
      freq: 'daily',
      interval: 1,
      byWeekday: [],
      startsOn: '2026-08-12',
      endsOn: null,
      count: null,
      timezone: 'Asia/Shanghai',
      materializedThrough: '2026-11-10',
      startTimeLocal: '08:30',
      durationMinutes: 60,
    };

    expect(seriesScopeModeFor(rule, {
      freq: 'daily',
      interval: 1,
      byWeekday: [],
      startsOn: '2026-08-16',
      timezone: 'Asia/Shanghai',
      startTimeLocal: '08:30',
      durationMinutes: 60,
    })).toBe('edit');
  });

  test('classifies a weekly rule whose first occurrence trails startsOn as a plain edit', () => {
    const rule = {
      id: 'rule-2',
      freq: 'weekly',
      interval: 1,
      byWeekday: [2, 4],
      startsOn: '2026-08-12',
      endsOn: null,
      count: 6,
      timezone: 'Asia/Shanghai',
      materializedThrough: '2026-11-10',
      startTimeLocal: null,
      durationMinutes: null,
    };

    expect(seriesScopeModeFor(rule, {
      freq: 'weekly',
      byWeekday: [4, 2],
      startsOn: '2026-08-13',
      count: 6,
      timezone: 'Asia/Shanghai',
    })).toBe('edit');
  });

  test('still reports a rule change when the recurrence itself differs', () => {
    const rule = {
      id: 'rule-3',
      freq: 'daily',
      interval: 1,
      byWeekday: [],
      startsOn: '2026-08-12',
      endsOn: null,
      count: null,
      timezone: 'Asia/Shanghai',
      materializedThrough: null,
      startTimeLocal: null,
      durationMinutes: null,
    };

    expect(seriesScopeModeFor(rule, {
      freq: 'weekly',
      byWeekday: [1],
      startsOn: '2026-08-16',
      timezone: 'Asia/Shanghai',
    })).toBe('rule-change');
    expect(seriesScopeModeFor(rule, {
      freq: 'daily',
      interval: 2,
      startsOn: '2026-08-16',
      timezone: 'Asia/Shanghai',
    })).toBe('rule-change');
    expect(seriesScopeModeFor(rule, {
      freq: 'daily',
      startsOn: '2026-08-16',
      count: 10,
      timezone: 'Asia/Shanghai',
    })).toBe('rule-change');
    expect(seriesScopeModeFor(rule, undefined)).toBe('rule-change');
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
