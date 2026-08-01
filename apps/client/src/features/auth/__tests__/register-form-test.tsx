const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe('registration form contract', () => {
  test('validates email, nickname, and password only after interaction or submit', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });

  test('keeps one stable primary action while registration is pending', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });

  test('maps safe field errors and announces non-field API failures', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });

  test('D-06 writes the API-issued native registration pending proof before opening verification', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });

  test('D-06 relies on the API-issued HttpOnly pending cookie on Web and never stores proof in JavaScript', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });

  test('continues to the verification-pending route with the original delivery address', () => {
    missingBehavior('IMPLEMENTATION_MISSING_REGISTER_UI');
  });
});
