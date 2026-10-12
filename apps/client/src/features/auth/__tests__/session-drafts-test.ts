jest.mock('../../../platform/session/session-transport.native', () => ({ createNativeSessionTransport: () => ({}) }));
jest.mock('../../../platform/session/session-transport.web', () => ({ createWebSessionTransport: () => ({}) }));
jest.mock('../../../ui/workspace-runtime', () => ({
  draftWorkspace: { activateAccount: jest.fn(), endSession: jest.fn(), suspendSession: jest.fn() },
}));

import { draftWorkspace } from '../../../ui/workspace-runtime';
import { sessionStateStore } from '../session-runtime';

beforeEach(() => jest.clearAllMocks());

test('an expired session keeps the account drafts on disk', () => {
  sessionStateStore.enterReauthenticationRequired('expired');
  expect(draftWorkspace.suspendSession).toHaveBeenCalledTimes(1);
  expect(draftWorkspace.endSession).not.toHaveBeenCalled();
});

test.each(['revoked', 'replayed'] as const)('a %s session clears drafts like sign-out', (reason) => {
  sessionStateStore.enterReauthenticationRequired(reason);
  expect(draftWorkspace.endSession).toHaveBeenCalledTimes(1);
  expect(draftWorkspace.suspendSession).not.toHaveBeenCalled();
});

test('sign-out clears drafts', () => {
  sessionStateStore.enterUnauthenticated();
  expect(draftWorkspace.endSession).toHaveBeenCalledTimes(1);
});
