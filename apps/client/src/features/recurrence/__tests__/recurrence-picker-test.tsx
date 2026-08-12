import type { RecurrenceDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { RecurrencePicker } from '../recurrence-picker';

jest.mock('../../../ui/date-field', () => ({
  DateField: ({ accessibilityLabel, onChange, value }: { accessibilityLabel?: string; onChange(value: string): void; value: string }) => {
    const { TextInput } = require('react-native') as typeof import('react-native');
    return <TextInput accessibilityLabel={accessibilityLabel} onChangeText={onChange} value={value} />;
  },
}));

interface HarnessProps {
  disabled?: boolean;
  initial?: RecurrenceDto | null;
  onChangeSpy?: jest.Mock;
  onValidityChange?: jest.Mock;
  startDate?: string;
}

function Harness({
  disabled = false,
  initial = null,
  onChangeSpy,
  onValidityChange,
  startDate = '2026-08-12',
}: HarnessProps) {
  const [value, setValue] = useState<RecurrenceDto | null>(initial);
  return (
    <MuchakuchaThemeProvider>
      <RecurrencePicker
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChangeSpy?.(next);
        }}
        onValidityChange={onValidityChange}
        startDate={startDate}
        value={value}
      />
    </MuchakuchaThemeProvider>
  );
}

describe('RecurrencePicker', () => {
  test('defaults to no recurrence and keeps all dependent controls unmounted', async () => {
    const view = await render(<Harness />);
    expect(view.getByLabelText('不重复').props.accessibilityState.checked).toBe(true);
    expect(view.queryByLabelText('星期三')).toBeNull();
    expect(view.queryByLabelText('重复结束条件')).toBeNull();
    expect(view.queryByText('结束')).toBeNull();
  });

  test('uses radio groups for frequency and ending, with checkbox weekdays', async () => {
    const view = await render(<Harness />);
    expect(view.getByLabelText('重复频率').props.accessibilityRole).toBe('radiogroup');
    expect(view.getAllByRole('radio')).toHaveLength(5);

    await fireEvent.press(view.getByLabelText('每周'));
    expect(view.getByLabelText('重复结束条件').props.accessibilityRole).toBe('radiogroup');
    expect(view.getAllByRole('radio')).toHaveLength(8);
    expect(view.getAllByRole('checkbox')).toHaveLength(7);
  });

  test('selects the start-date weekday when weekly is chosen', async () => {
    const view = await render(<Harness startDate="2026-08-12" />);
    await fireEvent.press(view.getByLabelText('每周'));

    expect(view.getByLabelText('星期三').props.accessibilityState.checked).toBe(true);
    expect(
      view.getAllByRole('checkbox').filter((chip) => chip.props.accessibilityState.checked),
    ).toHaveLength(1);
  });

  test('keeps the last weekday selected and announces the constraint', async () => {
    const view = await render(<Harness />);
    await fireEvent.press(view.getByLabelText('每周'));
    await fireEvent.press(view.getByLabelText('星期三'));

    expect(view.getByLabelText('星期三').props.accessibilityState.checked).toBe(true);
    const announcement = view.getByText('至少需要选择一天。');
    expect(announcement.parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('clears the other ending value whenever the ending mode changes', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness onChangeSpy={onChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('截止日期'));
    await fireEvent.changeText(view.getByLabelText('截止日期'), '2027-08-12');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ endsOn: '2027-08-12' }));

    await fireEvent.press(view.getByLabelText('重复次数'));
    expect(view.queryByLabelText('截止日期')).toBeNull();
    expect(view.getByLabelText('重复次数').props.value).toBe('10');
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ endsOn: expect.anything() }));

    await fireEvent.press(view.getByLabelText('截止日期'));
    expect(view.queryByLabelText('重复次数')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ count: expect.anything() }));
  });

  test.each(['0', '1001'])('rejects an out-of-range count of %s', async (count) => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('重复次数'));
    await fireEvent.changeText(view.getByLabelText('重复次数'), count);

    expect(view.getByText('重复次数需要在 1 到 1000 之间。')).toBeTruthy();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  test('requires a cutoff date and requires it to be after the start date', async () => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('截止日期'));
    expect(view.getByText('请选择重复的截止日期。')).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('截止日期'), '2026-08-11');
    expect(view.getByText('截止日期必须晚于开始日期。')).toBeTruthy();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  test('returns null and unmounts dependent controls when recurrence is turned off', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness onChangeSpy={onChange} />);
    await fireEvent.press(view.getByLabelText('每周'));
    await fireEvent.press(view.getByLabelText('不重复'));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(view.queryByLabelText('星期三')).toBeNull();
    expect(view.queryByText('结束')).toBeNull();
  });

  test('disables every mounted control without losing the selected values', async () => {
    const initial: RecurrenceDto = {
      freq: 'weekly',
      interval: 1,
      byWeekday: [2, 4],
      startsOn: '2026-08-12',
      count: 10,
      timezone: 'Asia/Shanghai',
    };
    const view = await render(<Harness disabled initial={initial} />);

    for (const control of [...view.getAllByRole('radio'), ...view.getAllByRole('checkbox')]) {
      expect(control.props.accessibilityState.disabled).toBe(true);
    }
    expect(view.getByLabelText('重复次数').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('重复次数').props.value).toBe('10');
  });

  test('never renders interval controls or recurrence implementation vocabulary', async () => {
    const view = await render(<Harness />);
    await fireEvent.press(view.getByLabelText('每周'));
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toMatch(/每 N 个|RRULE|FREQ|BYDAY|interval|occurrenceDate/);
  });

  test('reports valid state again after fixing a field', async () => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('重复次数'));
    await fireEvent.changeText(view.getByLabelText('重复次数'), '0');
    await fireEvent.changeText(view.getByLabelText('重复次数'), '12');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });
});
