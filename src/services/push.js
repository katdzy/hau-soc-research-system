/**
 * Push registration for device notifications (flag DEVICE_NOTIFICATIONS).
 *
 * Saves this device's FCM token so the deliverOutbox Cloud Function
 * (functions/index.js) can reach it when the app is closed, and removes it on
 * sign-out so a shared device stops receiving the previous user's
 * notifications. Only the Firebase build with VITE_FIREBASE_VAPID_KEY set does
 * anything; elsewhere device notifications come from useOutboxNotifications.
 *
 * Tokens are written by the registerPushToken / unregisterPushToken callable
 * functions, never from the browser: firestore.rules deny client writes, and
 * the function ties a token to the caller's own signed-in account.
 */
import { db } from '../backend/index.js'
import { firebaseApp } from '../backend/firebaseAdapter.js'
import { resolveActor } from './core.js'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

const granted = () => typeof Notification !== 'undefined' && Notification.permission === 'granted'

/** Real push is configured for this build. When true, push alone delivers notifications. */
export const pushAvailable = () =>
  db.name === 'firebase' && !!VAPID_KEY && typeof navigator !== 'undefined' && 'serviceWorker' in navigator

let functions = null
async function call(name, data) {
  const app = await firebaseApp()
  const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('firebase/functions')
  if (!functions) {
    functions = getFunctions(app)
    if (import.meta.env.VITE_USE_EMULATORS === 'true') connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  }
  return httpsCallable(functions, name)(data)
}

/** This device's FCM token, or null where push cannot run. Never asks for permission. */
async function deviceToken() {
  if (!pushAvailable() || !granted()) return null
  // The production service worker; dev builds have none, so no push there.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  const { getMessaging, getToken, deleteToken, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) return null
  const messaging = getMessaging(await firebaseApp())
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  return token ? { token, drop: () => deleteToken(messaging) } : null
}

// The account this device last registered for push. Push can be configured
// and allowed and still fail here (Brave turns its push service off by
// default; some browsers have none), so the open app stands down only for
// an account this device really registered.
const REGISTERED_KEY = 'hausoc.push.device'
const remember = (userId) => {
  try { userId ? localStorage.setItem(REGISTERED_KEY, userId) : localStorage.removeItem(REGISTERED_KEY) } catch { /* private mode */ }
}
export const pushRegisteredFor = (userId) => {
  try { return !!userId && localStorage.getItem(REGISTERED_KEY) === userId } catch { return false }
}

/** Register this device for the signed-in account (after permission is granted, and on each sign-in). */
export async function registerDevice(actor) {
  const { user } = resolveActor(actor) // the signed-in account only
  try {
    const device = await deviceToken()
    if (!device) { remember(null); return null }
    await call('registerPushToken', { token: device.token, userAgent: navigator.userAgent })
    remember(user.id)
    return device.token
  } catch (err) {
    remember(null) // the open app keeps showing notifications on this device
    throw err
  }
}

/** On sign-out: forget this device on the server, then invalidate its token. */
export async function unregisterDevice() {
  remember(null)
  const device = await deviceToken()
  if (!device) return
  await call('unregisterPushToken', { token: device.token }).catch(() => {})
  await device.drop().catch(() => {})
}
