import { ApiClientError } from '@muchakucha/api-client';

import type { RestoreOutcome } from '../../platform/session/session-transport';
import { withSessionRetry, type RetrySession } from '../session-retry';

const expired = () => new ApiClientError(401, { error: { code: 'INVALID_ACCESS_TOKEN' } });

/** A client whose calls succeed only with the currently valid token. */
class FakeClient {
  valid = 'token-2';
  calls: string[] = [];
  async listEvents(accessToken: string, householdId: string) {
    this.calls.push(accessToken);
    if (accessToken !== this.valid) throw expired();
    return { householdId, events: [] };
  }
  async login(body: { username: string }): Promise<{ username: string }> {
    if (body.username !== '') throw expired();
    return body;
  }
}

function session(overrides: Partial<RetrySession> & { current?: string | null } = {}) {
  let current: string | null = overrides.current === undefined ? 'token-1' : overrides.current;
  const lost = jest.fn();
  const refresh = jest.fn(async (): Promise<RestoreOutcome> => {
    current = 'token-2';
    return { kind: 'authenticated', session: { accessToken: 'token-2' } };
  });
  return {
    lost,
    refresh,
    value: { getAccessToken: () => current, refresh, onSessionLost: lost, ...overrides } satisfies RetrySession,
  };
}

test('refreshes once after a 401 and retries with the new token', async () => {
  const client = new FakeClient();
  const { refresh, value } = session();
  await expect(withSessionRetry(client, value).listEvents('token-1', 'home')).resolves.toEqual({ householdId: 'home', events: [] });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(client.calls).toEqual(['token-1', 'token-2']);
});

test('reuses a token another call already refreshed', async () => {
  const client = new FakeClient();
  const { refresh, value } = session({ current: 'token-2' });
  await withSessionRetry(client, value).listEvents('token-1', 'home');
  expect(refresh).not.toHaveBeenCalled();
  expect(client.calls).toEqual(['token-1', 'token-2']);
});

test('reports a lost session and keeps the original error when the refresh credential is gone', async () => {
  const client = new FakeClient();
  const outcome: RestoreOutcome = { kind: 'reauthRequired', reason: 'expired' };
  const { lost, value } = session({ refresh: async () => outcome });
  await expect(withSessionRetry(client, value).listEvents('token-1', 'home')).rejects.toMatchObject({ status: 401 });
  expect(lost).toHaveBeenCalledWith(outcome);
  expect(client.calls).toEqual(['token-1']);
});

test('an offline refresh keeps the session and surfaces the original error', async () => {
  const client = new FakeClient();
  const { lost, value } = session({ refresh: async () => ({ kind: 'offline', retainedCredential: true }) });
  await expect(withSessionRetry(client, value).listEvents('token-1', 'home')).rejects.toMatchObject({ status: 401 });
  expect(lost).not.toHaveBeenCalled();
});

test('leaves unauthenticated calls and non-401 failures alone', async () => {
  const client = new FakeClient();
  const { refresh, value } = session();
  await expect(withSessionRetry(client, value).login({ username: 'a' })).rejects.toMatchObject({ status: 401 });
  client.listEvents = async () => { throw new ApiClientError(500, {}); };
  await expect(withSessionRetry(client, value).listEvents('token-1', 'home')).rejects.toMatchObject({ status: 500 });
  expect(refresh).not.toHaveBeenCalled();
});
