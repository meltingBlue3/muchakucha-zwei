import { requireOptionalNativeModule } from 'expo';
import { announceAlarmLanguage } from '../../platform/preferences/alarm-language.android';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const nativeModule = jest.mocked(requireOptionalNativeModule);

test('passes the active language to the Android alarm module', () => {
  const setLanguage = jest.fn();
  nativeModule.mockReturnValue({ setLanguage });
  announceAlarmLanguage('ja');
  announceAlarmLanguage('zh-Hans');
  expect(nativeModule).toHaveBeenCalledWith('ReminderAlarm');
  expect(setLanguage.mock.calls).toEqual([['ja'], ['zh-Hans']]);
});

test('supports older binaries and Expo Go', () => {
  nativeModule.mockReturnValue({});
  expect(() => announceAlarmLanguage('ja')).not.toThrow();
  nativeModule.mockReturnValue(null);
  expect(() => announceAlarmLanguage('ja')).not.toThrow();
});
