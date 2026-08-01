export {};

const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe.skip('session bootstrap contract', () => {
  test('holds the branded splash until fonts and session restoration both resolve', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_SPLASH_OWNERSHIP');
  });

  test('restores an authenticated session and loads the current profile', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_AUTHENTICATED');
  });

  test('routes an authenticated user without a household only to the Phase 2 handoff', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_NO_HOUSEHOLD_HANDOFF');
  });

  test('routes explicit credential rejection to reauthentication and clears local session state', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_REAUTH_REQUIRED');
  });

  test.each(['timeout', 'dns', 'offline', 'server-5xx'])(
    'retains credentials and enters offline waiting for %s restoration failure',
    (failure) => {
      missingBehavior(
        `IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_RETAINED_${failure.toUpperCase().replace('-', '_')}`,
      );
    },
  );

  test('preserves only a safe internal intended route across reauthentication', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_BOOTSTRAP_SAFE_INTENDED_ROUTE');
  });
});
