/**
 * Parses WEB_ORIGIN: comma-separated exact origins, HTTPS in production.
 * Production must name its origins; elsewhere the local web client is the default.
 */
export function parseExactOrigins(value: string | undefined, nodeEnvironment: string): ReadonlySet<string> {
  const configured = value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const candidates = configured.length > 0
    ? configured
    : nodeEnvironment === 'production'
      ? []
      : ['http://127.0.0.1:8081'];

  if (candidates.length === 0) {
    throw new Error('WEB_ORIGIN is required in production.');
  }

  return new Set(candidates.map((candidate) => {
    const parsed = new URL(candidate);
    if (
      parsed.origin !== candidate
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
    ) {
      throw new Error('WEB_ORIGIN entries must be exact origins without credentials, paths, queries, or fragments.');
    }
    if (nodeEnvironment === 'production' && parsed.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN entries must use HTTPS in production.');
    }
    return parsed.origin;
  }));
}
