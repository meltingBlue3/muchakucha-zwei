import type { LabelResponseDto } from '@muchakucha/api-client';
import { render } from '@testing-library/react-native';
import { sessionApiClient } from '../../auth/session-runtime';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { LabelPicker } from '../label-picker';

jest.mock('../../auth/session-runtime', () => ({
  sessionTransport: { getAccessToken: jest.fn(async () => 'token') },
  sessionApiClient: { listLabels: jest.fn() },
}));

const label = (id: string, name: string): LabelResponseDto => ({ id, householdId: 'family', name, color: '#2C716C', createdBy: 'owner', createdAt: '2026-11-01T00:00:00.000Z' });

beforeEach(() => jest.mocked(sessionApiClient.listLabels).mockReset());

test('a chosen label that has since been deleted is dropped once the list loads', async () => {
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [label('kept', '家务')], total: 1 });
  const onChange = jest.fn();
  const view = await render(<MuchakuchaThemeProvider><LabelPicker householdId="family" selectedLabelIds={['deleted', 'kept']} onChange={onChange} /></MuchakuchaThemeProvider>);

  await view.findByLabelText('取消选择标签 家务');
  expect(onChange).toHaveBeenCalledWith(['kept']);
});

test('a list that failed to load drops nothing', async () => {
  jest.mocked(sessionApiClient.listLabels).mockRejectedValue(new Error('offline'));
  const onChange = jest.fn();
  const view = await render(<MuchakuchaThemeProvider><LabelPicker householdId="family" selectedLabelIds={['kept']} onChange={onChange} /></MuchakuchaThemeProvider>);

  await view.findByText('标签没有加载成功。');
  expect(onChange).not.toHaveBeenCalled();
});
