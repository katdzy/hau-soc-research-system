// Shared by spawn-live.mjs (the command line) and devServer.mjs (the test
// panel's Spawn on a live project): admin access to the project, the rule for
// what counts as dummy data, and the write that makes or removes real logins
// with their records.
//
// Dummy data is what the spawner made: accounts with `spawned` and `demo` on
// `test.` addresses, sections and groups with `spawned`, and the memberships,
// assignments, drafts and history that belong to them. Nothing else may be
// changed or deleted here; a change that touches anything else is refused whole.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/** `.env` as a plain object (the project's keys). */
export function readEnv(root) {
  const file = new URL('.env', root)
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
  )
}

/**
 * firebase-admin for the project in .env (or the emulators, when
 * FIRESTORE_EMULATOR_HOST is set). Throws with the setup steps when the
 * service-account key is missing.
 */
export function connect(root, projectFromEnv = readEnv(root).VITE_FIREBASE_PROJECT_ID) {
  // firebase-admin is a dependency of functions/, not of the app.
  const require = createRequire(new URL('functions/package.json', root))
  const { initializeApp, getApps, cert } = require('firebase-admin/app')
  const { getAuth } = require('firebase-admin/auth')
  const { getFirestore } = require('firebase-admin/firestore')

  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  if (emulated && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is set but FIREBASE_AUTH_EMULATOR_HOST is not; refusing to mix the emulator with live Auth.')
  }
  const projectId = emulated ? (process.env.GCLOUD_PROJECT ?? 'demo-local') : projectFromEnv
  if (!projectId) throw new Error('No VITE_FIREBASE_PROJECT_ID in .env.')
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? new URL('.secrets/service-account.json', root).pathname
  if (!emulated && !existsSync(keyFile)) {
    throw new Error([
      `No admin credentials at ${keyFile}. In the Firebase console for ${projectId}: Project settings →`,
      'Service accounts → Generate new private key, and save the file as .secrets/service-account.json (gitignored).',
    ].join('\n'))
  }
  const app = getApps().find(a => a.name === 'live-spawn') ?? initializeApp(
    { projectId, ...(emulated ? {} : { credential: cert(JSON.parse(readFileSync(keyFile, 'utf8'))) }) },
    'live-spawn',
  )
  const db = getFirestore(app)
  if (!configured.has(db)) {
    try { db.settings({ ignoreUndefinedProperties: true }) } catch (e) {
      // Already set by an earlier copy of this module (a server that predates the mark above).
      if (!/already been initialized/.test(e.message)) throw e
    }
    configured.add(db)
  }
  return { db, auth: getAuth(app), projectId, emulated }
}
// settings() may be called once per Firestore instance; the dev server connects per request.
// Kept on globalThis: when Vite restarts the dev server it loads this module again,
// but firebase-admin (a require()d module) and its Firestore instance live on.
const configured = (globalThis[Symbol.for('hausoc.liveSpawn.configured')] ??= new WeakSet())

// The example in the docs, and passwords anyone would try first.
const PLACEHOLDERS = ['your-password-here', 'choose-one-8+', 'password', 'password1', '12345678', 'test1234']

/** Why `password` will not do for the dummy logins, or null. */
export function passwordProblem(password) {
  if (!password || password.length < 8) return 'The test password needs at least 8 characters; every dummy login gets it.'
  if (PLACEHOLDERS.includes(password.toLowerCase())) return `"${password}" is a placeholder — choose a password of your own.`
  return null
}

/* --- What counts as dummy data --------------------------------------------------------- */

const OWN = ['users', 'sections', 'projects']
// Records that belong to a project (and, for memberships and assignments, a person).
const PROJECT_SCOPED = ['projectMembers', 'projectAssignments', 'documents', 'annotations', 'reviews', 'aiSummaries',
  'weeklyLogs', 'defenses', 'forms', 'workflowHistory', 'permissionOverrides']
const ALLOWED = [...OWN, ...PROJECT_SCOPED, 'groupDrafts']
const MAX_CHANGES = 500

const isDummyRow = (collection, row) => {
  if (!row) return false
  if (collection === 'users') return Boolean(row.spawned && row.demo && /^test\./.test(row.email ?? ''))
  return Boolean(row.spawned)
}

