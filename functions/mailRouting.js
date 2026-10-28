/**
 * Who an outbox email may actually reach (deliverOutbox, index.js). Pure, so
 * the root Vitest suite tests it (src/__tests__/mailRouting.test.js).
 *
 * The seeded accounts — the §6 personas and the NPCs (`demo: true`,
 * src/backend/seed.js, npcs.js) — carry real-looking addresses on the
 * university's own domains, which may belong to real people. They are never
 * emailed. With MAIL_REDIRECT_TO set (functions/.env), their mail goes to that
 * one inbox instead, saying whom it was for; without it, it is skipped. Every
 * other address is delivered as written.
 */

const norm = (email) => String(email ?? '').trim().toLowerCase()

/**
 * → { direct, redirectedFor, skipped } — addresses to send to as they are,
 * demo addresses whose mail goes to `redirectTo`, and demo addresses dropped
 * because no redirect inbox is set.
 */
export function routeMail(to = [], demoAddresses = new Set(), redirectTo = '') {
  const demo = new Set([...demoAddresses].map(norm))
  const inbox = norm(redirectTo)
  const direct = []
  const held = []
  for (const address of new Set(to.map(norm).filter(Boolean))) {
    (demo.has(address) ? held : direct).push(address)
  }
  return inbox ? { direct, redirectedFor: held, skipped: [] } : { direct, redirectedFor: [], skipped: held }
}

/** The one email the redirect inbox gets for a message to demo accounts. */
export function redirectedMail(mail, redirectedFor, redirectTo) {
  const names = redirectedFor.join(', ')
  return {
    ...mail,
    to: [norm(redirectTo)],
    subject: `[Demo → ${names}] ${mail.subject ?? ''}`.trim(),
    body: `Sent to this inbox instead of the demo account(s) ${names} (MAIL_REDIRECT_TO).\n\n${mail.body ?? ''}`,
  }
}

// Firestore `in` queries take at most 30 values.
const chunk = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** Which of these addresses belong to seeded (demo) accounts. `db`: the Admin SDK's Firestore. */
export async function demoAddressesOf(db, to = []) {
  const found = new Set()
  const addresses = [...new Set(to.map(norm).filter(Boolean))]
  for (const ids of chunk(addresses, 30)) {
    const snap = await db.collection('users').where('email', 'in', ids).get()
    snap.forEach(d => { if (d.get('demo') === true) found.add(norm(d.get('email'))) })
  }
  return found
}

/**
 * The emails one outbox entry becomes: → { route, messages } — `messages` are
 * what to send (as written to real addresses, and one to the redirect inbox
 * for demo accounts); held demo addresses with no inbox set are in
 * route.skipped and get nothing.
 */
export async function planEmail(db, mail, redirectTo = '') {
  const route = routeMail(mail.to ?? [], await demoAddressesOf(db, mail.to ?? []), redirectTo)
  const messages = []
  if (route.direct.length) messages.push({ ...mail, to: route.direct })
  if (route.redirectedFor.length) messages.push(redirectedMail(mail, route.redirectedFor, redirectTo))
  return { route, messages }
}
