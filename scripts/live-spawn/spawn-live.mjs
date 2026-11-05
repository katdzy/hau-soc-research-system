// The test panel's Spawn for the LIVE Firebase project named in .env: dummy
// accounts that can really sign in. Each one gets a Firebase Auth login
// (email already verified, the password you pass) and its `users` record, made
// by the same transforms as the panel (src/dev/spawn.js) — `test.` addresses,
// `demo: true` (never mailed), `spawned`. It only adds: it refuses to change or
// delete anything that is already there.
//
//   node scripts/live-spawn/spawn-live.mjs <what> [...]                   dry run: reads, writes nothing
//   node scripts/live-spawn/spawn-live.mjs <what> [...] --confirm-live --password <8+ chars>
//
//   starter                 a Capstone 1 section per program with 8 students, a Program Chair per program,
//                           4 more faculty, a Dean, Associate Dean, URO and System Administrator
//   faculty [n]             plain faculty (advisers, panelists)
//   office <role> [n]       role: dean | ad | uro | admin
//   chair <CODE>            Program Chair for WD, NW, EMC, CYB or CS
//   section <CODE> <1|2>    a Capstone 1 or 2 section, with its own new instructor
//   students <BLOCK> [n]    students in an existing section, e.g. WD-401
//   group <BLOCK> [n]       a group at Group Formation in a Capstone 1 section (students spawned if short)
//   accounts                list the dummy accounts already there
//   password                give every dummy login a new password (--confirm-live --password <new>)
//
// Every run against live also writes the dummy accounts to src/dev/live-accounts.json
// (gitignored), which the test panel's People tab lists on a live project.
//
// Admin access, once: Firebase console → Project settings → Service accounts →
// Generate new private key, saved as .secrets/service-account.json (gitignored),
// or point GOOGLE_APPLICATION_CREDENTIALS at it. With FIRESTORE_EMULATOR_HOST
// and FIREBASE_AUTH_EMULATOR_HOST set it talks to the emulators instead.
// The test panel's Spawn tab does the same from the browser (devServer.mjs).

import {
  starterStore, spawnFaculty, spawnOffice, spawnSection, spawnStudent, spawnGroup, diffStores,
} from '../../src/dev/spawn.js'
import { GLOBAL_ROLES as G, COURSES, PROGRAM_INFO, programByCode } from '../../src/domain/constants.js'
import { emptyStore } from '../../src/backend/schema.js'
import { connect, passwordProblem, checkChanges, applyChanges, saveList } from './core.mjs'

const root = new URL('../../', import.meta.url)

/* --- Arguments ------------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  if (i < 0) return null
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v ?? ''
}
const confirm = argv.includes('--confirm-live')
if (confirm) argv.splice(argv.indexOf('--confirm-live'), 1)
const password = flag('--password') ?? process.env.TEST_PASSWORD ?? null
const [what, ...rest] = argv

function fail(message) {
  console.error(message)
  process.exit(1)
}
const count = (v) => {
  const n = v === undefined ? 1 : Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 40) fail(`Expected a count from 1 to 40, got "${v}".`)
  return n
}
const programOf = (code) => {
  const info = programByCode(String(code ?? '').toUpperCase())
  if (!info) fail(`Unknown program "${code}". Use one of ${PROGRAM_INFO.map(p => p.code).join(', ')}.`)
  return info
}
const OFFICES = { dean: G.DEAN, ad: G.ASSOCIATE_DEAN, uro: G.URO, admin: G.ADMIN }

/** The transform for this command: keyed store → keyed store. */
function plan() {
  const times = (n, fn) => (store) => { for (let i = 0; i < n; i++) store = fn(store); return store }
  const sectionByBlock = (store, block) => {
    const sec = Object.values(store.sections).find(s => s.block === String(block ?? '').toUpperCase())
    if (!sec) fail(`No section ${block}. Sections: ${Object.values(store.sections).map(s => s.block).sort().join(', ') || 'none yet'}.`)
    return sec
  }
  switch (what) {
    case 'starter': return (store) => starterStore(store)
    case 'faculty': return times(count(rest[0]), s => spawnFaculty(s).store)
    case 'office': {
      const role = OFFICES[rest[0]]
      if (!role) fail(`office takes one of ${Object.keys(OFFICES).join(', ')}.`)
      return times(count(rest[1]), s => spawnOffice(s, role).store)
    }
    case 'chair': {
      const info = programOf(rest[0])
      return (s) => spawnOffice(s, G.COORDINATOR, info.name).store
    }
    case 'section': {
      const info = programOf(rest[0])
      const course = { 1: COURSES.C1, 2: COURSES.C2 }[rest[1]]
      if (!course) fail('section takes the course as 1 or 2, e.g. section WD 1.')
      return (s) => spawnSection(s, info.code, course).store
    }
    case 'students': return (s) => times(count(rest[1]), x => spawnStudent(x, sectionByBlock(x, rest[0]).id).store)(s)
    case 'group': return (s) => times(count(rest[1]), x => spawnGroup(x, sectionByBlock(x, rest[0]).id).store)(s)
    case 'accounts':
    case 'password': return null
    default:
      fail('Usage: node scripts/live-spawn/spawn-live.mjs <starter|faculty|office|chair|section|students|group|accounts|password> … [--confirm-live --password <pw>]\nSee the top of the file for details.')
  }
}
const transform = plan()

