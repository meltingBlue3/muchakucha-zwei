const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe('session bootstrap contract', () => {
  test('holds the branded splash until fonts and session restoration both resolve', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
  });

  test('restores an authenticated session and loads the current profile', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
  });

  test('routes an authenticated user without a household only to the Phase 2 handoff', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
  });

  test('routes explicit credential rejection to reauthentication and clears local session state', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
  });

  test.each(['timeout', 'dns', 'offline', 'server-5xx'])(
    'retains credentials and enters offline waiting for %s restoration failure',
    (failure) => {
      expect(failure).toBeTruthy();
      missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
    },
  );

  test('preserves only a safe internal intended route across reauthentication', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_UI');
  });
});
