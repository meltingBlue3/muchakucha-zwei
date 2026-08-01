const missingBehavior = (marker: string): never => {
  throw new Error(marker);
};

describe('platform session transport contract', () => {
  test('exposes the D-06 continuation and session boundary before platform implementations', () => {
    missingBehavior('IMPLEMENTATION_MISSING_SESSION_BOUNDARY');
  });
});
