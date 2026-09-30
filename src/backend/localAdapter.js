// Zero-setup backend. Same repository surface as the Firestore adapter, so
// switching VITE_BACKEND=firebase changes no service or component code.
// State lives in memory and is mirrored to localStorage, which is what makes
// the prototype demo-able offline and resettable between walkthroughs.

import { COLLECTIONS, emptyStore } from './schema.js'
import { nowIso } from './clock.js'

// v2: users carry a globalRoles array; blocks live in `sections`.
// v3: §6 personas, `outbox`, adviserApprovals, verifyToken.
// v4: Topic Proposal versions carry five `topics`; reviews carry `approvedTopic`.
// v5: Program names and WD-401 / CS-301 sections; G3 is a Computer Science group.
// v6: NPC students and faculty — three groups of four per program.
// v7: No `notifications` collection — notifications are email only (`outbox`).
// v8: projects record `adviserOffices` (NEW-5: the named office sits the approval out).
const KEY = 'hausoc.db.v8'
const subscribers = new Set()

const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Tolerate collections added after a store was first written.
    return { ...emptyStore(), ...parsed }
  } catch {
    return null
  }
}

let store = load() ?? emptyStore()

// All-or-nothing writes (R7): inside `transaction`, writes stay in memory and
// are published once at the end; if the callback throws, the store is rolled
// back to where it was. Transactions queue behind one another.
let depth = 0
let backup = null
let queue = Promise.resolve()

function persist() {
  if (depth > 0) return
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* quota, private mode, Node */ }
  const snap = snapshot()
  subscribers.forEach(fn => fn(snap))
}

function snapshot() {
  // Hand out arrays; components never mutate the backing store directly.
  return Object.fromEntries(
    COLLECTIONS.map(c => [c, Object.values(store[c] ?? {})])
  )
}

export const localAdapter = {
  name: 'local',
  isSeeded: () => Object.keys(store.users ?? {}).length > 0,

  snapshot,

  subscribe(fn) {
    subscribers.add(fn)
    fn(snapshot())
    return () => subscribers.delete(fn)
  },

  async add(collection, data) {
    const id = data.id ?? uid(collection.slice(0, 4))
    const doc = { ...data, id, createdAt: data.createdAt ?? nowIso() }
    store[collection] = { ...(store[collection] ?? {}), [id]: doc }
    persist()
    return doc
  },

  async update(collection, id, patch) {
    const current = store[collection]?.[id]
    if (!current) throw new Error(`${collection}/${id} not found`)
    const doc = { ...current, ...patch, updatedAt: nowIso() }
    store[collection] = { ...store[collection], [id]: doc }
    persist()
    return doc
  },

  async remove(collection, id) {
    const next = { ...(store[collection] ?? {}) }
    delete next[id]
    store[collection] = next
    persist()
  },

  async get(collection, id) {
    return store[collection]?.[id] ?? null
  },

  async transaction(fn) {
    // Nested calls join the transaction that is already open.
    if (depth > 0) return fn()
    const run = async () => {
      depth = 1
      backup = { ...store }
      try {
        const result = await fn()
        depth = 0; backup = null
        persist()
        return result
      } catch (e) {
        store = backup
        depth = 0; backup = null
        persist()
        throw e
      }
    }
    const next = queue.then(run, run)
    queue = next.catch(() => {})
    return next
  },

  /** Bulk load used by the seeder; replaces the store wholesale. */
  async replaceAll(next) {
    store = { ...emptyStore(), ...next }
    persist()
  },

  async reset() {
    store = emptyStore()
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    persist()
  },
}
