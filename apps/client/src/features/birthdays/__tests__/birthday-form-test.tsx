import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { LabelListItemDto } from '@muchakucha/api-client';

import { setLanguageChoice } from '../../../i18n';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { createWorkspaceState, WorkspaceStateProvider } from '../../../ui/workspace-state';
import { sessionApiClient } from '../../auth/session-runtime';
import { BirthdayForm } from '../birthday-form';

jest.mock('../../auth/session-runtime', () => ({
  sessionTransport: { getAccessToken: jest.fn(async () => 'token') },
  sessionApiClient: { listLabels: jest.fn(), createLabel: jest.fn() },
}));
jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({ households: [{ id: 'h', name: '家', role: 'MEMBER' }] }),
}));

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

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));

afterEach(async () => {
  jest.mocked(sessionApiClient.listLabels).mockReset();
  await act(async () => { setLanguageChoice('system'); });
});

const starterLabels: LabelListItemDto[] = [
  { id: 'label-bday', householdId: 'h', name: '生日', color: '#AD4067', systemKey: 'birthday', localizedNames: { zh: '生日', ja: '誕生日' }, createdBy: 'owner', createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 0, tasks: 0 } },
  { id: 'label-chores', householdId: 'h', name: '家务', color: '#2C716C', systemKey: 'chores', localizedNames: { zh: '家务', ja: '家事' }, createdBy: 'owner', createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 0, tasks: 0 } },
];

beforeEach(() => {
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [], total: 0 });
});

async function renderForm() {
  const store = createWorkspaceState();
  const onSubmit = jest.fn();
  const view = await render(
    <WorkspaceStateProvider store={store}>
      <MuchakuchaThemeProvider>
        <BirthdayForm draftKey="draft:h:birthdays:new:form" householdId="h" people={['我', '妈妈']} todayIso="2026-11-11" submitting={false} onSubmit={onSubmit} onCancel={jest.fn()} />
      </MuchakuchaThemeProvider>
    </WorkspaceStateProvider>,
  );
  return { store, onSubmit, view };
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
    await fireEvent.changeText(view.getByLabelText('出生年份'), '1899');
    await fireEvent.press(view.getByLabelText('保存'));
    expect(view.getByText('出生年份需要在 1900 到今年之间。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a Japanese interface asks in Japanese, counts lunar days its own way and saves a Japanese title', async () => {
    const { onSubmit, view } = await renderForm();
    await fireEvent.press(view.getByLabelText('保存'));
    expect(view.getByText('请填写是谁的生日。')).toBeTruthy();
    await act(async () => { setLanguageChoice('ja'); });
    // What was already on the page follows the language.
    expect(view.getByText('誰の誕生日かを入力してください。')).toBeTruthy();
    expect(view.queryByText('请填写是谁的生日。')).toBeNull();

    await fireEvent.changeText(view.getByLabelText('誰の誕生日'), 'お母さん');
    expect(view.getByRole('radio', { name: '旧暦で祝う' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '誕生日の日付、日付を選択' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月十五日' }));
    await fireEvent.press(view.getByRole('button', { name: '完了' }));
    await fireEvent.changeText(view.getByLabelText('生まれた年'), '1968');
    expect(view.getByText('新暦 1968年12月4日')).toBeTruthy();
    await fireEvent(view.getByLabelText('新暦の誕生日も祝う'), 'valueChange', true);
    expect(view.getByText('旧暦十月十五日：11月23日(月) · 58歳')).toBeTruthy();
    expect(view.getByText('新暦の誕生日：12月4日(金) · 58歳')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const events = onSubmit.mock.calls[0][0] as Array<{ title: string }>;
    expect(events.map(event => event.title)).toEqual(['お母さんの旧暦の誕生日', 'お母さんの誕生日']);
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

  test('preselects the household birthday label without dirtying the draft and forwards chosen labels on save', async () => {
    jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: starterLabels, total: 2 });
    const { store, onSubmit, view } = await renderForm();

    await view.findByLabelText('取消选择标签 生日');
    expect(view.getByLabelText('选择标签 家务')).toBeTruthy();
    expect(store.hasDrafts('draft:h:birthdays:new:')).toBe(false);

    await fireEvent.press(view.getByRole('radio', { name: '妈妈' }));
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月' }));
    await fireEvent.press(view.getByRole('radio', { name: '十月十五' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    await fireEvent.changeText(view.getByLabelText('出生年份'), '1968');
    await fireEvent(view.getByLabelText('也过公历生日'), 'valueChange', true);

    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const events = onSubmit.mock.calls[0][0] as Array<{ labelIds?: string[] }>;
    expect(events.map(event => event.labelIds)).toEqual([['label-bday'], ['label-bday']]);
  });

  test('starter labels read in the interface language and the birthday one is still chosen', async () => {
    jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: starterLabels, total: 2 });
    await act(async () => { setLanguageChoice('ja'); });
    const { view } = await renderForm();

    expect(await view.findByLabelText('ラベル「誕生日」の選択を解除')).toBeTruthy();
    expect(view.getByLabelText('ラベル「家事」を選択')).toBeTruthy();
    expect(view.queryByText('生日')).toBeNull();
  });

  test('lets the user clear or add labels before saving', async () => {
    jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: starterLabels, total: 2 });
    const { store, onSubmit, view } = await renderForm();

    await view.findByLabelText('取消选择标签 生日');
    await fireEvent.press(view.getByRole('radio', { name: '妈妈' }));
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));

    await fireEvent.press(view.getByLabelText('取消选择标签 生日'));
    expect(store.hasDrafts('draft:h:birthdays:new:')).toBe(true);
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as Array<{ labelIds?: string[] }>)[0]?.labelIds).toEqual([]);

    await fireEvent.press(view.getByLabelText('选择标签 家务'));
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect((onSubmit.mock.calls[1][0] as Array<{ labelIds?: string[] }>)[0]?.labelIds).toEqual(['label-chores']);
  });

  test('omits labelIds when household labels fail to load so the server still tags birthdays', async () => {
    jest.mocked(sessionApiClient.listLabels).mockRejectedValue(new Error('offline'));
    const { onSubmit, view } = await renderForm();

    await view.findByText('标签没有加载成功。');
    await fireEvent.press(view.getByRole('radio', { name: '妈妈' }));
    await fireEvent.press(view.getByRole('button', { name: '生日日期，选择日期' }));
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    await fireEvent.press(view.getByLabelText('保存'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const events = onSubmit.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect('labelIds' in events[0]!).toBe(false);
  });
});
