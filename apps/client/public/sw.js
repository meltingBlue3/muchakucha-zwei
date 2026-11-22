const icon = '/icons/icon-192.png';

function reminderUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/households/')) return null;
  const url = new URL(value, self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/households/')) return null;
  return url.pathname + url.search + url.hash;
}

self.addEventListener('push', event => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    // Each push must still show a notification, including malformed payloads.
  }
  const title = typeof payload?.title === 'string' && payload.title ? payload.title : 'Muchakucha Zwei';
  const body = typeof payload?.body === 'string' ? payload.body : '';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon,
    data: { url: reminderUrl(payload?.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = reminderUrl(event.notification.data?.url);
  if (url === null) return;
  event.waitUntil(openReminder(url));
});

async function openReminder(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows.find(window => new URL(window.url).origin === self.location.origin);
  if (client) {
    const focused = await client.focus().catch(() => null);
    if (focused) {
      focused.postMessage({ type: 'reminder-open', url });
      return;
    }
  }
  await self.clients.openWindow(url);
}
