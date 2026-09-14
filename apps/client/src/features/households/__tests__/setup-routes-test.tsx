import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import Handoff from '../../../../app/(protected)/household-handoff';
import NewHousehold from '../../../../app/(protected)/households/new';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import type { HouseholdViewState } from '../household-context';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockRefresh = jest.fn();
const mockSwitch = jest.fn();
const mockCreate = jest.fn();
let mockViewState: HouseholdViewState = 'noHousehold';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../household-context', () => ({ useHouseholdContext: () => ({
  viewState: mockViewState, households: [], currentHouseholdId: null,
  refreshHouseholds: mockRefresh, switchHousehold: mockSwitch,
}) }));
jest.mock('../../auth/session-runtime', () => ({
  sessionApiClient: { createHousehold: (...args: unknown[]) => mockCreate(...args) },
  sessionTransport: { getAccessToken: () => 'test-token' },
}));

function renderPage(children: ReactNode) {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><MuchakuchaThemeProvider>{children}</MuchakuchaThemeProvider></SafeAreaProvider>);
}

test('only a confirmed empty household state shows setup choices', async () => {
  mockViewState = 'noHousehold';
  const view = await renderPage(<Handoff />);
  await fireEvent.press(view.getByRole('button', { name: '我有邀请链接' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/invite');
  await view.unmount();
  mockViewState = 'offlineRetained';
  const offline = await renderPage(<Handoff />);
  expect(offline.queryByText('开始设置你的家庭')).toBeNull();
  expect(mockRouter.replace).toHaveBeenCalledWith('/households');
});

test('entering a created household retries resolution without creating a duplicate', async () => {
  mockViewState = 'noHousehold';
  mockCreate.mockResolvedValue({ id: 'new-family' });
  mockRefresh.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mockSwitch.mockResolvedValue(true);
  const view = await renderPage(<NewHousehold />);
  await fireEvent.changeText(view.getByLabelText('家庭名称'), '我们的小家');
  await fireEvent.press(view.getByRole('button', { name: '创建家庭' }));
  await fireEvent.press(await view.findByRole('button', { name: '进入家庭' }));
  expect(await view.findByText('家庭已经创建，无需重复创建。请重试进入。')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '进入家庭' }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/households/new-family'));
  expect(mockRefresh).toHaveBeenCalledWith('new-family');
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
