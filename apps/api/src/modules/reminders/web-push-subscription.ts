export function isWebPushEndpoint(value: string): boolean {
  // URL normalizes away an explicit :443, so check the authority as supplied.
  const authority = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(value)?.[1];
  if (authority === undefined || /[\s\\]/u.test(value)) return false;
  const url = URL.parse(value);
  if (url === null || url.hostname !== authority.toLowerCase()) return false;
  const { hostname } = url;
  return hostname === 'fcm.googleapis.com'
    || hostname === 'web.push.apple.com'
    || hostname === 'updates.push.services.mozilla.com'
    || /^(?:[a-z0-9-]+\.)+notify\.windows\.com$/.test(hostname);
}

export function isBase64UrlKey(value: string, byteLength: number): boolean {
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === byteLength && bytes.toString('base64url') === value;
}
