export {};

const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe.skip('email verification continuation contract', () => {
  test('sanitizes the token-bearing landing URL before rendering or completing verification', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_VERIFICATION_LINK_SANITIZATION');
  });

  test('D-06 reads the native registration pending proof exactly once for completion', () => {
    missingBehavior('IMPLEMENTATION_MISSING_D06_NATIVE_PENDING_PROOF_READ');
  });

  test('D-06 clears the native pending proof after every terminal verification outcome', () => {
    missingBehavior('IMPLEMENTATION_MISSING_D06_NATIVE_PENDING_PROOF_CLEAR');
  });

  test('D-06 accepts an issued same-device session and enters authenticated state', () => {
    missingBehavior('IMPLEMENTATION_MISSING_D06_ISSUED_SESSION_ACCEPTANCE');
  });

  test('D-06 routes an authenticated account without a household to the Phase 2 handoff', () => {
    missingBehavior('IMPLEMENTATION_MISSING_D06_NO_HOUSEHOLD_HANDOFF');
  });

  test.each(['expired', 'used', 'invalid', 'superseded'])(
    'renders the distinct %s terminal outcome without exposing the token',
    (outcome) => {
      missingBehavior(
        `IMPLEMENTATION_MISSING_CLIENT_VERIFICATION_OUTCOME_${outcome.toUpperCase()}`,
      );
    },
  );

  test('requires login after cross-device verification instead of inventing a session', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_CROSS_DEVICE_LOGIN_GUIDANCE');
  });

  test('uses the server retry value for resend eligibility and countdown state', () => {
    missingBehavior('IMPLEMENTATION_MISSING_CLIENT_VERIFICATION_RESEND_ELIGIBILITY');
  });
});
