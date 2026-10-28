import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import * as device from '../../../platform/reminders/reminder-notifications';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { NotificationPermissionNotice, useNotificationPermission } from '../notification-permission';
import { requestReminderSync } from '../reminder-sync';

jest.mock('../reminder-sync', () => ({ requestReminderSync: jest.fn() }));

test('a failed native permission setup is shown to the person and can be retried', async () => {
  jest.spyOn(device, 'notificationPermission').mockResolvedValue('undetermined');
  const request = jest.spyOn(device, 'requestNotificationPermission')
    .mockRejectedValueOnce(new Error('NotificationsChannelsProvider is null'))
    .mockResolvedValueOnce('granted');
  const { result } = await renderHook(() => useNotificationPermission());
  await waitFor(() => expect(result.current.permission).toBe('undetermined'));
  await act(async () => { await expect(result.current.enable()).resolves.toBeUndefined(); });
  expect(result.current).toMatchObject({ permission: 'undetermined', error: '无法开启通知，请更新安装包后重试。' });
  expect(requestReminderSync).not.toHaveBeenCalled();
  await act(async () => { await result.current.enable(); });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current).toMatchObject({ permission: 'granted', error: null });
  expect(requestReminderSync).toHaveBeenCalledWith(0);
});

test('a failure to open system settings is handled without an unhandled rejection', async () => {
  jest.spyOn(device, 'notificationPermission').mockResolvedValue('blocked');
  jest.spyOn(device, 'openNotificationSettings').mockRejectedValue(new Error('No activity available'));
  const { result } = await renderHook(() => useNotificationPermission());
  await waitFor(() => expect(result.current.permission).toBe('blocked'));
  await act(async () => { await expect(result.current.enable()).resolves.toBeUndefined(); });
  expect(result.current).toMatchObject({ permission: 'blocked', error: '无法打开系统设置，请在手机设置中开启通知。' });
});

test('the reminder field shows a useful message when its enable button fails', async () => {
  jest.spyOn(device, 'notificationPermission').mockResolvedValue('undetermined');
  jest.spyOn(device, 'requestNotificationPermission').mockRejectedValue(new Error('NotificationsChannelsProvider is null'));
  const view = await render(<MuchakuchaThemeProvider><NotificationPermissionNotice /></MuchakuchaThemeProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '开启通知' })).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: '开启通知' }));
  await waitFor(() => expect(view.getByText('无法开启通知，请更新安装包后重试。')).toBeTruthy());
});
