import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { BirthdayForm } from '../birthday-form';

jest.mock('../../reminders/reminder-settings', () => ({
  useReminderSettings: () => ({
    settings: { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, households: [] },
    status: 'ready', reload: jest.fn(), save: jest.fn(),
  }),
}));
jest.mock('../../recurrence/recurrence-options', () => ({
  ...jest.requireActual('../../recurrence/recurrence-options'),
  deviceTimeZone: () => 'Asia/Shanghai',
}));

async function renderForm() {
  const onSubmit = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <BirthdayForm draftKey="draft:h:birthdays:new:form" people={['我', '妈妈']} todayIso="2026-11-11" submitting={false} onSubmit={onSubmit} onCancel={jest.fn()} />
    </MuchakuchaThemeProvider>,
  );
  return { onSubmit, view };
}

describe('添加生日', () => {
  test('a family member, a lunar date and a year give both birthdays at once', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.press(view.getByRole('radio', { name: '妈妈' }));
    expect(view.getByRole('radio', { name: '按农历过生日' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月十五' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    expect(view.getByRole('button', { name: '生日日期，农历十月十五' })).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('出生年份'), '1968');
    expect(view.getByText('公历 1968年12月4日')).toBeTruthy();
    await fireEvent(view.getByLabelText('也过公历生日'), 'valueChange', true);
    expect(view.getByText('农历十月十五：11月23日周一 · 58 岁')).toBeTruthy();
    expect(view.getByText('公历生日：12月4日周五 · 58 岁')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const events = onSubmit.mock.calls[0][0] as Array<{ title: string; recurrence: Record<string, unknown> }>;
    expect(events.map(event => [event.title, event.recurrence.startsOn, event.recurrence.lunar, event.recurrence.birthYear])).toEqual([
      ['妈妈的农历生日', '2026-11-23', { month: 10, day: 15 }, 1968],
      ['妈妈的生日', '2026-12-04', undefined, 1968],
    ]);
  });

  test('says what is missing instead of saving', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.press(view.getByLabelText('保存'));
    expect(view.getByText('请填写是谁的生日。')).toBeTruthy();
    expect(view.getByText('请选择生日的日期。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('switching to 公历 asks for the date again in Gregorian months', async () => {
    const { view } = await renderForm();
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    expect(view.getByRole('button', { name: '生日日期，农历正月初一' })).toBeTruthy();
    await fireEvent.press(view.getByRole('radio', { name: '按公历过生日' }));
    expect(view.getByRole('button', { name: '生日日期，选择日期' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('radio', { name: '2月' }));
    expect(view.getByRole('radio', { name: '2月 29日' })).toBeTruthy();
    expect(view.queryByRole('radio', { name: '2月 30日' })).toBeNull();
  });
});
