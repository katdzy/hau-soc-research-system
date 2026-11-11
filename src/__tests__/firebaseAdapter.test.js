// The Firestore adapter against a fake Firestore: no network, no project.
// Guards the two bugs that made the Firebase build slow and lose annotations:
// the app was told "ready" with an empty store (and reseeded it), and every
// write was its own server round trip.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COLLECTIONS } from '../backend/schema.js'

const fake = vi.hoisted(() => ({
  listeners: new Map(), // collection → onNext
  attached: 0,          // onSnapshot calls, across re-attaches
  auth: { currentUser: null, authStateReady: async () => {} },
  onToken: null,        // the adapter's onIdTokenChanged callback
  commits: [],          // one entry per batch.commit(): the writes it carried
  failNextCommit: false,
}))

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  getAuth: () => fake.auth,
  connectAuthEmulator: () => {},
  onIdTokenChanged: (_auth, fn) => { fake.onToken = fn; return () => {} },
}))
vi.mock('firebase/firestore', () => {
  let n = 0
  return {
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    connectFirestoreEmulator: () => {},
    collection: (_db, name) => ({ name }),
    doc: (_db, name, id) => ({ name, id: id ?? `auto${++n}` }),
    onSnapshot: (ref, options, onNext) => { fake.attached++; fake.listeners.set(ref.name, onNext ?? options); return () => {} },
    writeBatch: () => {
      const writes = []
      return {
        set: (ref, data) => writes.push({ op: 'set', ...ref, data }),
        update: (ref, data) => writes.push({ op: 'update', ...ref, data }),
        delete: (ref) => writes.push({ op: 'delete', ...ref }),
        commit: async () => {
          fake.commits.push(writes)
          if (fake.failNextCommit) { fake.failNextCommit = false; throw new Error('permission-denied') }
        },
      }
    },
    getDoc: async () => ({ exists: () => false }),
    getDocs: async () => ({ docs: [] }),
  }
})

const deliver = (name, docs, fromCache = false) => fake.listeners.get(name)({
  docs: docs.map(d => ({ id: d.id, data: () => d })),
  empty: docs.length === 0,
  metadata: { fromCache },
})
const tick = () => new Promise(r => setTimeout(r, 5))
// A signed-in Auth user whose ID token carries `claims` (a fresh iat each read, like a refresh).
const signedIn = (uid, claims = {}) => ({
  uid,
  getIdTokenResult: async () => ({ claims: { user_id: uid, iat: Math.random(), exp: Math.random(), ...claims } }),
})
// The adapter starts asynchronously; wait for its listeners, not a fixed delay.
const started = () => vi.waitFor(() => expect(fake.listeners.size).toBe(COLLECTIONS.length))

let db
beforeEach(async () => {
  vi.resetModules()
  fake.listeners.clear()
  fake.commits.length = 0
  fake.attached = 0
  fake.auth.currentUser = null
  db = (await import('../backend/firebaseAdapter.js')).firebaseAdapter
})

