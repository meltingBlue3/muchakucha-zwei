import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { theme } from '../../../ui/theme';
import { seriesScopeModeFor } from '../series-scope-mode';
import { SeriesScopeContent, type SeriesScope, type SeriesScopeMode } from '../series-scope-sheet';

const FAILURE_MESSAGE = '没有完成。这个重复安排没有发生任何改变，请重试。';

function renderScope({ mode = 'edit', error = null, submitting = null, onSelect = jest.fn(), onClose = jest.fn() }: {
  mode?: SeriesScopeMode; error?: string | null; submitting?: SeriesScope | null; onSelect?: jest.Mock; onClose?: jest.Mock;
} = {}) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 800, width: 360, x: 0, y: 0 }, insets: { bottom: 0, left: 0, right: 0, top: 0 } }}>
      <MuchakuchaThemeProvider>
        <SeriesScopeContent mode={mode} error={error} submitting={submitting} onSelect={onSelect} onClose={onClose} />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('SeriesScopeContent', () => {
  test('choosing a scope writes nothing until the user confirms', async () => {
    const onSelect = jest.fn();
    const view = await renderScope({ onSelect });
    await fireEvent.press(view.getByRole('radio', { name: '此后所有' }));
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(onSelect).toHaveBeenCalledWith('this_and_following');
  });

  test('an edit starts on 仅此一次 and explains what 此后所有 covers', async () => {
    const onSelect = jest.fn();
    const view = await renderScope({ onSelect });
    expect(view.getByRole('radio', { name: '仅此一次' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByText('这一次和之后的重复，已经过去的不受影响。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(onSelect).toHaveBeenCalledWith('this_only');
  });

  test('deletion confirms with the destructive button', async () => {
    const view = await renderScope({ mode: 'delete' });
    expect(view.getByText('这是一个重复安排。选择要删除的范围，此操作不可撤销。')).toBeTruthy();
    const confirm = view.getByRole('button', { name: '删除' });
    expect(StyleSheet.flatten(confirm.props.style).backgroundColor).toBe(theme.colors.destructive);
  });

  test('a rule change keeps 仅此一次 visible but unavailable, says why, and starts on 此后所有', async () => {
    const onSelect = jest.fn();
    const view = await renderScope({ mode: 'rule-change', onSelect });
    const thisOnly = view.getByRole('radio', { name: '仅此一次' });
    expect(thisOnly.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('重复规则的改动只能应用到这一次和之后。')).toBeTruthy();
    await fireEvent.press(thisOnly);
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(onSelect).toHaveBeenCalledWith('this_and_following');
  });

  test('a failure is announced and the choice can be retried; nothing can be pressed while writing', async () => {
    const failed = await renderScope({ error: FAILURE_MESSAGE });
    expect(failed.getByText(FAILURE_MESSAGE)).toBeTruthy();
    const busy = await renderScope({ submitting: 'this_only' });
    for (const name of ['仅此一次', '此后所有']) {
      expect(busy.getAllByRole('radio', { name }).at(-1)!.props.accessibilityState.disabled).toBe(true);
    }
    expect(busy.getAllByRole('button', { name: '取消' }).at(-1)!.props.accessibilityState.disabled).toBe(true);
  });
});

describe('seriesScopeModeFor', () => {
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
});
