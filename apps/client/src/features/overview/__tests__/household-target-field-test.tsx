import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { HouseholdTargetField } from '../household-target-field';

const home = { id: 'h1', name: '林家小院', role: 'OWNER' as const, memberCount: 2, ownerMembershipId: 'm1', inOverview: true, joinedAt: '2026-01-01T00:00:00.000Z' };
const parents = { id: 'h2', name: '父母的家', role: 'MEMBER' as const, memberCount: 3, ownerMembershipId: 'm2', inOverview: true, joinedAt: '2026-02-01T00:00:00.000Z' };
jest.mock('../../households/household-context', () => ({ useHouseholdContext: () => ({ households: [home, parents] }) }));

const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: mockSetParams }) }));

const mockMove = jest.fn();
jest.mock('../../../ui/workspace-state', () => ({ useWorkspaceStore: () => ({ move: mockMove }) }));

beforeEach(() => {
  mockSetParams.mockReset();
  mockMove.mockReset();
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
const renderField = () => render(<SafeAreaProvider initialMetrics={metrics}><MuchakuchaThemeProvider><HouseholdTargetField householdId="h1" resource="tasks" /></MuchakuchaThemeProvider></SafeAreaProvider>);

test('says where the item goes, without a note about what changing it clears', async () => {
  const view = await renderField();

  expect(view.getByRole('button', { name: '保存到：林家小院' })).toBeTruthy();
  expect(view.queryByText(/换家庭会清空/)).toBeNull();
  expect(view.queryByRole('radio')).toBeNull();
});

test('lists every household in a menu, with the current one chosen', async () => {
  const view = await renderField();

  await fireEvent.press(view.getByRole('button', { name: '保存到：林家小院' }));

  expect(view.getByLabelText('选择保存到哪个家庭')).toBeTruthy();
  expect(view.getByRole('radio', { name: '林家小院', checked: true })).toBeTruthy();
  expect(view.getByRole('radio', { name: '父母的家', checked: false })).toBeTruthy();
});

test('choosing another household moves the draft there and closes the menu', async () => {
  const view = await renderField();

  await fireEvent.press(view.getByRole('button', { name: '保存到：林家小院' }));
  await fireEvent.press(view.getByRole('radio', { name: '父母的家' }));

  expect(mockMove).toHaveBeenCalledWith('draft:h1:tasks:new:', 'draft:h2:tasks:new:', expect.any(Function));
  expect(mockSetParams).toHaveBeenCalledWith({ id: 'h2', overview: '1' });
  expect(view.queryByLabelText('选择保存到哪个家庭')).toBeNull();
});

test('choosing the current household only closes the menu', async () => {
  const view = await renderField();

  await fireEvent.press(view.getByRole('button', { name: '保存到：林家小院' }));
  await fireEvent.press(view.getByRole('radio', { name: '林家小院' }));

  expect(mockMove).not.toHaveBeenCalled();
  expect(view.queryByLabelText('选择保存到哪个家庭')).toBeNull();
});
