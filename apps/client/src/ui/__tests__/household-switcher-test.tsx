import { fireEvent, render } from '@testing-library/react-native';
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
            { id: 'h1', name: '我的家', role: 'OWNER', memberCount: 2, ownerMembershipId: 'm1', inOverview: true, joinedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'h2', name: '父母家', role: 'ADMIN', memberCount: 3, ownerMembershipId: 'm2', inOverview: true, joinedAt: '2026-02-01T00:00:00.000Z' },
            { id: 'h3', name: '朋友家', role: 'MEMBER', memberCount: 4, ownerMembershipId: 'm3', inOverview: false, joinedAt: '2026-03-01T00:00:00.000Z' },
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

test('with the 总览 on top, choosing it or adjusting it leaves no household marked current', async () => {
  const households = [
    { id: 'h1', name: '我的家', role: 'OWNER' as const, memberCount: 2, ownerMembershipId: 'm1', inOverview: true, joinedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'h2', name: '父母家', role: 'ADMIN' as const, memberCount: 3, ownerMembershipId: 'm2', inOverview: true, joinedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'h3', name: '朋友家', role: 'MEMBER' as const, memberCount: 4, ownerMembershipId: 'm3', inOverview: false, joinedAt: '2026-03-01T00:00:00.000Z' },
  ];
  const onSelectOverview = jest.fn();
  const onAdjust = jest.fn();
  const onClose = jest.fn();
  const marks = new Map(households.map((h, index) => [h.id, { character: h.name[0]!, color: ['#4A57A6', '#2C716C', '#87573A'][index]!, name: h.name }]));
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <MuchakuchaThemeProvider>
        <HouseholdSwitcher
          visible
          currentHouseholdId="h1"
          households={households}
          marks={marks}
          overview={{ selected: true, summary: '我的家、父母家', onSelect: onSelectOverview, onAdjust }}
          onSelect={jest.fn()}
          onCreateNew={jest.fn()}
          onClose={onClose}
        />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
  const overview = view.getByRole('button', { name: '总览，我的家、父母家' });
  expect(overview.props.accessibilityState).toMatchObject({ selected: true });
  expect(view.getByRole('button', { name: '我的家，所有者' }).props.accessibilityState).toMatchObject({ selected: false });
  expect(view.getByText(/不在总览里/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '调整总览里的家庭' }));
  expect(onAdjust).toHaveBeenCalledTimes(1);
  await fireEvent.press(overview);
  expect(onSelectOverview).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalled();
});
