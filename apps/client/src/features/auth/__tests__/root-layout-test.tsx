import { render, waitFor } from '@testing-library/react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';

import RootLayout from '../../../../app/_layout';
import { sessionStateStore, sessionTransport } from '../session-runtime';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  Stack: () => null,
  useGlobalSearchParams: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('../session-runtime', () => ({
  sessionStateStore: {
    get: jest.fn(),
    enterAuthenticated: jest.fn(),
    enterUnauthenticated: jest.fn(),
    enterOfflineWaiting: jest.fn(),
    enterReauthenticationRequired: jest.fn(),
  },
  sessionTransport: {
    clear: jest.fn(),
    restore: jest.fn(),
  },
}));

beforeEach(() => {
  jest.mocked(usePathname).mockReturnValue('/login');
  jest.mocked(useGlobalSearchParams).mockReturnValue({});
  jest.mocked(sessionStateStore.get).mockReturnValue({ kind: 'booting' });
  jest.mocked(sessionTransport.restore).mockResolvedValue({ kind: 'unauthenticated' });
  jest.mocked(sessionStateStore.enterUnauthenticated).mockImplementation(() => {
    jest.mocked(sessionStateStore.get).mockReturnValue({ kind: 'unauthenticated' });
  });
  jest.mocked(sessionStateStore.enterReauthenticationRequired).mockImplementation((reason) => {
    jest.mocked(sessionStateStore.get).mockReturnValue({ kind: 'reauthRequired', reason });
  });
});

describe('root authentication routing', () => {
  test('preserves a cold-start login return query without an expired-session warning', async () => {
    jest.mocked(useGlobalSearchParams).mockReturnValue({ intended: '/profile' });

    await render(<RootLayout />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
      pathname: '/login', params: { intended: '/profile' },
    }));
  });

  test.each([
    undefined,
    'https://attacker.test',
    '//attacker.test',
    '/profile?next=unsafe',
    ['/profile', 'https://attacker.test'],
  ])('drops an absent, unsafe, or ambiguous login return query %s', async (intended) => {
    jest.mocked(useGlobalSearchParams).mockReturnValue(intended === undefined ? {} : { intended });

    await render(<RootLayout />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/login', params: {} }));
  });

  test('uses a protected pathname as the return route regardless of an unrelated query', async () => {
    jest.mocked(usePathname).mockReturnValue('/profile');
    jest.mocked(useGlobalSearchParams).mockReturnValue({ intended: '/households' });

    await render(<RootLayout />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
      pathname: '/login', params: { intended: '/profile' },
    }));
  });

  test('marks an actually rejected session for reauthentication even without a return query', async () => {
    jest.mocked(sessionTransport.restore).mockResolvedValue({ kind: 'reauthRequired', reason: 'expired' });

    await render(<RootLayout />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
      pathname: '/login', params: { reason: 'reauth-required' },
    }));
    expect(sessionTransport.clear).toHaveBeenCalledTimes(1);
  });

  test('sends an already signed-in user to the safe return query', async () => {
    jest.mocked(useGlobalSearchParams).mockReturnValue({ intended: '/profile' });
    jest.mocked(sessionTransport.restore).mockResolvedValue({ kind: 'authenticated', session: { accessToken: 'restored' } });

    await render(<RootLayout />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/profile', params: undefined }));
  });
});
