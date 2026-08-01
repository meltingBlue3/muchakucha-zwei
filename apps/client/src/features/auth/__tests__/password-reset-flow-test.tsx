export {};

const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe('password reset flow contract', () => {
  test('shows the same privacy-safe request confirmation for every email', () => {
    missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
  });

  test('sanitizes the reset token from visible URL and history before rendering', () => {
    missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
  });

  test('validates the new password on blur and rejects the common-password error safely', () => {
    missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
  });

  test('keeps the update action stable and prevents repeat submission while pending', () => {
    missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
  });

  test.each(['expired', 'used', 'invalid'])(
    'renders the distinct %s reset-link recovery state',
    (outcome) => {
      expect(outcome).toBeTruthy();
      missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
    },
  );

  test('explains global session revocation and returns to login without auto-login', () => {
    missingBehavior('IMPLEMENTATION_MISSING_RESET_UI');
  });
});
