// syncClaims (functions/syncClaims.js) end to end on the emulators: an Auth
// account and its `users` row → custom claims → a real ID token → storage.rules.
// Proves the claims are shaped the way the rules read them, and that a change
// (a member removed) reaches the rules once the token refreshes.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { initializeApp as clientApp, deleteApp } from 'firebase/app'
import { getAuth as clientAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getStorage, connectStorageEmulator, ref, uploadBytes, getMetadata } from 'firebase/storage'
import { syncClaims, clearClaims, userIdForEmail } from '../functions/syncClaims.js'

const PROJECT_ID = 'demo-local'
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
// Names the project, so the Admin SDK does not probe for a GCE metadata server.
process.env.GCLOUD_PROJECT ??= PROJECT_ID

// The Admin SDK is a dependency of functions/, not of the app.
const fromFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = fromFunctions('firebase-admin/app')
const { getFirestore } = fromFunctions('firebase-admin/firestore')
const { getAuth } = fromFunctions('firebase-admin/auth')

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const IDS = { user: 'claims_u_kilo', project: 'claims_p_dev', member: 'claims_m_kilo' }
const EMAIL = 'claims.kilo@student.hau.edu.ph'
const PASSWORD = `emulator-only-${Math.random().toString(36).slice(2)}`
const PDF = new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n'), ...new Uint8Array(64)])
let n = 0
const filePath = () => `projects/${IDS.project}/documents/${Date.now().toString(36)}${String(n++).padStart(6, '0')}c-claims.pdf`
const upload = (path) => uploadBytes(ref(storage, path), PDF, {
  contentType: 'application/pdf',
  customMetadata: { projectId: IDS.project, docType: 'Proposal Manuscript', uploadedBy: IDS.user, sha256: 'c'.repeat(64) },
})

let env, admin, db, auth, client, storage, uid

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { host: '127.0.0.1', port: 9199, rules: read('storage.rules') },
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  admin = adminApp({ projectId: PROJECT_ID }, 'claims-sync-test')
  db = getFirestore(admin)
  auth = getAuth(admin)
  await db.doc(`projects/${IDS.project}`).set({ currentStage: 'PROPOSAL_DEVELOPMENT', program: 'WD' })
  await db.doc(`users/${IDS.user}`).set({
    email: EMAIL, name: 'Claims Kilo', status: 'Active', emailVerified: true, globalRoles: ['Student'], programScope: [],
  })
  await db.doc(`projectMembers/${IDS.member}`).set({ projectId: IDS.project, userId: IDS.user })

  client = clientApp({ apiKey: 'demo-api-key', projectId: PROJECT_ID, storageBucket: PROJECT_ID }, 'claims-sync-client')
  connectAuthEmulator(clientAuth(client), 'http://127.0.0.1:9099', { disableWarnings: true })
  storage = getStorage(client)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
})

afterAll(async () => {
  try {
    await signOut(clientAuth(client)).catch(() => {})
    await deleteApp(client)
    if (uid) await auth.deleteUser(uid).catch(() => {})
    await Promise.all([
      db.doc(`projects/${IDS.project}`).delete(),
      db.doc(`users/${IDS.user}`).delete(),
      db.doc(`projectMembers/${IDS.member}`).delete(),
      uid ? db.doc(`claimsSync/${uid}`).delete() : null,
    ])
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { items } = await ctx.storage().ref(`projects/${IDS.project}/documents`).listAll()
      await Promise.all(items.map(i => i.delete()))
    })
    await deleteAdminApp(admin)
  } finally {
    await env.cleanup()
    const restore = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { host: '127.0.0.1', port: 9199, rules: read('emulator/storage.open.rules') },
    })
    await restore.cleanup()
  }
})

describe('syncClaims', () => {
  const deps = () => ({ db, auth, log: { error: () => {} } })

  it('waits for the Auth account: a users row alone gets no claims', async () => {
    expect((await syncClaims(deps(), IDS.user)).status).toBe('no-auth-user')
    expect((await syncClaims(deps(), 'nobody')).status).toBe('no-account')
  })

  it('writes the claims the rules read, and touches claimsSync for the app', async () => {
    uid = (await auth.createUser({ email: EMAIL, password: PASSWORD, emailVerified: true })).uid
    expect(await userIdForEmail(db, ` ${EMAIL.toUpperCase()} `)).toBe(IDS.user)

    const result = await syncClaims(deps(), IDS.user)
    const expected = { userId: IDS.user, globalRoles: ['Student'], programScope: [], projects: { [IDS.project]: ['Member'] } }
    expect(result).toMatchObject({ status: 'updated', uid, claims: expected })
    expect((await auth.getUser(uid)).customClaims).toEqual(expected)
    expect((await db.doc(`claimsSync/${uid}`).get()).get('userId')).toBe(IDS.user)

    expect((await syncClaims(deps(), IDS.user)).status).toBe('unchanged')
  })

  it('a member’s real token passes storage.rules; once removed, it no longer does', async () => {
    const { user } = await signInWithEmailAndPassword(clientAuth(client), EMAIL, PASSWORD)
    expect((await user.getIdTokenResult(true)).claims.projects).toEqual({ [IDS.project]: ['Member'] })

    const path = filePath()
    await expect(upload(path)).resolves.toBeTruthy()
    await expect(getMetadata(ref(storage, path))).resolves.toBeTruthy()

    await db.doc(`projectMembers/${IDS.member}`).delete()
    expect((await syncClaims(deps(), IDS.user)).claims.projects).toEqual({})
    // The app does this when claimsSync changes (src/services/claims.js).
    await user.getIdToken(true)

    await expect(upload(filePath())).rejects.toMatchObject({ code: 'storage/unauthorized' })
    await expect(getMetadata(ref(storage, path))).rejects.toMatchObject({ code: 'storage/unauthorized' })
  })

  it('a deleted users row leaves nothing on its Auth account', async () => {
    await db.doc(`users/${IDS.user}`).update({ status: 'Active' })
    await syncClaims(deps(), IDS.user)
    expect((await auth.getUser(uid)).customClaims?.userId).toBe(IDS.user)
    expect((await clearClaims(deps(), EMAIL)).status).toBe('cleared')
    expect((await auth.getUser(uid)).customClaims ?? {}).toEqual({})
    expect((await db.doc(`claimsSync/${uid}`).get()).get('userId')).toBeNull()
    expect((await clearClaims(deps(), EMAIL)).status).toBe('unchanged')
    expect((await clearClaims(deps(), 'nobody@hau.edu.ph')).status).toBe('no-auth-user')
  })

  it('an account deactivated by the System Administrator loses its roles', async () => {
    await db.doc(`projectMembers/${IDS.member}`).set({ projectId: IDS.project, userId: IDS.user })
    await db.doc(`users/${IDS.user}`).update({ status: 'Inactive' })
    const { claims } = await syncClaims(deps(), IDS.user)
    expect(claims).toEqual({ userId: IDS.user, globalRoles: [], programScope: [], projects: {} })
  })
})
