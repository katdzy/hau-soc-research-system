// Zero-setup backend. Same repository surface as the Firestore adapter, so
// switching VITE_BACKEND=firebase changes no service or component code.
// State lives in memory and is mirrored to localStorage, which is what makes
// the prototype demo-able offline and resettable between walkthroughs.

import { COLLECTIONS, emptyStore } from './schema.js'

// v2: users carry a globalRoles array; blocks live in `sections`.
const KEY = 'hausoc.db.v2'
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

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* quota, private mode */ }
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
    const doc = { ...data, id, createdAt: data.createdAt ?? new Date().toISOString() }
    store[collection] = { ...(store[collection] ?? {}), [id]: doc }
    persist()
    return doc
  },

  async update(collection, id, patch) {
    const current = store[collection]?.[id]
    if (!current) throw new Error(`${collection}/${id} not found`)
    const doc = { ...current, ...patch, updatedAt: new Date().toISOString() }
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