/* --- Connection ----------------------------------------------------------------------- */

let admin
try { admin = connect(root) } catch (e) { fail(e.message) }
const { db, auth, projectId, emulated } = admin
console.log(`Project: ${projectId}${emulated ? ' (emulators)' : ' — LIVE'}`)

// What the spawner reads. Everything it writes outside these (workflowHistory)
// is new by construction.
const READ = ['users', 'sections', 'projects', 'projectMembers', 'projectAssignments', 'groupDrafts']
const before = emptyStore()
for (const name of READ) {
  const snap = await db.collection(name).get()
  before[name] = Object.fromEntries(snap.docs.map(d => [d.id, { ...d.data(), id: d.id }]))
}
// The test panel's People list (live runs only — an emulator run must not overwrite it).
if (!emulated) saveList(root, Object.values(before.users))

const accountLine = (u) => `  ${u.email.padEnd(48)} ${u.name} — ${(u.globalRoles ?? []).filter(r => r !== G.FACULTY).join(', ') || 'Faculty'}${u.block ? ` · ${u.block}` : ''}`

if (!transform) {
  const dummies = Object.values(before.users).filter(u => u.spawned && u.demo)
    .sort((a, b) => a.email.localeCompare(b.email))
  if (what === 'accounts') {
    console.log(`${dummies.length} dummy account(s):`)
    dummies.forEach(u => console.log(accountLine(u)))
    process.exit(0)
  }
  console.log(`Would set a new password on ${dummies.length} dummy login(s).`)
  if (!confirm) {
    console.log('\nDry run. Add --confirm-live --password <new> to change them.')
    process.exit(0)
  }
  if (passwordProblem(password)) fail(passwordProblem(password))
  let done = 0
  for (const u of dummies) {
    const login = await auth.getUserByEmail(u.email).catch(() => null)
    if (!login) { console.log(`  no login for ${u.email}, skipped`); continue }
    await auth.updateUser(login.uid, { password })
    done++
  }
  console.log(`\nDone: ${done} login(s) have the new password.`)
  process.exit(0)
}

/* --- What would change: additions only from the command line --------------------------- */

const changes = diffStores(before, transform(structuredClone(before)))
const notNew = changes.filter(c => c.kind !== 'create')
if (notNew.length) fail(`Refusing: this would change or delete existing documents (${notNew.map(c => `${c.collection}/${c.id}`).join(', ')}). It only adds.`)
if (!changes.length) {
  console.log('\nNothing to add.')
  process.exit(0)
}
try { await checkChanges(db, changes) } catch (e) { fail(e.message) }

const newUsers = changes.filter(c => c.collection === 'users').map(c => c.row)
const byCollection = changes.reduce((m, c) => ({ ...m, [c.collection]: (m[c.collection] ?? 0) + 1 }), {})
console.log('\nWould add:')
for (const [name, n] of Object.entries(byCollection)) console.log(`  ${name.padEnd(22)} ${n}`)
if (newUsers.length) {
  console.log(`\n${newUsers.length} login(s), email verified, active:`)
  newUsers.forEach(u => console.log(accountLine(u)))
}
if (newUsers.some(u => (u.globalRoles ?? []).includes(G.ADMIN))) {
  console.log('\nNote: a System Administrator can change every real account on this project.')
}
if (!confirm) {
  console.log(`\nDry run. Add --confirm-live --password <8+ characters> to create these${emulated ? '' : ' on the LIVE project'}.`)
  process.exit(0)
}

let result
try { result = await applyChanges(db, auth, changes, password) } catch (e) { fail(`Failed: ${e.message}`) }
if (!emulated) saveList(root, [...Object.values(before.users), ...newUsers])
console.log(`\nDone: ${result.created} document(s), ${result.logins} login(s). Sign in with the address and the password you passed.`)
process.exit(0)
