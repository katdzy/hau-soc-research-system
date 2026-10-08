/**
 * Cloud Functions for the Firebase build.
 *
 * Not deployed yet: Cloud Functions need the Blaze (pay-as-you-go) plan, and
 * FCM delivery is not emulated, so push cannot be exercised on the emulators.
 * Before `firebase deploy --only functions`:
 *   firebase functions:secrets:set RESEND_API_KEY
 *   MAIL_FROM in functions/.env (a sender on a domain verified in Resend)
 */
import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'

initializeApp()

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const MAIL_FROM = defineString('MAIL_FROM', { default: 'HAU-SOC Capstone <no-reply@example.com>' })

// FCM rejects these tokens for good: the app was uninstalled or permission revoked.
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])
// Firestore `in` queries take at most 30 values.
const chunk = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
// A token is long and may hold characters awkward in a path; its hash is the document id.
const tokenId = (token) => createHash('sha256').update(token).digest('hex')

/** The email, through Resend. The official record: always attempted. */
async function sendEmail(mail) {
  const to = mail.to ?? []
  if (!to.length) return { status: 'skipped', reason: 'no address' }
  const text = mail.link ? `${mail.body ?? ''}\n\n${mail.link}` : (mail.body ?? '')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM.value(), to, subject: mail.subject, text }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return { status: 'sent', id: (await res.json()).id ?? null }
}

/** The same message as a push to every device the recipients turned notifications on for. */
async function sendPush(db, mail, mailId) {
  const userIds = mail.userIds ?? []
  if (!userIds.length) return { status: 'skipped', reason: 'no account' }
  const tokens = []
  for (const ids of chunk(userIds, 30)) {
    const snap = await db.collection('pushTokens').where('userId', 'in', ids).get()
    snap.forEach(doc => tokens.push({ ref: doc.ref, token: doc.get('token') }))
  }
  if (!tokens.length) return { status: 'skipped', reason: 'no device' }

  // Data-only message: public/sw-notify.js shows it. FCM caps a payload at 4 KB.
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    data: {
      title: String(mail.subject ?? 'HAU-SOC Capstone').slice(0, 200),
      body: String(mail.body ?? '').slice(0, 1000),
      url: mail.projectId ? `/projects/${mail.projectId}` : '/',
      tag: mailId, // the open app uses the same tag, so a device shows it once
    },
    webpush: { headers: { Urgency: 'high', TTL: String(60 * 60 * 24) } },
  })

  const dead = res.responses.flatMap((r, i) => (!r.success && DEAD.has(r.error?.code) ? [tokens[i].ref] : []))
  if (dead.length) {
    const batch = db.batch()
    dead.forEach(ref => batch.delete(ref))
    await batch.commit()
  }
  return { status: 'sent', devices: tokens.length, sent: res.successCount, failed: res.failureCount, pruned: dead.length }
}

const outcome = (r) => (r.status === 'fulfilled' ? r.value : { status: 'failed', error: String(r.reason?.message ?? r.reason) })

/**
 * Notification delivery (R6c + DEVICE_NOTIFICATIONS, revision 2026-10-07). Every
 * email notify() records in `outbox` goes out once, from here: the email through
 * Resend and the same subject and body as a push through FCM. One channel
 * failing never stops the other; the result of each is kept on the entry.
 */
export const deliverOutbox = onDocumentCreated({ document: 'outbox/{mailId}', secrets: [RESEND_API_KEY] }, async (event) => {
  const mail = event.data?.data()
  if (!mail) return
  const db = getFirestore()
  const [email, push] = await Promise.allSettled([sendEmail(mail), sendPush(db, mail, event.params.mailId)])
  const delivery = { email: outcome(email), push: outcome(push), at: FieldValue.serverTimestamp() }
  await event.data.ref.update({ delivery })
  logger.info('deliverOutbox', { mailId: event.params.mailId, email: delivery.email.status, push: delivery.push.status })
})

const signedIn = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const token = request.data?.token
  if (typeof token !== 'string' || !token || token.length > 4096) throw new HttpsError('invalid-argument', 'A device token is required.')
  return { uid: request.auth.uid, token }
}

/** A device that turned notifications on, for the caller's own account only. Re-registering moves it. */
export const registerPushToken = onCall(async (request) => {
  const { uid, token } = signedIn(request)
  await getFirestore().collection('pushTokens').doc(tokenId(token)).set({
    userId: uid,
    token,
    userAgent: String(request.data?.userAgent ?? '').slice(0, 300),
    at: FieldValue.serverTimestamp(),
  })
  return { ok: true }
})

/** Sign-out: the device stops receiving this account's notifications. */
export const unregisterPushToken = onCall(async (request) => {
  const { uid, token } = signedIn(request)
  const ref = getFirestore().collection('pushTokens').doc(tokenId(token))
  const doc = await ref.get()
  if (doc.exists && doc.get('userId') === uid) await ref.delete()
  return { ok: true }
})
