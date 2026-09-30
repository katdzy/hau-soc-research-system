// The file store: the bytes of each submitted PDF, kept apart from the
// `documents` record that describes them. A path is written once and never
// overwritten or deleted — a new version is a new path — so reviewers'
// annotations always sit on exactly the file they were made against.
//
//   local     IndexedDB (`hausoc.files`). localStorage is far too small for
//             manuscripts; clearing site data drops the files, not the records.
//   firebase  Cloud Storage, same bucket as the app (storage.rules).
//
// `url(path)` returns something an <iframe>/pdf.js can load, or null when the
// file is not there (seeded records never had one — see sampleFiles.js).

import { firebaseApp } from './firebaseAdapter.js'

/** Where a document version's file lives. One path per version, never reused. */
export const filePath = (projectId, fileName) => {
  const safe = String(fileName ?? 'file.pdf').replace(/[^\w.-]+/g, '_').slice(-80)
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `projects/${projectId}/documents/${unique}-${safe}`
}

// --- local: IndexedDB ----------------------------------------------------------

const DB_NAME = 'hausoc.files'
const STORE = 'files'
let opening = null

function idb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null) // Node (tests)
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const objectUrls = new Map()

export const localFiles = {
  async put(path, blob) {
    const handle = await idb()
    if (!handle) return path
    const tx = handle.transaction(STORE, 'readwrite')
    // `add`, not `put`: writing to an existing path fails instead of replacing it.
    await request(tx.objectStore(STORE).add(blob, path))
    return path
  },

  async url(path) {
    if (objectUrls.has(path)) return objectUrls.get(path)
    const handle = await idb()
    if (!handle) return null
    const blob = await request(handle.transaction(STORE).objectStore(STORE).get(path))
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    objectUrls.set(path, url)
    return url
  },
}

// --- firebase: Cloud Storage -----------------------------------------------------

let storage = null

async function cloud() {
  if (storage) return storage
  const [app, mod] = await Promise.all([firebaseApp(), import('firebase/storage')])
  const s = mod.getStorage(app)
  if (import.meta.env.VITE_USE_EMULATORS === 'true') mod.connectStorageEmulator(s, '127.0.0.1', 9199)
  storage = { s, ...mod }
  return storage
}

export const firebaseFiles = {
  async put(path, blob) {
    const { s, ref, uploadBytes } = await cloud()
    await uploadBytes(ref(s, path), blob, { contentType: 'application/pdf' })
    return path
  },

  async url(path) {
    const { s, ref, getDownloadURL } = await cloud()
    try {
      return await getDownloadURL(ref(s, path))
    } catch (e) {
      if (e?.code === 'storage/object-not-found') return null
      throw e
    }
  },
}
