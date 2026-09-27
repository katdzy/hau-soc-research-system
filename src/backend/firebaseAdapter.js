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

const emptySnapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, []]))
let mirror = emptySnapshot()
const subscribers = new Set()
let fb = null

async function init() {
  if (fb) return fb
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
  const db = firestore.getFirestore(app)
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  fb = { db, ...firestore }

  // Mirror every collection locally so the UI keeps one synchronous snapshot.
  for (const name of COLLECTIONS) {
    fb.onSnapshot(fb.collection(db, name), (snap) => {
      mirror = { ...mirror, [name]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
      subscribers.forEach(fn => fn(mirror))
    })
  }
  return fb
}

export const firebaseAdapter = {
  name: 'firebase',
  isSeeded: () => (mirror.users ?? []).length > 0,
  snapshot: () => mirror,

  subscribe(fn) {
    subscribers.add(fn)
    init().then(() => fn(mirror))
    return () => subscribers.delete(fn)
  },

  async add(collection, data) {
    const { db, doc, setDoc, collection: col } = await init()
    const id = data.id ?? doc(col(db, collection)).id
    const payload = { ...data, id, createdAt: data.createdAt ?? new Date().toISOString() }
    await setDoc(doc(db, collection, id), payload)
    return payload
  },

  async update(collection, id, patch) {
    const { db, doc, updateDoc } = await init()
    const payload = { ...patch, updatedAt: new Date().toISOString() }
    await updateDoc(doc(db, collection, id), payload)
    return { id, ...payload }
  },

  async remove(collection, id) {
    const { db, doc, deleteDoc } = await init()
    await deleteDoc(doc(db, collection, id))
  },

  async get(collection, id) {
    const { db, doc, getDoc } = await init()
    const snap = await getDoc(doc(db, collection, id))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  async replaceAll(next) {
    const { db, doc, writeBatch, getDocs, collection: col } = await init()
    for (const name of COLLECTIONS) {
      const existing = await getDocs(col(db, name))
      const wipe = writeBatch(db)
      existing.docs.forEach(d => wipe.delete(d.ref))
      await wipe.commit()

      const rows = Object.values(next[name] ?? {})
      for (let i = 0; i < rows.length; i += 400) {
        const batch = writeBatch(db)
        rows.slice(i, i + 400).forEach(r => batch.set(doc(db, name, r.id), r))
        await batch.commit()
      }
    }
  },

  async reset() {
    await this.replaceAll(emptyStore())
  },
}
