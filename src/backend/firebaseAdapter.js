// Real Firestore backend. Enabled with VITE_BACKEND=firebase.
// `firebase` is imported dynamically so the package stays optional for anyone
// who only wants to run the local walkthrough.
//
//   npm i firebase
//   cp .env.example .env   # fill in the web app config
//   VITE_BACKEND=firebase npm run dev
//
// To run against the Firebase Emulator Suite instead of production:
//   npm i -g firebase-tools && firebase emulators:start
//   VITE_BACKEND=firebase VITE_USE_EMULATORS=true npm run dev

import { COLLECTIONS, emptyStore } from './schema.js'
import { nowIso } from './clock.js'

// What the listeners last delivered, per collection: Map<id, doc>.
const server = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()]))
// The synchronous snapshot handed to the app: arrays per collection. A
// collection's array is rebuilt only when that collection changes, so
// consumers memoised on one collection skip unrelated updates.
let mirror = Object.fromEntries(COLLECTIONS.map(c => [c, []]))
const subscribers = new Set()
// A collection counts as loaded once it has come from the server, or from the
// persistent cache with something in it. Until every collection has, the app
// is not told anything: a half-loaded store looks empty, and an empty store
// used to trigger the first-run seeder.
const loaded = new Set()
const isReady = () => loaded.size === COLLECTIONS.length
let fb = null
let starting = null

// Writes made inside `transaction` are staged here and committed as one
// batch at the end (R7). `overlay` shows them to reads in the meantime:
// Map<collection, Map<id, doc | null>>, null for a removed document.
let pending = null
let queue = Promise.resolve()
// Batches that have been sent but not yet acknowledged, kept visible until the
// listeners report them.
const committing = []

function rebuild(name) {
  const rows = new Map(server[name])
  for (const layer of [...committing, pending?.overlay].filter(Boolean)) {
    for (const [id, doc] of layer.get(name) ?? []) {
      if (doc) rows.set(id, doc)
      else rows.delete(id)
    }
  }
  mirror = { ...mirror, [name]: [...rows.values()] }
}

// Listener events arrive one collection at a time; a single write can touch
// several collections. Tell subscribers once per burst, not once per event.
let scheduled = false
function publish() {
  if (scheduled || !isReady() || pending) return
  scheduled = true
  setTimeout(() => {
    scheduled = false
    subscribers.forEach(fn => fn(mirror))
  }, 0)
}

async function start() {
  const [{ initializeApp }, firestore] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ])
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  })
  const db = firestore.initializeFirestore(app, {
    // The local adapter drops undefined fields (JSON); Firestore would reject
    // the whole write instead.
    ignoreUndefinedProperties: true,
    // A reload opens from IndexedDB at once, then catches up with the server.
    localCache: firestore.persistentLocalCache({ tabManager: firestore.persistentMultipleTabManager() }),
  })
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  fb = { app, db, ...firestore }

  // Mirror every collection locally so the UI keeps one synchronous snapshot.
  for (const name of COLLECTIONS) {
    fb.onSnapshot(fb.collection(db, name), (snap) => {
      server[name] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))
      rebuild(name)
      if (!snap.metadata.fromCache || !snap.empty) loaded.add(name)
      publish()
    }, (err) => {
      // A collection the rules keep from this account reads as empty rather
      // than holding the whole app on its loading screen.
      console.warn(`Firestore: cannot read "${name}":`, err?.code ?? err)
      loaded.add(name)
      publish()
    })
  }
  return fb
}

const init = () => (fb ? Promise.resolve(fb) : (starting ??= start()))

/** The initialised Firebase app — the file store (files.js) shares it. */
export async function firebaseApp() {
  return (await init()).app
}

/** Stage one write: visible to reads now, sent with the rest of the transaction. */
function stage(write) {
  const layer = pending.overlay.get(write.collection) ?? new Map()
  pending.overlay.set(write.collection, layer)
  layer.set(write.id, write.kind === 'remove' ? null : write.doc)
  pending.writes.push(write)
  rebuild(write.collection)
}