// A section the panel did not make — the old §6 seed's WD-401, say — may still
// change hands, so its groups can be approved by someone who can sign in: the
// instructor alone changes, from a seed (demo) account or nobody to a dummy
// account or nobody. A section a real faculty member teaches is never touched.
const SWAP_IGNORES = ['id', 'instructorId']
const sameApartFromInstructor = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter(k => !SWAP_IGNORES.includes(k)))
  return [...keys].every(k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null))
}

/**
 * Refuses (throws) unless every change touches dummy data only: a new row must
 * be dummy data, an updated or deleted one must be dummy data now (and stay it).
 * The one exception is an instructor swap on a seed section (above), which is
 * marked `patch: { instructorId }` so applyChanges writes that field alone.
 * Reads the current documents itself — the caller's copy is not trusted.
 */
export async function checkChanges(db, changes) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('Nothing to change.')
  if (changes.length > MAX_CHANGES) throw new Error(`Too many changes at once (${changes.length}; at most ${MAX_CHANGES}).`)
  for (const c of changes) {
    delete c.patch // only this check sets it
    if (!ALLOWED.includes(c.collection)) throw new Error(`Refusing: the spawner does not write ${c.collection}.`)
    if (typeof c.id !== 'string' || !c.id || c.id.includes('/')) throw new Error('Refusing: a change has no valid id.')
    if (!['create', 'update', 'delete'].includes(c.kind)) throw new Error(`Refusing: unknown change "${c.kind}".`)
    if (c.kind !== 'delete' && (typeof c.row !== 'object' || c.row === null)) throw new Error(`Refusing: ${c.collection}/${c.id} has no data.`)
  }

  const refs = changes.map(c => db.collection(c.collection).doc(c.id))
  const current = new Map((await db.getAll(...refs)).map((s, i) => [`${changes[i].collection}/${changes[i].id}`, s.exists ? s.data() : null]))
  const incoming = new Map(changes.filter(c => c.kind !== 'delete').map(c => [`${c.collection}/${c.id}`, c.row]))

  // Owners looked up on demand: this request's own rows first, then the store.
  const cache = new Map()
  async function dummy(collection, id) {
    if (!id) return false
    const key = `${collection}/${id}`
    if (incoming.has(key)) return isDummyRow(collection, incoming.get(key))
    if (!cache.has(key)) {
      const s = await db.collection(collection).doc(id).get()
      cache.set(key, s.exists ? isDummyRow(collection, s.data()) : false)
    }
    return cache.get(key)
  }
  async function owned(collection, row) {
    if (!row) return false
    if (OWN.includes(collection)) return isDummyRow(collection, row)
    if (collection === 'groupDrafts') return (await dummy('sections', row.sectionId)) || (await dummy('projects', row.projectId))
    // A dummy group's records, or a dummy person's seat on any group.
    return (await dummy('projects', row.projectId)) ||
      (['projectMembers', 'projectAssignments'].includes(collection) && (await dummy('users', row.userId)))
  }

  /** A seed (demo) account, or a dummy one — anyone but a real person. */
  async function demoUser(id) {
    if (!id) return true
    if (await dummy('users', id)) return true
    const s = await db.collection('users').doc(id).get()
    return s.exists && s.data().demo === true
  }
  async function instructorSwap(c, now) {
    if (c.collection !== 'sections' || c.kind !== 'update' || (await owned('sections', now))) return false
    if (!sameApartFromInstructor(now, c.row)) return false
    const to = c.row.instructorId ?? null
    if (to === (now.instructorId ?? null)) return false
    if (to && !(await dummy('users', to))) throw new Error(`Refusing: ${c.row.block ?? c.id} can only be handed to a spawned faculty member.`)
    if (!(await demoUser(now.instructorId))) throw new Error(`Refusing: ${c.row.block ?? c.id} is taught by a real account.`)
    return true
  }

  for (const c of changes) {
    const key = `${c.collection}/${c.id}`
    const now = current.get(key)
    if (c.kind === 'create' && now) throw new Error(`Refusing: ${key} already exists.`)
    if (c.kind !== 'create' && !now) throw new Error(`Refusing: ${key} does not exist.`)
    if (await instructorSwap(c, now)) { c.patch = { instructorId: c.row.instructorId ?? null }; continue }
    if (c.kind !== 'create' && !(await owned(c.collection, now))) throw new Error(`Refusing: ${key} is not dummy data.`)
    if (c.kind !== 'delete' && !(await owned(c.collection, c.row))) throw new Error(`Refusing: ${key} would not be dummy data.`)
    if (c.kind === 'update' && c.collection === 'users' && c.row.email !== now.email) throw new Error(`Refusing: ${key} would change its email.`)
  }
}