describe('firebase adapter', () => {
  it('does not report the store until every collection has loaded from the server', async () => {
    const seen = []
    db.subscribe(s => seen.push(s))
    await started()
    expect(seen).toHaveLength(0)

    // An empty cache is not an empty project.
    COLLECTIONS.forEach(c => deliver(c, [], true))
    await tick()
    expect(seen).toHaveLength(0)

    COLLECTIONS.forEach(c => deliver(c, c === 'users' ? [{ id: 'u1', name: 'A' }] : []))
    await tick()
    // One notification for the whole burst, with the data in it.
    expect(seen).toHaveLength(1)
    expect(seen[0].users).toEqual([{ id: 'u1', name: 'A' }])
  })

  it('sends a transaction as one batch, and shows its writes to reads inside it', async () => {
    db.subscribe(() => {})
    await started()
    COLLECTIONS.forEach(c => deliver(c, c === 'projects' ? [{ id: 'p1', currentStage: 'A' }] : []))

    const result = await db.transaction(async () => {
      const row = await db.add('annotations', { projectId: 'p1', text: 'note', stray: undefined })
      await db.update('projects', 'p1', { currentStage: 'B' })
      await db.add('auditLogs', { action: 'ANNOTATION_ADDED' })
      // Mid-transaction reads see the staged writes (services re-read the bundle).
      expect(db.snapshot().annotations.map(a => a.id)).toEqual([row.id])
      expect(db.snapshot().projects[0].currentStage).toBe('B')
      expect(await db.get('annotations', row.id)).toMatchObject({ text: 'note' })
      return row
    })

    expect(fake.commits).toHaveLength(1)
    expect(fake.commits[0].map(w => `${w.op}:${w.name}`)).toEqual(['set:annotations', 'update:projects', 'set:auditLogs'])
    expect(result.id).toBeTruthy()
  })

  it('keeps nothing when the callback throws or the server rejects the batch', async () => {
    db.subscribe(() => {})
    await started()
    COLLECTIONS.forEach(c => deliver(c, []))

    await expect(db.transaction(async () => {
      await db.add('annotations', { text: 'x' })
      throw new Error('guard said no')
    })).rejects.toThrow('guard said no')
    expect(fake.commits).toHaveLength(0)
    expect(db.snapshot().annotations).toEqual([])

    fake.failNextCommit = true
    await expect(db.add('annotations', { text: 'y' })).rejects.toThrow('permission-denied')
    expect(db.snapshot().annotations).toEqual([])
  })

  it('refuses to update a document that does not exist, like the local adapter', async () => {
    db.subscribe(() => {})
    await started()
    COLLECTIONS.forEach(c => deliver(c, []))
    await expect(db.update('projects', 'nope', { x: 1 })).rejects.toThrow('projects/nope not found')
  })

  it('attaches its listeners again when the signed-in account changes, and says when that account has loaded', async () => {
    const N = COLLECTIONS.length
    db.subscribe(() => {})
    await started()
    COLLECTIONS.forEach(c => deliver(c, []))
    await tick()
    expect(fake.attached).toBe(N)

    // Signing in: the signed-out listeners were refused, so they are attached again.
    let settled = false
    fake.auth.currentUser = signedIn('auth1', { email_verified: true })
    fake.onToken()
    const waiting = db.authSettled('auth1').then(() => { settled = true })
    await vi.waitFor(() => expect(fake.attached).toBe(2 * N))
    await tick()
    expect(settled).toBe(false)

    COLLECTIONS.forEach(c => deliver(c, c === 'users' ? [{ id: 'u1', email: 'a@hau.edu.ph' }] : []))
    await waiting
    expect(db.snapshot().users).toEqual([{ id: 'u1', email: 'a@hau.edu.ph' }])

    // A token refresh that grants the same changes nothing.
    fake.onToken()
    await tick()
    expect(fake.attached).toBe(2 * N)
  })

  it('attaches again when the same account is verified or its claims change', async () => {
    const N = COLLECTIONS.length
    db.subscribe(() => {})
    await started()

    // Registration signs the account in before its email is verified: the
    // rules refuse it `sections`, and that listener is never retried.
    fake.auth.currentUser = signedIn('auth1', { email_verified: false })
    fake.onToken()
    await vi.waitFor(() => expect(fake.attached).toBe(2 * N))
    COLLECTIONS.forEach(c => deliver(c, []))

    // Signing in after opening the link refreshes the token; authSettled
    // re-attaches before the sign-in goes on, even if no event came yet.
    fake.auth.currentUser = signedIn('auth1', { email_verified: true })
    const waiting = db.authSettled('auth1')
    await vi.waitFor(() => expect(fake.attached).toBe(3 * N))
    COLLECTIONS.forEach(c => deliver(c, c === 'sections' ? [{ id: 's1', block: 'WD-402' }] : []))
    await waiting
    expect(db.snapshot().sections).toEqual([{ id: 's1', block: 'WD-402' }])

    // New custom claims (refreshClaims, claimsSync) count too.
    fake.auth.currentUser = signedIn('auth1', { email_verified: true, projects: { p1: ['Member'] } })
    fake.onToken()
    await vi.waitFor(() => expect(fake.attached).toBe(4 * N))
  })
})
