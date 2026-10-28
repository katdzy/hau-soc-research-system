// The claims triggers in functions/index.js, live on the Functions emulator.
//
//   npm run test:triggers
//
// Runs inside a throwaway emulator container (`docker compose run`, fresh
// data, real firebase.json): writes the rows the app writes and waits for each
// trigger to put the matching claims on the Auth account. Exits non-zero on
// the first claim that does not arrive.

import { createRequire } from 'node:module'

const fromFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp } = fromFunctions('firebase-admin/app')
const { getFirestore } = fromFunctions('firebase-admin/firestore')
const { getAuth } = fromFunctions('firebase-admin/auth')

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-local' })
const db = getFirestore(app)
const auth = getAuth(app)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let failed = 0

async function expectClaims(label, uid, check, timeoutMs = 30000, allowEmpty = false) {
  const until = Date.now() + timeoutMs
  let last
  while (Date.now() < until) {
    last = (await auth.getUser(uid)).customClaims
    if ((last || allowEmpty) && check(last ?? null)) { console.log(`PASS  ${label}`); return }
    await sleep(500)
  }
  failed++
  console.log(`FAIL  ${label}\n      claims: ${JSON.stringify(last)}`)
}

const account = (email) => ({ email, name: email, status: 'Active', emailVerified: true, globalRoles: ['Student'], programScope: [] })

// Auth account first, then the users row (registration order, SignIn.jsx).
const kilo = await auth.createUser({ email: 'kilo@student.hau.edu.ph', emailVerified: true })
await db.doc('users/u_kilo').set(account('kilo@student.hau.edu.ph'))
await expectClaims('claimsOnUser: a new users row', kilo.uid, c => c.userId === 'u_kilo' && c.globalRoles?.[0] === 'Student')

await db.doc('projectMembers/m1').set({ projectId: 'p1', userId: 'u_kilo' })
await expectClaims('claimsOnMember: added to a group', kilo.uid, c => c.projects?.p1?.[0] === 'Member')

await db.doc('projectAssignments/a1').set({ projectId: 'p2', userId: 'u_kilo', roleType: 'Panel Member', status: 'Accepted' })
await expectClaims('claimsOnAssignment: an assignment', kilo.uid, c => c.projects?.p2?.[0] === 'Panel Member')

await db.doc('permissionOverrides/o1').set({ userId: 'u_kilo', capability: 'project.view', projectId: null, effect: 'deny', liftedAt: null })
await expectClaims('claimsOnOverride: revoked everywhere', kilo.uid, c => c.hidden === true && Object.keys(c.projects).length === 0)

await db.doc('permissionOverrides/o1').update({ liftedAt: new Date().toISOString() })
await expectClaims('claimsOnOverride: lifted', kilo.uid, c => !c.hidden && c.projects?.p1 && c.projects?.p2)

await db.doc('projectMembers/m1').delete()
await expectClaims('claimsOnMember: removed from the group', kilo.uid, c => !c.projects?.p1 && c.projects?.p2)

await db.doc('users/u_kilo').update({ status: 'Inactive' })
await expectClaims('claimsOnUser: deactivated', kilo.uid, c => c.userId === 'u_kilo' && c.globalRoles.length === 0 && Object.keys(c.projects).length === 0)

// The users row first, then the Auth account (an address the app already knew).
await db.doc('users/u_lima').set({ ...account('lima@student.hau.edu.ph'), globalRoles: ['Student'] })
await db.doc('projectMembers/m2').set({ projectId: 'p1', userId: 'u_lima' })
await sleep(1500)
const lima = await auth.createUser({ email: 'lima@student.hau.edu.ph', emailVerified: true })
await expectClaims('claimsOnSignUp: Auth account after its users row', lima.uid, c => c.userId === 'u_lima' && c.projects?.p1?.[0] === 'Member')

await db.doc('users/u_lima').delete()
await expectClaims('claimsOnUser: users row deleted → claims cleared', lima.uid, c => c === null || Object.keys(c).length === 0, 30000, true)

const sync = await db.doc(`claimsSync/${kilo.uid}`).get()
if (sync.get('userId') === 'u_kilo') console.log('PASS  claimsSync touched for the app')
else { failed++; console.log('FAIL  claimsSync not written') }

console.log(failed ? `\n${failed} failed` : '\nall triggers passed')
process.exit(failed ? 1 : 0)
