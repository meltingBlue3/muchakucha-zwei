import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@muchakucha/api-client';
import { useInbox } from '../use-inbox';
import { InboxList } from '../inbox-list';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void | (() => void)) => {
  const React = jest.requireActual<typeof import('react')>('react'); React.useEffect(effect, [effect]);
} }));
function setup() {
  const invitation = { id: 'invite-1', householdName: '温暖小家', inviterDisplayName: '家主', expiresAt: '2027-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' };
  const api = { listInvitationInbox: jest.fn().mockResolvedValue({ invitations: [invitation] }),
    acceptInvitation: jest.fn().mockResolvedValue({ id: 'household', name: '温暖小家' }), declineInvitation: jest.fn().mockResolvedValue(undefined) };
  const onAccepted = jest.fn().mockResolvedValue(undefined);
  const getAccessToken = () => 'access';
  function TestInbox() { const props = useInbox({ api, getAccessToken, onAccepted }); return <InboxList {...props} />; }
  const mount = () => render(<MuchakuchaThemeProvider><TestInbox /></MuchakuchaThemeProvider>);
  return { api, onAccepted, mount };
}
test('accepts an inbox item by id then enters the joined household', async () => {
  const { api, onAccepted, mount } = setup(); const view = await mount();
  await fireEvent.press(await view.findByRole('button', { name: '接受「温暖小家」的邀请' }));
  await waitFor(() => expect(onAccepted).toHaveBeenCalledWith({ id: 'household', name: '温暖小家' }));
  expect(api.acceptInvitation).toHaveBeenCalledWith('access', { invitationId: 'invite-1' });
});
test('declines without joining and removes the processed item', async () => {
  const { api, onAccepted, mount } = setup(); const view = await mount();
  await fireEvent.press(await view.findByRole('button', { name: '拒绝「温暖小家」的邀请' }));
  expect(await view.findByText('已拒绝「温暖小家」的邀请。')).toBeTruthy();
  expect(api.declineInvitation).toHaveBeenCalledWith('access', { invitationId: 'invite-1' });
  expect(onAccepted).not.toHaveBeenCalled(); expect(await view.findByText('暂无消息')).toBeTruthy();
});
test('keeps an actionable invitation after a network failure', async () => {
  const { api, mount } = setup(); api.acceptInvitation.mockRejectedValue(new Error('offline')); const view = await mount();
  await fireEvent.press(await view.findByRole('button', { name: '接受「温暖小家」的邀请' }));
  expect(await view.findByText('这次没有完成，请检查网络后重试。')).toBeTruthy();
  expect(view.getByRole('button', { name: '接受「温暖小家」的邀请' })).toBeEnabled();
});
test('removes stale invitations with an explicit refresh message', async () => {
  const { api, mount } = setup(); api.acceptInvitation.mockRejectedValue(new ApiClientError(409, {})); const view = await mount();
  await fireEvent.press(await view.findByRole('button', { name: '接受「温暖小家」的邀请' }));
  expect(await view.findByText('这份邀请已处理、撤销或过期，已从列表移除。')).toBeTruthy();
  expect(view.queryByRole('button', { name: '接受「温暖小家」的邀请' })).toBeNull();
});
test('a failed inbox load shows retry rather than an empty inbox', async () => {
  const { api, mount } = setup(); api.listInvitationInbox.mockRejectedValueOnce(new Error('offline')); const view = await mount();
  expect(await view.findByText('暂时无法加载收件箱，请检查网络后重试。')).toBeTruthy();
  expect(view.queryByText('暂无消息')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '重试' }));
  expect(await view.findByText('家主邀请你加入「温暖小家」')).toBeTruthy();
});
test('navigation failure after acceptance does not invite the user to accept again', async () => {
  const { onAccepted, mount } = setup(); onAccepted.mockRejectedValue(new Error('offline')); const view = await mount();
  await fireEvent.press(await view.findByRole('button', { name: '接受「温暖小家」的邀请' }));
  expect(await view.findByText('你已加入家庭，请从“我的家庭”进入。')).toBeTruthy();
  expect(view.queryByRole('button', { name: '接受「温暖小家」的邀请' })).toBeNull();
});

test('the message list supports informational notifications without invitation actions', async () => {
  const view = await render(<MuchakuchaThemeProvider><InboxList messages={[{
    id: 'notice', category: '系统通知', summary: '新的服务消息', createdAt: '2026-09-26T00:00:00Z',
    details: [{ label: '详情', value: '仅供查看的信息' }], actions: [],
  }]} loading={false} busy={false} reload={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByRole('button', { name: '查看消息：新的服务消息' })).toBeTruthy();
  expect(view.queryByText('接受')).toBeNull();
  expect(view.queryByText('拒绝')).toBeNull();
  expect(view.queryByText('刷新收件箱')).toBeNull();
});


test('foreground refresh picks up new messages and retains them when a later refresh fails', async () => {
  const subscription = jest.spyOn(AppState, 'addEventListener');
  try {
    const { api, mount } = setup(); const view = await mount();
    await view.findByText('家主邀请你加入「温暖小家」');
    const listener = subscription.mock.calls.find(([event]) => event === 'change')?.[1];
    expect(listener).toBeDefined();
    api.listInvitationInbox.mockResolvedValueOnce({ invitations: [{ id: 'new', householdName: '新的家庭', inviterDisplayName: '家人', expiresAt: '2027-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }] });
    await act(async () => { listener?.('active'); });
    expect(await view.findByText('家人邀请你加入「新的家庭」')).toBeTruthy();
    api.listInvitationInbox.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { listener?.('active'); });
    expect(await view.findByText('暂时无法加载收件箱，请检查网络后重试。')).toBeTruthy();
    expect(view.getByText('家人邀请你加入「新的家庭」')).toBeTruthy();
  } finally { subscription.mockRestore(); }
});
