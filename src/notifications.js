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
 * A notification shows only a general line (deviceNotice.js), never the
 * email's text: the details are behind sign-in.
 *
 * Only the installed app on a phone or tablet shows them (Figma F04); desktop
 * and browser tabs get email alone. iOS needs 16.4 or later, and every
 * platform asks permission from a tap, never on load.
 * The account menu's switch can also turn them off for one account on one
 * device while the browser permission stays granted.
 */
import { useEffect, useRef, useState } from 'react'
import { FLAGS } from './domain/flags.js'
import { currentEnv, notificationSupport } from './browserSupport.js'
import { pushAvailable, pushRegisteredFor, registerDevice, unregisterDevice } from './services/push.js'
import { lockScreenText } from './deviceNotice.js'

const enabled = FLAGS.DEVICE_NOTIFICATIONS !== 'off'

/**
 * 'granted' | 'denied' | 'default' — the browser can notify, and this is its permission;
 * otherwise why it cannot (browserSupport.notificationSupport): 'desktop' | 'needs-install'
 * (a browser tab) | 'ios-too-old' | 'in-app' | 'unsupported'; or 'off' (the flag).
 */
export function notificationStatus() {
  if (!enabled) return 'off'
  const support = notificationSupport(currentEnv())
  return support === 'ready' ? Notification.permission : support
}

// Turned off with the account menu's switch: this account, this device.
const OFF_KEY = (userId) => `hausoc.notify.off.${userId}`
export const turnedOff = (userId) => { try { return localStorage.getItem(OFF_KEY(userId)) === '1' } catch { return false } }
const setTurnedOff = (userId, off) => {
  try { off ? localStorage.setItem(OFF_KEY(userId), '1') : localStorage.removeItem(OFF_KEY(userId)) } catch { /* private mode */ }
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
export async function showMailNotification(mail, text = lockScreenText(mail)) {
  if (notificationStatus() !== 'granted') return
  const { title } = text
  const options = {
    body: text.body,
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
export const sendTestNotification = () => showMailNotification(
  { id: 'test-notification', projectId: null },
  { title: 'Notifications are working', body: 'This device will show a notice for every HAU email the system sends you.' },
)

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
    const show = (mail) => (pushHandles(me.id) || turnedOff(me.id) ? null : showMailNotification(mail).catch(() => {}))
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

  // Keep this device's push registration current once permission is granted;
  // a device that no longer qualifies (a tab registered before, or switched
  // off) is dropped so push stops reaching it.
  useEffect(() => {
    if (!me) return
    if (notificationStatus() === 'granted' && !turnedOff(me.id)) registerDevice(me).catch(() => {})
    else if (pushRegisteredFor(me.id)) unregisterDevice().catch(() => {})
  }, [me?.id])
}

/**
 * The account menu's switch: permission state, whether notifications are on
 * for this account here, and the taps that change it. Turning on asks for
 * permission the first time; turning off keeps the permission and stops this
 * device (push token dropped, the open app stays quiet).
 */
export function useNotificationPermission(me) {
  const [status, setStatus] = useState(notificationStatus)
  const [off, setOff] = useState(() => turnedOff(me.id))
  // Permission can change in the phone's settings while the app is away.
  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') setStatus(notificationStatus()) }
    document.addEventListener('visibilitychange', recheck)
    return () => document.removeEventListener('visibilitychange', recheck)
  }, [])
  const turnOn = async () => {
    const result = status === 'granted' ? 'granted' : await askPermission()
    setStatus(result)
    if (result !== 'granted') return
    setTurnedOff(me.id, false)
    setOff(false)
    registerDevice(me).catch(() => {})
  }
  const turnOff = async () => {
    setTurnedOff(me.id, true)
    setOff(true)
    await unregisterDevice().catch(() => {})
  }
  return { status, on: status === 'granted' && !off, turnOn, turnOff }
}