// Firestore caps a batch at 500 writes; a larger transaction is sent in parts
// (none of the services come close).
const BATCH_LIMIT = 450

async function commit(writes) {
  const { db, doc, writeBatch } = await init()
  const parts = []
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const w of writes.slice(i, i + BATCH_LIMIT)) {
      const ref = doc(db, w.collection, w.id)
      if (w.kind === 'set') batch.set(ref, w.doc)
      else if (w.kind === 'update') batch.update(ref, w.patch)
      else batch.delete(ref)
    }
    parts.push(batch.commit())
  }
  await Promise.all(parts)
}

export const firebaseAdapter = {
  name: 'firebase',
  isSeeded: () => (mirror.users ?? []).length > 0,
  snapshot: () => mirror,

  subscribe(fn) {
    subscribers.add(fn)
    init().then(() => { if (isReady()) fn(mirror) })
    return () => subscribers.delete(fn)
  },

  async add(collection, data) {
    if (!pending) return this.transaction(() => this.add(collection, data))
    const { db, doc, collection: col } = await init()
    const id = data.id ?? doc(col(db, collection)).id
    const payload = { ...data, id, createdAt: data.createdAt ?? nowIso() }
    stage({ kind: 'set', collection, id, doc: payload })
    return payload
  },

  async update(collection, id, patch) {
    if (!pending) return this.transaction(() => this.update(collection, id, patch))
    const current = mirror[collection]?.find(d => d.id === id)
    if (!current) throw new Error(`${collection}/${id} not found`)
    const payload = { ...patch, updatedAt: nowIso() }
    const merged = { ...current, ...payload }
    stage({ kind: 'update', collection, id, patch: payload, doc: merged })
    return merged
  },

  async remove(collection, id) {
    if (!pending) return this.transaction(() => this.remove(collection, id))
    stage({ kind: 'remove', collection, id })
  },

  async get(collection, id) {
    const staged = pending?.overlay.get(collection)
    if (staged?.has(id)) return staged.get(id)
    const { db, doc, getDoc } = await init()
    const snap = await getDoc(doc(db, collection, id))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  // All-or-nothing, like the local adapter: writes are staged, then sent as
  // one batch — one round trip instead of one per write. If the callback or
  // the commit fails, nothing is kept. In the full Firebase build this is a
  // Cloud Function running a Firestore transaction (OQ#1).
  async transaction(fn) {
    // Nested calls join the transaction that is already open.
    if (pending) return fn()
    const run = async () => {
      await init()
      const staged = pending = { writes: [], overlay: new Map() }
      try {
        const result = await fn()
        pending = null
        if (staged.writes.length) {
          // Shown now; the listeners take over once the server has the batch.
          committing.push(staged.overlay)
          publish()
          await commit(staged.writes)
        }
        return result
      } finally {
        // Done, failed or rejected: drop the staged copy. What the server
        // accepted comes back through the listeners.
        pending = null
        const i = committing.indexOf(staged.overlay)
        if (i >= 0) committing.splice(i, 1)
        staged.overlay.forEach((_, name) => rebuild(name))
        publish()
      }
    }
    const next = queue.then(run, run)
    queue = next.catch(() => {})
    return next
  },

  async replaceAll(next) {
    const { db, doc, writeBatch, getDocs, collection: col } = await init()
    for (const name of COLLECTIONS) {
      const existing = await getDocs(col(db, name))
      for (let i = 0; i < existing.docs.length; i += BATCH_LIMIT) {
        const wipe = writeBatch(db)
        existing.docs.slice(i, i + BATCH_LIMIT).forEach(d => wipe.delete(d.ref))
        await wipe.commit()
      }

      const rows = Object.values(next[name] ?? {})
      for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db)
        rows.slice(i, i + BATCH_LIMIT).forEach(r => batch.set(doc(db, name, r.id), r))
        await batch.commit()
      }
    }
  },

  async reset() {
    await this.replaceAll(emptyStore())
  },
}
