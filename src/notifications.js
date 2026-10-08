/**
 * Device notifications (revision 2026-10-07, flag DEVICE_NOTIFICATIONS).
 *
 * Every email notify() records in `outbox` also shows as a notification for
 * its recipients — the same events and text as the email, never a second
 * source of truth, and still no in-app list. Two deliveries share one tag (the
 * outbox id), so the OS shows each email once:
 *   1. useOutboxNotifications — while the app is open or recently in the
 *      background, a new outbox entry addressed to you is shown from here.
 *      Works on both backends and needs no server.
 *   2. Real push — the deliverOutbox Cloud Function in functions/ sends the
 *      email and, through FCM, the push to the devices registered here. Off
 *      until VITE_FIREBASE_VAPID_KEY is set on the Firebase build; once it is,
 *      path 1 stands down on devices with permission (push covers open, closed
 *      and away), so nothing is shown twice.
 *
 * iOS shows web notifications only for an app added to the Home Screen
 * (16.4+), and every platform asks permission from a tap, never on load.
 */
import { useEffect, useRef, useState } from 'react'
import { FLAGS } from './domain/flags.js'
import { currentEnv, notificationSupport } from './browserSupport.js'
import { pushAvailable, pushRegisteredFor, registerDevice } from './services/push.js'

const enabled = FLAGS.DEVICE_NOTIFICATIONS !== 'off'

/**
 * 'granted' | 'denied' | 'default' — the browser can notify, and this is its permission;
 * otherwise why it cannot (browserSupport.notificationSupport): 'needs-install' (iOS in
 * a browser tab) | 'ios-too-old' | 'in-app' | 'unsupported'; or 'off' (the flag).
 */
export function notificationStatus() {
  if (!enabled) return 'off'
  const support = notificationSupport(currentEnv())
  return support === 'ready' ? Notification.permission : support
}

// Real push covers this account on this device: configured, allowed and registered.
const pushHandles = (userId) =>
  pushAvailable() && notificationStatus() === 'granted' && pushRegisteredFor(userId)

/**
 * The service worker that shows notifications (Android refuses any other way).
 * Right after the first load it may still be installing, so a production build
 * waits for it briefly; dev builds have none.
 */
async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing || !import.meta.env.PROD) return existing ?? null
  return Promise.race([navigator.serviceWorker.ready, new Promise(done => setTimeout(() => done(null), 4000))])
}

// Older browsers take a callback instead of returning a promise.
const askPermission = () => new Promise(done => {
  const asked = Notification.requestPermission(done)
  if (asked?.then) asked.then(done)
})

const urlFor = (mail) => (mail.projectId ? `/projects/${mail.projectId}` : '/')

/** Show one outbox entry. Through the service worker where there is one (Android requires it). */
export async function showMailNotification(mail) {
  if (notificationStatus() !== 'granted') return
  const title = mail.subject ?? 'HAU-SOC Capstone'
  const options = {
    body: mail.body ?? '',
    tag: mail.id,
    icon: '/pwa-192.png',
    // Android's status bar draws this as a monochrome mark instead of the browser's icon.
    badge: '/pwa-badge.png',
    data: { url: urlFor(mail) },
  }
  const reg = await swRegistration()
  if (reg) return reg.showNotification(title, options)
  // Dev builds run without a service worker; desktop browsers still show this
  // (Android throws, and the caller reports it).
  const n = new Notification(title, options)
  n.onclick = () => { window.focus(); window.location.assign(options.data.url); n.close() }
}

/**
 * A local check that this device can show notifications at all. Not an email,
 * so it never touches the outbox and nobody else sees it.
 */
export const sendTestNotification = () => showMailNotification({
  id: 'test-notification',
  subject: 'Notifications are working',
  body: 'This device will show the same updates as your HAU email.',
  projectId: null,
})

// The newest outbox entry this device has accounted for, per account.
const MARK_KEY = (userId) => `hausoc.notified.${userId}`
const readMark = (userId) => { try { return localStorage.getItem(MARK_KEY(userId)) } catch { return null } }
const writeMark = (userId, at) => { try { localStorage.setItem(MARK_KEY(userId), at) } catch { /* private mode */ } }
// '0' sorts before every ISO time, so an empty outbox still leaves a mark.
const newestAt = (mails) => mails.reduce((max, m) => (m.at > max ? m.at : max), '0')
// Catching up after time away shows at most this many; the dashboard has the rest.
const CATCH_UP = 3

/**
 * Mirror new outbox entries for `me` while the app runs. On sign-in, emails
 * that arrived since this account last used this device are shown too (the
 * newest few), as push would have done — but only once the account has been
 * here before with notifications on. A first sign-in never replays a backlog.
 */
export function useOutboxNotifications(me, outbox) {
  const seen = useRef(null)
  useEffect(() => { seen.current = null }, [me?.id])
  useEffect(() => {
    if (!enabled || !me) return
    const all = outbox ?? []
    const mine = (mail) => mail.userIds?.includes(me.id)
    // Push delivers these itself where it is configured and allowed.
    const show = (mail) => (pushHandles(me.id) ? null : showMailNotification(mail).catch(() => {}))
    if (seen.current === null) {
      seen.current = new Set(all.map(m => m.id))
      const mark = readMark(me.id)
      if (mark && notificationStatus() === 'granted') {
        all.filter(m => mine(m) && m.at > mark)
          .sort((a, b) => a.at.localeCompare(b.at))
          .slice(-CATCH_UP)
          .forEach(show)
      }
    } else {
      for (const mail of all) {
        if (seen.current.has(mail.id)) continue
        seen.current.add(mail.id)
        if (mine(mail)) show(mail)
      }
    }
    writeMark(me.id, newestAt(all))
  }, [outbox, me?.id])

  // Keep this device's push registration current once permission is granted.
  useEffect(() => {
    if (me && notificationStatus() === 'granted') registerDevice(me).catch(() => {})
  }, [me?.id])
}

/** Permission state plus the tap that asks for it. */
export function useNotificationPermission(me) {
  const [status, setStatus] = useState(notificationStatus)
  // Permission can change in the phone's settings while the app is away.
  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') setStatus(notificationStatus()) }
    document.addEventListener('visibilitychange', recheck)
    return () => document.removeEventListener('visibilitychange', recheck)
  }, [])
  const request = async () => {
    const result = await askPermission()
    setStatus(result)
    if (result === 'granted') registerDevice(me).catch(() => {})
  }
  return { status, request }
}
