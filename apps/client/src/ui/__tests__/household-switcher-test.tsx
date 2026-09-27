import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HouseholdSwitcher } from '../household-components';
import { MuchakuchaThemeProvider } from '../primitives';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));

test('the switcher names every role, including the owner', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <MuchakuchaThemeProvider>
        <HouseholdSwitcher
          visible
          currentHouseholdId="h1"
          households={[
            { id: 'h1', name: '我的家', role: 'OWNER', memberCount: 2, ownerMembershipId: 'm1' },
            { id: 'h2', name: '父母家', role: 'ADMIN', memberCount: 3, ownerMembershipId: 'm2' },
            { id: 'h3', name: '朋友家', role: 'MEMBER', memberCount: 4, ownerMembershipId: 'm3' },
          ]}
          onSelect={jest.fn()}
          onCreateNew={jest.fn()}
          onClose={jest.fn()}
        />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
  expect(view.getByRole('button', { name: '我的家，所有者' })).toBeTruthy();
  expect(view.getByRole('button', { name: '父母家，管理员' })).toBeTruthy();
  expect(view.getByRole('button', { name: '朋友家，成员' })).toBeTruthy();
});
