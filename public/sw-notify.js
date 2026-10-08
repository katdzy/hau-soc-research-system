/* Imported into the generated service worker (vite.config.js → workbox.importScripts).
   Device notifications: see src/notifications.js. */

// Real push from the deliverOutbox Cloud Function: an FCM data message carrying
// one outbox entry. iOS requires every push to show a notification.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json()?.data ?? {} } catch { /* not JSON: show the fallback */ }
  event.waitUntil(self.registration.showNotification(data.title || 'HAU-SOC Capstone', {
    body: data.body || '',
    tag: data.tag || undefined, // the outbox id: the same email never shows twice
    icon: '/pwa-192.png',
    badge: '/pwa-badge.png',
    data: { url: data.url || '/' },
  }))
})

// A tap opens the project: reuse an open window of the app when there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(w => new URL(w.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      return open.navigate(url).catch(() => self.clients.openWindow(url))
    }
    return self.clients.openWindow(url)
  })())
})
