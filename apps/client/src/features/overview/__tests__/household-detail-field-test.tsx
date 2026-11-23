import { render } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { HouseholdDetailField } from '../household-detail-field';

const home = { id: 'h1', name: '林家小院', role: 'OWNER' as const, memberCount: 2, ownerMembershipId: 'm1', inOverview: true, joinedAt: '2026-01-01T00:00:00.000Z' };
const parents = { id: 'h2', name: '父母的家', role: 'MEMBER' as const, memberCount: 3, ownerMembershipId: 'm2', inOverview: false, joinedAt: '2026-02-01T00:00:00.000Z' };
let mockHouseholds = [home, parents];
jest.mock('../../households/household-context', () => ({ useHouseholdContext: () => ({ households: mockHouseholds }) }));

const renderField = (householdId: string) => render(<MuchakuchaThemeProvider><HouseholdDetailField householdId={householdId} /></MuchakuchaThemeProvider>);

test('someone in two households is told which one an item belongs to, even one left out of the 总览', async () => {
  mockHouseholds = [home, parents];
  const view = await renderField('h2');
  expect(view.getByText('家庭')).toBeTruthy();
  expect(view.getByText('父母的家')).toBeTruthy();
  expect(view.queryByText('林家小院')).toBeNull();
});

test('someone in one household sees no household row', async () => {
  mockHouseholds = [home];
  const view = await renderField('h1');
  expect(view.queryByText('家庭')).toBeNull();
  expect(view.queryByText('林家小院')).toBeNull();
});
