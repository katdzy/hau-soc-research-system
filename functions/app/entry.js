/**
 * The service code (src/services/actions.js) as the `act` Cloud Function runs
 * it. Bundled with the browser-only parts swapped out
 * (scripts/functions/build.mjs → functions/lib/app.js).
 *
 * runAction({ caller, name, args }) runs one call from src/services/api.js:
 * the same guard (CAAC), stage gates, audit, history and notifications as the
 * local build, on a snapshot read inside a Firestore transaction, as the
 * caller the ID token names — never the `actor` the browser holds.
 */
import * as actions from '../../src/services/actions.js'
import { REMOTE } from '../../src/services/remote.js'
import { setSessionUserId } from '../../src/state/session.js'
import { AccessDenied } from '../../src/domain/caac.js'
import { normalizeEmail } from '../../src/domain/constants.js'
import { withStore, store } from './store.js'

export { REMOTE }
export { buildSeed } from '../../src/backend/seed.js'
export { COLLECTIONS } from '../../src/backend/schema.js'

/** An error the browser shows as it is: { code, message } for HttpsError. */
export class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code }
}

// Programming errors are not the caller's to read; everything else the
// services throw is a message written for them.
const BUGS = [TypeError, ReferenceError, RangeError, SyntaxError]

export function refusalOf(e) {
  if (e instanceof Refusal) return e
  if (e instanceof AccessDenied) return new Refusal('permission-denied', e.message)
  if (BUGS.some(T => e instanceof T)) {
    return Object.assign(new Refusal('internal', 'Something went wrong on the server. Try again; if it keeps happening, tell the System Administrator.'), { cause: e?.stack ?? e })
  }
  return new Refusal('failed-precondition', e?.message ?? String(e))
}

/**
 * `caller`: { userId, email, emailVerified } from the ID token (userId from
 * the custom claims, functions/claims.js), or null when signed out.
 */
export async function runAction({ caller, name, args = [] }) {
  const shape = Object.hasOwn(REMOTE, name) ? REMOTE[name] : null
  if (!shape || typeof actions[name] !== 'function') throw new Refusal('invalid-argument', `Unknown action "${name}".`)
  if (!Array.isArray(args)) throw new Refusal('invalid-argument', 'Arguments must be a list.')

  if (shape === 'actor' && !caller?.userId) {
    throw new Refusal('unauthenticated', 'Sign in again — your session has no account attached yet.')
  }
  if (shape === 'register' && (!caller?.email || normalizeEmail(caller.email) !== normalizeEmail(args[0]?.email))) {
    throw new Refusal('permission-denied', 'Register with the address you signed up with.')
  }
  if (shape === 'verified' && (!caller?.emailVerified || normalizeEmail(caller.email) !== normalizeEmail(args[0]))) {
    throw new Refusal('permission-denied', 'Verify this address first.')
  }

  // Most calls name their project first (projectId, …); the store then reads
  // that project's content only.
  const projectId = shape === 'actor' && typeof args[0] === 'string' ? args[0] : null
  try {
    return await withStore(async () => {
      setSessionUserId(shape === 'actor' ? caller.userId : null)
      try {
        const fn = actions[name]
        if (shape === 'actor') {
          const me = store.snapshot().users.find(u => u.id === caller.userId) ?? { id: caller.userId }
          return await fn(me, null, ...args)
        }
        if (shape === 'register') return await fn(null, ...args)
        return await fn(...args)
      } finally {
        setSessionUserId(null)
      }
    }, { projectId })
  } catch (e) {
    throw refusalOf(e)
  }
}

/** The overdue-revision check (S8.2), on a schedule instead of in a browser tab. */
export const flagOverdue = (at = Date.now()) => withStore(() => actions.flagOverdueRevisions(at))
