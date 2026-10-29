/**
 * Cloud Functions for the Firebase build: every write the app makes (`act`,
 * running src/services/actions.js — bundled into lib/app.js by
 * scripts/functions/build.mjs), notification delivery (email + push), and the
 * custom claims firestore.rules / storage.rules read (claims.js,
 * syncClaims.js — tested by npm test, npm run test:rules and, on the Functions
 * emulator, npm run test:triggers and npm run test:act).
 *
 * Not deployed yet: Cloud Functions need the Blaze (pay-as-you-go) plan, and
 * FCM delivery is not emulated, so push cannot be exercised on the emulators.
 * Before `firebase deploy --only functions`:
 *   firebase functions:secrets:set RESEND_API_KEY
 *   MAIL_FROM in functions/.env (a sender on a domain verified in Resend)
 *   MAIL_REDIRECT_TO in functions/.env (optional): an inbox you control for
 *     mail to the seeded demo accounts — never sent to their own addresses,
 *     which are on the university's domains (mailRouting.js). Unset: that
 *     mail is not sent at all.
 */
import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { auth as authV1 } from 'firebase-functions/v1'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { syncClaims, clearClaims, userIdForEmail } from './syncClaims.js'
import { planEmail } from './mailRouting.js'

initializeApp()

// Set by the Emulator Suite, never in a deployed function.
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true'

// Emulator only: the runtime has now and then printed MaxListenersExceededWarning
// during `act`, which no test outside it reproduces (store.js already reads a few
// collections at a time). Log where it comes from, so it can be fixed there.
if (EMULATOR) {
  process.on('warning', (w) => {
    if (w.name === 'MaxListenersExceededWarning') logger.warn('MaxListenersExceededWarning', { message: w.message, stack: w.stack })
  })
}

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const MAIL_FROM = defineString('MAIL_FROM', { default: 'HAU-SOC Capstone <no-reply@example.com>' })
// One inbox you control for mail addressed to the seeded demo accounts
// (mailRouting.js). Empty: their mail is not sent at all.
const MAIL_REDIRECT_TO = defineString('MAIL_REDIRECT_TO', { default: '' })

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

  // Data-only message: public/sw-notify.js shows it. Only a general line, so a
  // verdict or a return is not readable on a locked phone (copy of
  // src/deviceNotice.js lockScreenText); the email carries the details.
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    data: {
      title: 'HAU-SOC Capstone',
      body: mail.projectId ? 'Update on your capstone project' : 'Update on your account',
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

/** The email: real addresses as written; demo accounts' mail to MAIL_REDIRECT_TO, or nowhere (mailRouting.js). */
async function deliverEmail(db, mail) {
  const { route, messages } = await planEmail(db, mail, MAIL_REDIRECT_TO.value())
  const sent = (await Promise.allSettled(messages.map(sendEmail))).map(outcome)
  const status = sent.some(x => x.status === 'sent') ? 'sent'
    : sent.some(x => x.status === 'failed') ? 'failed' : 'skipped'
  return { status, sent, direct: route.direct, redirectedFor: route.redirectedFor, skippedDemo: route.skipped }
}

const outcome = (r) => (r.status === 'fulfilled' ? r.value : { status: 'failed', error: String(r.reason?.message ?? r.reason) })

/**
 * Notification delivery (R6c + DEVICE_NOTIFICATIONS, revision 2026-10-07). Every
 * email notify() records in `outbox` goes out once, from here: the email through
 * Resend and a general notice for the same event as a push through FCM. One channel
 * failing never stops the other; the result of each is kept on the entry.
 */
export const deliverOutbox = onDocumentCreated({ document: 'outbox/{mailId}', secrets: [RESEND_API_KEY] }, async (event) => {
  const mail = event.data?.data()
  if (!mail) return
  const db = getFirestore()
  // On the emulators nothing leaves the machine: the seed's addresses are real
  // university accounts.
  if (EMULATOR) {
    const skipped = { status: 'skipped', reason: 'emulator' }
    await event.data.ref.update({ delivery: { email: skipped, push: skipped, at: FieldValue.serverTimestamp() } })
    return
  }
  const [email, push] = await Promise.allSettled([deliverEmail(db, mail), sendPush(db, mail, event.params.mailId)])
  const delivery = { email: outcome(email), push: outcome(push), at: FieldValue.serverTimestamp() }
  await event.data.ref.update({ delivery })
  logger.info('deliverOutbox', { mailId: event.params.mailId, email: delivery.email.status, push: delivery.push.status })
})

// The caller's `users` id, from the custom claims (claims.js) — not the Auth
// uid: outbox entries name recipients by `users` id, and deliverOutbox finds
// their devices by it.
const signedIn = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const userId = request.auth.token.userId
  if (!userId) throw new HttpsError('failed-precondition', 'Your account is not set up yet. Sign out and in again.')
  const token = request.data?.token
  if (typeof token !== 'string' || !token || token.length > 4096) throw new HttpsError('invalid-argument', 'A device token is required.')
  return { uid: userId, token }
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

// --- Custom claims (syncClaims.js) -------------------------------------------
// firestore.rules and storage.rules decide reads from the caller's claims.
// Whatever changes who someone is — their account, a membership, an
// assignment, an override — recomputes the claims of each account it names.

const admin = () => ({ db: getFirestore(), auth: getAuth(), log: logger })

async function resync(userIds, why) {
  const ids = [...new Set(userIds.filter(Boolean))]
  const results = await Promise.allSettled(ids.map(id => syncClaims(admin(), id)))
  results.forEach((r, i) => {
    if (r.status === 'rejected') logger.error('syncClaims failed', { userId: ids[i], why, error: String(r.reason?.message ?? r.reason) })
    else if (r.value.status === 'updated') logger.info('claims updated', { userId: ids[i], why, dropped: r.value.dropped })
  })
}

const namedIn = (event) => [event.data?.before?.get('userId'), event.data?.after?.get('userId')]

// The fields of a `users` document the claims depend on; other edits skip the sync.
const CLAIM_FIELDS = ['email', 'status', 'emailVerified', 'globalRoles', 'programScope']
const changed = (before, after) => CLAIM_FIELDS.some(f => JSON.stringify(before?.[f]) !== JSON.stringify(after?.[f]))

export const claimsOnUser = onDocumentWritten('users/{userId}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!changed(before, after)) return
  // Deleted, or moved to another address: the Auth account found by the old
  // email keeps nothing of this row.
  if (before?.email && before.email !== after?.email) {
    const r = await clearClaims(admin(), before.email).catch(e => ({ status: 'failed', error: String(e?.message ?? e) }))
    if (r.status === 'cleared' || r.status === 'failed') logger.info('claims cleared', { userId: event.params.userId, ...r })
  }
  if (after) await resync([event.params.userId], 'users')
})

