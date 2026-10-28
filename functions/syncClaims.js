/**
 * Recomputes one account's custom claims (claims.js) and writes them to its
 * Firebase Auth user. Takes the Admin SDK's Firestore and Auth, so
 * rules-tests/claims.sync.test.js can run it against the emulators.
 *
 * The app's `users` documents and Auth accounts are linked by email: an
 * account registers in Auth first (SignIn.jsx), then gets its `users` row.
 * After a change, `claimsSync/{uid}` is touched so the signed-in app refreshes
 * its ID token (src/services/claims.js) — otherwise the old claims hold for up
 * to an hour.
 */
import { buildClaims, sameClaims } from './claims.js'

const normalizeEmail = (email = '') => String(email ?? '').trim().toLowerCase()

const rows = async (query) => (await query.get()).docs.map(d => ({ id: d.id, ...d.data() }))

async function authUserFor(auth, email) {
  if (!email) return null
  try {
    return await auth.getUserByEmail(email)
  } catch (e) {
    if (e?.code === 'auth/user-not-found') return null
    throw e
  }
}

async function stagesOf(db, projectIds) {
  if (!projectIds.length) return {}
  const docs = await db.getAll(...projectIds.map(id => db.collection('projects').doc(id)))
  return Object.fromEntries(docs.filter(d => d.exists).map(d => [d.id, d.get('currentStage')]))
}

/**
 * → { status: 'updated' | 'unchanged' | 'no-auth-user' | 'no-account', uid?, claims?, dropped? }
 * `userId` is the `users` document id.
 */
export async function syncClaims({ db, auth, log = console }, userId) {
  if (!userId) return { status: 'no-account' }
  const doc = await db.collection('users').doc(userId).get()
  const user = doc.exists ? { id: doc.id, ...doc.data() } : null
  if (!user) return { status: 'no-account' }

  const authUser = await authUserFor(auth, normalizeEmail(user.email))
  if (!authUser) return { status: 'no-auth-user' }

  const [members, assignments, overrides] = await Promise.all([
    rows(db.collection('projectMembers').where('userId', '==', userId)),
    rows(db.collection('projectAssignments').where('userId', '==', userId)),
    rows(db.collection('permissionOverrides').where('userId', '==', userId)),
  ])
  const input = { user, members, assignments, overrides }
  let { claims, dropped } = buildClaims(input)
  if (dropped.length) {
    // Only now is it worth reading the projects: to drop archived ones first.
    const ids = [...new Set([...members, ...assignments].map(r => r.projectId).filter(Boolean))]
    ;({ claims, dropped } = buildClaims({ ...input, stages: await stagesOf(db, ids) }))
    log.error?.('Custom claims over 1000 bytes; projects left out', { userId, dropped })
  }

  if (sameClaims(authUser.customClaims, claims)) return { status: 'unchanged', uid: authUser.uid, claims, dropped }
  await auth.setCustomUserClaims(authUser.uid, claims)
  await db.collection('claimsSync').doc(authUser.uid).set({ userId, at: new Date().toISOString() })
  return { status: 'updated', uid: authUser.uid, claims, dropped }
}

/**
 * A `users` row was deleted, or its email changed: the Auth account it was
 * linked to (by `email`) must not keep that row's roles. → 'cleared' |
 * 'unchanged' | 'no-auth-user'
 */
export async function clearClaims({ db, auth }, email) {
  const authUser = await authUserFor(auth, normalizeEmail(email))
  if (!authUser) return { status: 'no-auth-user' }
  if (!authUser.customClaims || !Object.keys(authUser.customClaims).length) return { status: 'unchanged', uid: authUser.uid }
  await auth.setCustomUserClaims(authUser.uid, null)
  await db.collection('claimsSync').doc(authUser.uid).set({ userId: null, at: new Date().toISOString() })
  return { status: 'cleared', uid: authUser.uid }
}

/** The `users` id for an Auth account, by its email, or null. */
export async function userIdForEmail(db, email) {
  const e = normalizeEmail(email)
  if (!e) return null
  const snap = await db.collection('users').where('email', '==', e).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
}
