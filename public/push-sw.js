/* Push handlers — imported into the generated Workbox service worker.
   Shows a notification when a push arrives (works with the app closed). */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'Ripple', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ripple', {
      body: data.body || '',
      icon: '/ripple-icon.svg',
      badge: '/ripple-icon.svg',
      data: { url: data.url || '/' },
      tag: data.tag || undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
      return clients.openWindow(url);
    })
  );
});
