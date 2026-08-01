export {};

const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe.skip('password reset flow contract', () => {
  test('shows the same privacy-safe request confirmation for every email', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_RESET_ENUMERATION_SAFETY');
  });

  test('sanitizes the reset token from visible URL and history before rendering', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_RESET_LINK_SANITIZATION');
  });

  test('validates the new password on blur and rejects the common-password error safely', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_RESET_PASSWORD_VALIDATION');
  });

  test('keeps the update action stable and prevents repeat submission while pending', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_RESET_PENDING_ACTION');
  });

  test.each(['expired', 'used', 'invalid'])(
    'renders the distinct %s reset-link recovery state',
    (outcome) => {
      missingBehavior(
        `IMPLEMENTATION_MISSING_CLIENT_RESET_OUTCOME_${outcome.toUpperCase()}`,
      );
    },
  );

  test('explains global session revocation and returns to login without auto-login', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_RESET_NO_AUTO_LOGIN');
  });
});
