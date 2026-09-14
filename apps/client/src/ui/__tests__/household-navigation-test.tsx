import { fireEvent, render } from '@testing-library/react-native';
import { HouseholdNavigation } from '../household-navigation';
import { HouseholdHeader } from '../household-components';
import { MuchakuchaThemeProvider } from '../primitives';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

test('switches sections within the same household without stacking tab visits', async () => {
  const view = await render(<MuchakuchaThemeProvider><HouseholdNavigation householdId="family/a" active="today" /></MuchakuchaThemeProvider>);
  expect(view.getAllByRole('tab')).toHaveLength(5);
  expect(view.getByRole('tab', { name: '今日' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByRole('tab', { name: '今日' }));
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('tab', { name: '任务' }));
  expect(mockReplace).toHaveBeenCalledWith('/households/family%2Fa/tasks');
  await fireEvent.press(view.getByRole('tab', { name: '家庭' }));
  expect(mockReplace).toHaveBeenLastCalledWith('/households/family%2Fa/more');
});

test('the whole household header opens the switcher through its accessible control', async () => {
  const onOpenSwitcher = jest.fn();
  const view = await render(<MuchakuchaThemeProvider><HouseholdHeader householdName="我们的家" onOpenSwitcher={onOpenSwitcher} /></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '当前家庭：我们的家，切换家庭' }));
  expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
});
