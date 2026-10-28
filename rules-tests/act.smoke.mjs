// Writes through the `act` Cloud Function, end to end, under the REAL rules.
//
//   npm run test:act
//
// A throwaway emulator container (fresh data, firebase.json: the real
// firestore.rules and storage.rules) with Auth, Firestore, Storage and the
// Functions. The seed is loaded, four personas get real Auth accounts (their
// claims set by the claims triggers), and the browser SDK signs in as them:
// direct writes are refused, `act` runs the guard on the server, and a
// submission's file is checked before its version is recorded.

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { initializeApp as clientApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore as clientDb, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore'
import { getStorage, connectStorageEmulator, ref, uploadBytes } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-local'
const fromFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp } = fromFunctions('firebase-admin/app')
const { getFirestore } = fromFunctions('firebase-admin/firestore')
const { getAuth: adminAuth } = fromFunctions('firebase-admin/auth')
const { buildSeed } = await import('../functions/lib/app.js')

const admin = initializeApp({ projectId: PROJECT_ID })
const db = getFirestore(admin)
const auth = adminAuth(admin)

let failed = 0
const pass = (label) => console.log(`PASS  ${label}`)
const fail = (label, detail) => { failed++; console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function refused(label, promise, pattern) {
  try {
    await promise
    fail(label, 'was allowed')
  } catch (e) {
    if (pattern && !pattern.test(`${e.code} ${e.message}`)) fail(label, `${e.code}: ${e.message}`)
    else pass(`${label} — ${e.code}: ${e.message}`)
  }
}

// --- the seed, as Dev tools → Reset seed would write it -----------------------
const seed = buildSeed()
const rows = Object.entries(seed).flatMap(([col, byId]) => Object.values(byId ?? {}).map(d => [col, d]))
for (let i = 0; i < rows.length; i += 400) {
  const batch = db.batch()
  rows.slice(i, i + 400).forEach(([col, d]) => batch.set(db.collection(col).doc(d.id), d))
  await batch.commit()
}
console.log(`seeded ${rows.length} documents`)

// --- real Auth accounts for four personas; the claims triggers do the rest ----
const PEOPLE = { kilo: 's_kilo', mike: 's_mike', bravo: 'f_bravo', sierra: 'a_sierra' }
const password = `emulator-only-${Math.random().toString(36).slice(2)}`
const uids = {}
for (const [who, id] of Object.entries(PEOPLE)) {
  const user = await auth.createUser({ email: seed.users[id].email, password, emailVerified: true })
  uids[who] = user.uid
}
for (const [who, id] of Object.entries(PEOPLE)) {
  const until = Date.now() + 30000
  while ((await auth.getUser(uids[who])).customClaims?.userId !== id) {
    if (Date.now() > until) { fail(`claims for ${who}`); process.exit(1) }
    await sleep(300)
  }
}
pass('claims set for every persona by the triggers')

// --- the browser SDK, signed in as one persona at a time -------------------------
const app = clientApp({ apiKey: 'demo-api-key', projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` })
const cAuth = getAuth(app)
connectAuthEmulator(cAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
const cDb = clientDb(app)
connectFirestoreEmulator(cDb, '127.0.0.1', 8080)
const storage = getStorage(app)
connectStorageEmulator(storage, '127.0.0.1', 9199)
const fns = getFunctions(app)
connectFunctionsEmulator(fns, '127.0.0.1', 5001)
const act = async (name, args) => (await httpsCallable(fns, 'act')({ name, args })).data.result

const as = async (who) => {
  await signOut(cAuth)
  await signInWithEmailAndPassword(cAuth, seed.users[PEOPLE[who]].email, password)
}

const pdf = (text = 'v2') => new Uint8Array([...new TextEncoder().encode(`%PDF-1.4\n% ${text}\n`), ...new Uint8Array(256)])
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
let n = 0
const pathFor = (projectId, name) => `projects/${projectId}/documents/${Date.now().toString(36)}${String(n++).padStart(6, '0')}s-${name}`
async function upload(who, projectId, docType, bytes, { sha256 = sha(bytes), name = 'topics.pdf' } = {}) {
  const path = pathFor(projectId, name)
  await uploadBytes(ref(storage, path), bytes, {
    contentType: 'application/pdf',
    customMetadata: { projectId, docType, uploadedBy: PEOPLE[who], sha256 },
  })
  return path
}
const TOPICS = ['Smart Parking Finder', 'Canteen Pre-Order App', 'Org Event Attendance via QR', 'Lab Borrowing Log', 'Alumni Job Board']

// Reads: the real firestore.rules with real claims.
await as('kilo')
const project = await getDoc(doc(cDb, 'projects', 'p_g1'))
project.exists() ? pass('a member reads their project under the real firestore.rules') : fail('member read')
await refused('another group’s project stays closed', getDoc(doc(cDb, 'projects', 'p_g3')), /permission/)

// Writes from the browser are refused; through act they run the guard.
await refused('a direct Firestore write from the browser', setDoc(doc(cDb, 'projects', 'p_g1'), { currentStage: 'ARCHIVED' }, { merge: true }), /permission/)
await refused('a student cannot run Instructor 1’s gate', act('runGate', ['p_g1', { action: 'REGISTER_TOPIC' }]), /permission-denied.*(role|permitted|Instructor)/i)
await refused('an unknown action', act('wipeEverything', []), /invalid-argument/)
await refused('verifyEmail is not a server action (tokens are readable)', act('verifyEmail', ['any-token']), /invalid-argument/)

// A submission: upload, then act records it.
const bytes = pdf('kilo v2')
const path = await upload('kilo', 'p_g1', 'Topic Proposal', bytes)
const v2 = await act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: path, fileName: 'WD401 Topics.pdf' }])
const stored = (await db.doc(`documents/${v2.id}`).get()).data()
if (stored?.versionNumber === 2 && stored.sha256 === sha(bytes) && stored.storagePath === path && stored.fileSize === bytes.length && stored.submittedBy === 's_kilo') {
  pass('submitDocument through act: v2 recorded with the file’s size and fingerprint')
} else fail('submitDocument record', JSON.stringify(stored))
const v1 = (await db.doc('documents/d_g1_topic').get()).data()
v1?.status === 'Superseded' ? pass('v1 superseded in the same write') : fail('v1 superseded', v1?.status)
const audit = await db.collection('auditLogs').where('entityId', '==', v2.id).get()
audit.docs.some(d => d.get('action') === 'DOCUMENT_SUBMITTED' && d.get('actorId') === 's_kilo') ? pass('audit entry written by the server, as Kilo') : fail('audit entry')
const mail = await db.collection('outbox').where('projectId', '==', 'p_g1').get()
mail.docs.some(d => d.get('event') === 'Topic Proposal submitted') ? pass('reviewers notified (outbox)') : fail('outbox entry')

// The server checks the stored file, not the browser's word for it.
await refused('a path already recorded', act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: path, fileName: 'again.pdf' }]), /already recorded/)
const lying = await upload('kilo', 'p_g1', 'Topic Proposal', pdf('tampered'), { sha256: 'f'.repeat(64) })
await refused('a fingerprint that does not match the bytes', act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: lying, fileName: 'x.pdf' }]), /does not match/)
const notPdf = pathFor('p_g1', 'renamed.pdf')
const docx = new TextEncoder().encode('PK\u0003\u0004 a renamed docx')
await uploadBytes(ref(storage, notPdf), docx, { contentType: 'application/pdf', customMetadata: { projectId: 'p_g1', docType: 'Topic Proposal', uploadedBy: 's_kilo', sha256: sha(docx) } })
await refused('a renamed non-PDF', act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: notPdf, fileName: 'renamed.pdf' }]), /not a PDF/)
await refused('a path that is not a file at all', act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: pathFor('p_g1', 'ghost.pdf'), fileName: 'ghost.pdf' }]), /not found/)
await as('mike')
await refused('another member’s upload', act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: lying, fileName: 'mine.pdf' }]), /someone else/)

// Two members at once: the transaction gives them consecutive versions.
const mikePath = await upload('mike', 'p_g1', 'Topic Proposal', pdf('mike'))
await as('kilo')
const kiloPath = await upload('kilo', 'p_g1', 'Topic Proposal', pdf('kilo v3'))
const kiloCall = act('submitDocument', ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: kiloPath, fileName: 'k.pdf' }])
const mikeApp = clientApp({ apiKey: 'demo-api-key', projectId: PROJECT_ID }, 'mike')
const mikeAuth = getAuth(mikeApp)
connectAuthEmulator(mikeAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
await signInWithEmailAndPassword(mikeAuth, seed.users.s_mike.email, password)
const mikeFns = getFunctions(mikeApp)
connectFunctionsEmulator(mikeFns, '127.0.0.1', 5001)
const mikeCall = httpsCallable(mikeFns, 'act')({ name: 'submitDocument', args: ['p_g1', { docType: 'Topic Proposal', topics: TOPICS, storagePath: mikePath, fileName: 'm.pdf' }] })
const versions = (await Promise.all([kiloCall, mikeCall.then(r => r.data.result)])).map(d => d.versionNumber).sort()
JSON.stringify(versions) === '[3,4]' ? pass('concurrent submissions land as v3 and v4') : fail('concurrent versions', JSON.stringify(versions))

// Instructor 1 approves a topic (S3.3) — a faculty write through act.
await as('bravo')
const latest = (await db.collection('documents').where('projectId', '==', 'p_g1').where('docType', '==', 'Topic Proposal').get())
  .docs.map(d => d.data()).sort((a, b) => b.versionNumber - a.versionNumber)[0]
await act('submitReview', ['p_g1', latest.id, { decision: 'Approve', approvedTopic: TOPICS[1], comment: '' }])
;(await db.doc(`documents/${latest.id}`).get()).get('status') === 'Approved' ? pass('Instructor 1 approves the topic through act') : fail('topic approval')

// The System Administrator deactivates Mike; the guard on the server then refuses him.
await as('sierra')
await act('setAccountStatus', ['s_mike', 'Inactive'])
await mikeAuth.currentUser.getIdToken(true)
await refused('a deactivated account', httpsCallable(mikeFns, 'act')({ name: 'submitWeeklyLog', args: ['p_g1', { activities: 'x' }] }), /permission-denied|failed-precondition|unauthenticated/)

// Registration (SignIn.jsx): the Auth account comes first, then act creates its users row.
const newcomer = 'papa.new@student.hau.edu.ph'
await auth.createUser({ email: newcomer, password, emailVerified: false })
await signOut(cAuth)
await signInWithEmailAndPassword(cAuth, newcomer, password)
await refused('registering someone else’s address', act('registerAccount', [{ email: 'other@student.hau.edu.ph', name: 'X', idNumber: '1', program: '', block: 'WD-401' }]), /permission-denied/)
const registered = await act('registerAccount', [{ email: newcomer, name: 'Papa New', idNumber: '2022-0999', block: 'WD-401' }])
registered?.status === 'Inactive' && registered.emailVerified === false ? pass('a new Auth account registers through act (inactive, unverified)') : fail('registerAccount', JSON.stringify(registered))
await refused('confirming an address Auth has not verified', act('confirmProviderVerification', [newcomer]), /permission-denied/)
await auth.updateUser(cAuth.currentUser.uid, { emailVerified: true })
await cAuth.currentUser.getIdToken(true)
const confirmed = await act('confirmProviderVerification', [newcomer])
confirmed?.emailVerified === true ? pass('its verified email is confirmed through act') : fail('confirmProviderVerification', JSON.stringify(confirmed))

console.log(failed ? `\n${failed} failed` : '\nall act checks passed')
process.exit(failed ? 1 : 0)