/* --- The write ------------------------------------------------------------------------- */

/**
 * Logins first (email verified, `password`), then the records in batches, then
 * the logins of removed accounts. A failure takes back the logins it made.
 * Call checkChanges first.
 */
export async function applyChanges(db, auth, changes, password) {
  const newUsers = changes.filter(c => c.collection === 'users' && c.kind === 'create').map(c => c.row)
  const goneUsers = changes.filter(c => c.collection === 'users' && c.kind === 'delete')
  if (newUsers.length && passwordProblem(password)) throw new Error(passwordProblem(password))
  for (const u of newUsers) {
    const taken = await auth.getUserByEmail(u.email).then(() => true, (e) => {
      if (e.code === 'auth/user-not-found') return false
      throw e
    })
    if (taken) throw new Error(`Refusing: ${u.email} already has a Firebase Auth login.`)
  }
  // The deleted accounts' addresses, read before their records go.
  const goneEmails = []
  for (const c of goneUsers) {
    const s = await db.collection('users').doc(c.id).get()
    if (s.exists) goneEmails.push(s.data().email)
  }

  const created = []
  try {
    for (const u of newUsers) {
      const r = await auth.createUser({ email: u.email, password, emailVerified: true, displayName: u.name })
      created.push(r.uid)
    }
    const BATCH_LIMIT = 400
    for (let i = 0; i < changes.length; i += BATCH_LIMIT) {
      const batch = db.batch()
      for (const c of changes.slice(i, i + BATCH_LIMIT)) {
        const ref = db.collection(c.collection).doc(c.id)
        // create() fails rather than overwrite a document that appeared meanwhile.
        if (c.kind === 'create') batch.create(ref, c.row)
        else if (c.patch) batch.update(ref, c.patch) // seed section: the instructor only
        else if (c.kind === 'update') batch.set(ref, c.row)
        else batch.delete(ref)
      }
      await batch.commit()
    }
  } catch (e) {
    if (created.length) await auth.deleteUsers(created).catch(() => {})
    throw new Error(`${e.message}${created.length ? ` (removed the ${created.length} login(s) made before the failure)` : ''}`)
  }

  let removedLogins = 0
  for (const email of goneEmails) {
    const login = await auth.getUserByEmail(email).catch(() => null)
    if (login) { await auth.deleteUser(login.uid); removedLogins++ }
  }
  return {
    created: changes.filter(c => c.kind === 'create').length,
    updated: changes.filter(c => c.kind === 'update').length,
    deleted: changes.filter(c => c.kind === 'delete').length,
    logins: created.length,
    removedLogins,
    newUsers,
    goneIds: goneUsers.map(c => c.id),
  }
}

/* --- The list the test panel's People tab reads on a live project ----------------------- */

const LIST = 'src/dev/live-accounts.json'
const listRow = ({ id, name, email, globalRoles, programScope, block }) => ({ id, name, email, globalRoles, programScope, block })
const writeList = (root, rows) => writeFileSync(new URL(LIST, root),
  `${JSON.stringify([...rows].sort((a, b) => a.email.localeCompare(b.email)), null, 2)}\n`)

/** Replace the list with the dummy accounts among `users`. */
export function saveList(root, users) {
  writeList(root, users.filter(u => isDummyRow('users', u)).map(listRow))
}

/** Add and drop accounts in the list after a write. */
export function updateList(root, { newUsers = [], goneIds = [] }) {
  if (!newUsers.length && !goneIds.length) return
  const file = new URL(LIST, root)
  const rows = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const gone = new Set([...goneIds, ...newUsers.map(u => u.id)])
  writeList(root, [...rows.filter(r => !gone.has(r.id)), ...newUsers.map(listRow)])
}
