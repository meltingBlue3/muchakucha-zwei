export {};

const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe.skip('platform session transport contract', () => {
  test('native stores refresh and pending-proof material only in SecureStore', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_NATIVE_SECURE_STORE');
  });

  test('native keeps the access token in memory and clears every credential on sign-out', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_NATIVE_MEMORY_ACCESS');
  });

  test('native refresh is process-wide single-flight and accepts the rotated generation', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_NATIVE_REFRESH_MUTEX');
  });

  test('Web exposes no refresh-token or pending-proof getter to JavaScript', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_WEB_NO_SECRET_GETTER');
  });

  test('Web sends same-origin credentials and accepts only the access session from JSON', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_WEB_COOKIE_CREDENTIALS');
  });

  test('Web refresh uses a same-origin Web Lock with an in-tab single-flight fallback', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_WEB_REFRESH_MUTEX');
  });

  test('ordinary logout clears the matching platform credential and only the current device session', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_CURRENT_DEVICE_LOGOUT');
  });

  test('never writes refresh or pending-proof material to AsyncStorage or localStorage', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_TRANSPORT_FORBIDDEN_STORAGE');
  });
});
