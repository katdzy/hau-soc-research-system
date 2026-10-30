// The file store: the bytes of each submitted PDF, kept apart from the
// `documents` record that describes them. A path is written once and never
// overwritten or deleted — a new version is a new path — so reviewers'
// annotations always sit on exactly the file they were made against.
//
//   local     IndexedDB (`hausoc.files`). localStorage is far too small for
//             manuscripts; clearing site data drops the files, not the records.
//   firebase  Cloud Storage, same bucket as the app (storage.rules).
//
// put(path, blob, { metadata, onProgress, signal }) → path
//   onProgress(fraction 0–1) as bytes go out; aborting `signal` cancels.
//   Failures throw an Error with a message fit for the student and the
//   store's own `code` kept on it.
// url(path) → something an <iframe>/pdf.js can load, or null when the file is
//   not there (seeded records never had one — see sampleFiles.js).
// verify(path, expected) → only the server's file store (functions/app/files.js)
//   can vouch for a file uploaded ahead of its record; here it refuses, so a
//   caller cannot skip the byte checks by naming a path.
//
// Reads fetch the bytes through the SDK (getBlob), so every read is checked by
// storage.rules. A download-token URL (getDownloadURL) would not be: anyone
// holding it could open the file for good. On the live bucket getBlob needs
// CORS — see storage.cors.json.

import { firebaseApp } from './firebaseAdapter.js'
import { emulatorHost } from './emulatorHost.js'

export { filePath } from './filePath.js'

const fail = (code, message, cause) => Object.assign(new Error(message), { code, cause })

const cancelled = () => fail('cancelled', 'Upload cancelled. Nothing was submitted.')

const unverifiable = async () => { throw fail('unverifiable', 'Attach the PDF file.') }
const unverifiableForm = async () => { throw fail('unverifiable', 'Attach the signed form.') }

// Object URLs for files already fetched: a document is opened often (viewer,
// AI summary) and its bytes never change. A few at a time — each one holds the
// whole file in memory — and none past a change of account (forget()): the
// next person on this tab fetches through the rules again.
const KEEP = 6
const objectUrls = new Map()

function cached(path) {
  const url = objectUrls.get(path)
  if (!url) return null
  objectUrls.delete(path) // most recently used goes last
  objectUrls.set(path, url)
  return url
}

function remember(path, blob) {
  const url = URL.createObjectURL(blob)
  objectUrls.set(path, url)
  while (objectUrls.size > KEEP) {
    const [oldest, old] = objectUrls.entries().next().value
    objectUrls.delete(oldest)
    URL.revokeObjectURL(old)
  }
  return url
}

function forget() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
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
    req.onerror = () => { opening = null; reject(req.error) }
  })
  return opening
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

function localError(e) {
  if (e?.name === 'ConstraintError') return fail('exists', 'A file is already stored at that path; files are never replaced.', e)
  if (e?.name === 'QuotaExceededError') return fail('quota', 'This browser has no room left for the file. Free some space, or use another browser, and try again.', e)
  return fail('unknown', 'The file could not be saved in this browser. Try again.', e)
}

export const localFiles = {
  verify: unverifiable,
  verifyForm: unverifiableForm,
  forget,

  async put(path, blob, { onProgress, signal } = {}) {
    if (signal?.aborted) throw cancelled()
    const handle = await idb()
    if (signal?.aborted) throw cancelled()
    if (handle) {
      try {
        const tx = handle.transaction(STORE, 'readwrite')
        // `add`, not `put`: writing to an existing path fails instead of replacing it.
        await request(tx.objectStore(STORE).add(blob, path))
      } catch (e) {
        throw localError(e)
      }
    }
    onProgress?.(1)
    return path
  },

  async url(path) {
    const hit = cached(path)
    if (hit) return hit
    const handle = await idb()
    if (!handle) return null
    const blob = await request(handle.transaction(STORE).objectStore(STORE).get(path))
    return blob ? remember(path, blob) : null
  },
}

// --- firebase: Cloud Storage -----------------------------------------------------

// The SDK retries a dropped upload on its own, with backoff; by default for up
// to ten minutes, which reads as a frozen progress bar. Two minutes, then a
// clear failure the student can retry.
const UPLOAD_RETRY_MS = 2 * 60 * 1000

let storage = null

async function cloud() {
  if (storage) return storage
  const [app, mod] = await Promise.all([firebaseApp(), import('firebase/storage')])
  const s = mod.getStorage(app)
  if (import.meta.env.VITE_USE_EMULATORS === 'true') mod.connectStorageEmulator(s, emulatorHost(), 9199)
  s.maxUploadRetryTime = UPLOAD_RETRY_MS
  storage = { s, ...mod }
  return storage
}

const CLOUD_MESSAGES = {
  'storage/canceled': null, // → cancelled()
  'storage/unauthenticated': 'Your session has ended. Sign in again, then submit.',
  'storage/unauthorized': 'The file store refused this upload. You may no longer be able to submit at this stage — reload the page and check.',
  'storage/retry-limit-exceeded': 'The connection dropped and the upload could not finish. Check your connection and submit again.',
  'storage/quota-exceeded': 'The file store is full. Tell the System Administrator; nothing was submitted.',
  'storage/server-file-wrong-size': 'The file arrived incomplete. Submit it again.',
  'storage/invalid-checksum': 'The file arrived damaged. Submit it again.',
}

function cloudError(e) {
  if (e?.code === 'storage/canceled') return cancelled()
  const message = CLOUD_MESSAGES[e?.code] ?? 'The file could not be uploaded. Try again in a moment.'
  return fail(e?.code ?? 'unknown', message, e)
}

export const firebaseFiles = {
  verify: unverifiable,
  verifyForm: unverifiableForm,
  forget,

  async put(path, blob, { contentType = 'application/pdf', metadata = {}, onProgress, signal } = {}) {
    if (signal?.aborted) throw cancelled()
    const { s, ref, uploadBytesResumable } = await cloud()
    // The first upload loads the SDK; a Cancel pressed meanwhile counts too.
    if (signal?.aborted) throw cancelled()
    const task = uploadBytesResumable(ref(s, path), blob, {
      contentType,
      customMetadata: metadata,
    })
    const stop = () => task.cancel()
    signal?.addEventListener('abort', stop, { once: true })
    try {
      await new Promise((resolve, reject) => task.on('state_changed',
        (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
        reject,
        resolve))
    } catch (e) {
      throw cloudError(e)
    } finally {
      signal?.removeEventListener('abort', stop)
    }
    onProgress?.(1)
    return path
  },

  async url(path) {
    const hit = cached(path)
    if (hit) return hit
    const { s, ref, getBlob } = await cloud()
    let blob
    try {
      blob = await getBlob(ref(s, path))
    } catch (e) {
      if (e?.code === 'storage/object-not-found') return null
      if (e?.code === 'storage/unauthorized') throw fail(e.code, 'You cannot open this file at this stage.', e)
      throw fail(e?.code ?? 'unknown', 'The file could not be loaded. Check your connection and try again.', e)
    }
    return remember(path, blob)
  },
}
