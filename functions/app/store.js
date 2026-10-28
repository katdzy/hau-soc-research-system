/**
 * The store the service code (src/services) writes through inside a Cloud
 * Function — the surface of the browser adapters (add, update, remove, get,
 * transaction, snapshot) over one Firestore transaction per request.
 *
 * withStore(fn, { projectId }) reads what the services read inside the
 * transaction, runs `fn` against that snapshot in memory, then writes what
 * changed. With a projectId, a project's content (PROJECT_CONTENT) is read
 * for that project only — no action reads another project's documents,
 * reviews or logs; people, groups, assignments, overrides and settings are
 * read in full, because guards count across projects (e.g. assignment load). A write to anything it read before the commit makes Firestore run
 * it again from fresh data, so two requests never act on the same stale state
 * (version numbers, signature order, gate checks). Requests serialise; for a
 * department's capstone office that is a few at a time.
 *
 * One request at a time per instance (`concurrency: 1` on the function):
 * the snapshot and the signed-in session are module state.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { COLLECTIONS } from '../../src/backend/schema.js'
import { nowIso } from '../../src/backend/clock.js'

// Append-only, never read by the services: not loaded, only written.
const WRITE_ONLY = new Set(['auditLogs', 'outbox'])
const READ_AT_ONCE = 8

// Read only for the project a request names (bundle() filters them the same way).
const PROJECT_CONTENT = new Set([
  'documents', 'annotations', 'reviews', 'aiSummaries', 'weeklyLogs', 'defenses', 'forms', 'workflowHistory',
])

let state = null

const clone = (data) => Object.fromEntries(Object.entries(data).map(([k, m]) => [k, new Map(m)]))

// Firestore rejects undefined; the browser adapters drop it too.
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]))
  }
  return value
}

function open() {
  if (!state) throw new Error('The store is only open inside withStore().')
  return state
}

function touch(collection, id, doc) {
  const s = open()
  s.data[collection].set(id, doc)
  if (doc === null) s.data[collection].delete(id)
  s.dirty.set(`${collection}/${id}`, { collection, id, doc })
  s.cache = null
}

export async function withStore(fn, { projectId = null } = {}) {
  const fs = getFirestore()
  return fs.runTransaction(async (tx) => {
    const data = {}
    const load = async (name, query = fs.collection(name)) => {
      const snap = await tx.get(query)
      data[name] = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))
    }
    for (const name of WRITE_ONLY) data[name] = new Map()
    await load('projects')
    // Scoped only to a project that exists; anything else (an account id, a
    // made-up id) reads everything, as before.
    const scoped = projectId && data.projects.has(projectId)
    const rest = COLLECTIONS.filter(name => !WRITE_ONLY.has(name) && name !== 'projects')
    // A few at a time: each query is a stream inside the transaction, and the
    // SDK warns past ten at once.
    for (let i = 0; i < rest.length; i += READ_AT_ONCE) {
      await Promise.all(rest.slice(i, i + READ_AT_ONCE).map(name =>
        scoped && PROJECT_CONTENT.has(name)
          ? load(name, fs.collection(name).where('projectId', '==', projectId))
          : load(name)))
    }
    state = { fs, data, dirty: new Map(), depth: 0, cache: null }
    try {
      const result = await fn()
      for (const { collection, id, doc } of state.dirty.values()) {
        const ref = fs.collection(collection).doc(id)
        if (doc === null) tx.delete(ref)
        else tx.set(ref, clean(doc))
      }
      return result
    } finally {
      state = null
    }
  })
}

export const store = {
  name: 'firebase',

  snapshot() {
    const s = open()
    s.cache ??= Object.fromEntries(Object.entries(s.data).map(([k, m]) => [k, [...m.values()]]))
    return s.cache
  },

  // All-or-nothing, as in the browser adapters: if `fn` throws, what it wrote
  // is dropped. Nested calls join the one already open.
  async transaction(fn) {
    const s = open()
    if (s.depth > 0) return fn()
    const backup = { data: clone(s.data), dirty: new Map(s.dirty) }
    s.depth = 1
    try {
      return await fn()
    } catch (e) {
      s.data = backup.data
      s.dirty = backup.dirty
      s.cache = null
      throw e
    } finally {
      s.depth = 0
    }
  },

  async add(collection, data) {
    const s = open()
    const id = data.id ?? s.fs.collection(collection).doc().id
    const doc = { ...data, id, createdAt: data.createdAt ?? nowIso() }
    touch(collection, id, doc)
    return doc
  },

  async update(collection, id, patch) {
    const current = open().data[collection]?.get(id)
    if (!current) throw new Error(`${collection}/${id} not found`)
    const doc = { ...current, ...patch, updatedAt: nowIso() }
    touch(collection, id, doc)
    return doc
  },

  async remove(collection, id) {
    touch(collection, id, null)
  },

  async get(collection, id) {
    return open().data[collection]?.get(id) ?? null
  },

  async replaceAll() {
    throw new Error('Not available on the server.')
  },

  subscribe() {
    throw new Error('Not available on the server.')
  },
}
