/** Fixture writes read their base version first, like opening an editor.
 * Explicit versions are never replaced: stale-write and malformed-version tests
 * must reach the server unchanged. Missing-version tests use raw requests.
 */
export async function fixtureEditPayload(
  method: string,
  path: string,
  payload: unknown,
  read: (path: string) => Promise<{ updatedAt?: string; recurrence?: { updatedAt?: string } | null }>,
): Promise<unknown> {
  if (method !== 'PUT' || !/\/households\/[^/]+\/(notes|tasks|events|recurrence-rules)\/[^/?]+(?:\/series)?$/.test(path)) return payload;
  if (typeof payload !== 'object' || payload === null || 'expectedUpdatedAt' in payload) return payload;
  const base = await read(path.replace(/\/series$/, ''));
  // Permission/not-found cases still need a syntactically valid request body.
  const unknownVersion = '1970-01-01T00:00:00.000Z';
  return {
    ...payload,
    expectedUpdatedAt: base.updatedAt ?? unknownVersion,
    ...(base.recurrence || path.endsWith('/series') ? { expectedRuleUpdatedAt: base.recurrence?.updatedAt ?? unknownVersion } : {}),
  };
}