export const claimsOnMember = onDocumentWritten('projectMembers/{id}', (event) => resync(namedIn(event), 'projectMembers'))
export const claimsOnAssignment = onDocumentWritten('projectAssignments/{id}', (event) => resync(namedIn(event), 'projectAssignments'))
export const claimsOnOverride = onDocumentWritten('permissionOverrides/{id}', (event) => resync(namedIn(event), 'permissionOverrides'))

/** An Auth account created after its `users` row (or for an address the app already knows). */
export const claimsOnSignUp = authV1.user().onCreate(async (user) => {
  await resync([await userIdForEmail(getFirestore(), user.email)], 'auth.onCreate')
})

/** The signed-in caller's own claims, recomputed now — the app calls it after sign-in. */
export const refreshClaims = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const userId = await userIdForEmail(getFirestore(), request.auth.token.email)
  if (!userId) return { status: 'no-account' }
  const { status } = await syncClaims(admin(), userId)
  return { status }
})

// --- Writes (src/services/api.js → act) --------------------------------------
// firestore.rules deny every client write. The app sends each service call
// here instead; it runs the same code as the local build (guard, stage gates,
// audit, history, notifications) on data read inside a Firestore transaction,
// as the caller the ID token names.

// The bundled service code, loaded on the first call (lib/app.js is built by
// scripts/functions/build.mjs; firebase.json runs it before a deploy).
const app = () => import('./lib/app.js')

// The Emulator Suite only: the dev panel's personas are not Auth accounts, so
// a call from the demo names its persona instead.

function callerOf(request) {
  const token = request.auth?.token
  if (token) return { userId: token.userId ?? null, email: token.email ?? null, emailVerified: token.email_verified === true }
  if (EMULATOR && typeof request.data?.as === 'string') return { userId: request.data.as, email: null, emailVerified: false }
  return null
}

// One request per instance: the service code keeps the snapshot and the
// session as module state (functions/app/store.js).
export const act = onCall({ concurrency: 1, memory: '512MiB', timeoutSeconds: 120 }, async (request) => {
  const { runAction, Refusal } = await app()
  const { name, args } = request.data ?? {}
  try {
    return { result: (await runAction({ caller: callerOf(request), name, args })) ?? null }
  } catch (e) {
    if (e instanceof Refusal) {
      if (e.code === 'internal') logger.error('act failed', { name, error: String(e.cause ?? e) })
      throw new HttpsError(e.code, e.message)
    }
    logger.error('act failed', { name, error: String(e?.stack ?? e) })
    throw new HttpsError('internal', 'Something went wrong on the server. Try again.')
  }
})

/** S8.2 — revisions past their deadline, every hour (the local build runs it in the open tab). */
export const overdueRevisions = onSchedule('every 60 minutes', async () => {
  const { flagOverdue } = await app()
  await flagOverdue()
})
