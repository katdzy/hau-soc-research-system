// Take the old demo seed (§6 personas Alpha … Sierra, G1–G4, the NPC students
// and faculty) back off the LIVE Firebase project in .env — what
// seed-live.mjs wrote before the app started empty (decision 2026-11-02).
//
//   node scripts/live-seed/unseed-live.mjs                 dry run: reads, lists what would go, writes nothing
//   node scripts/live-seed/unseed-live.mjs --confirm-live  deletes it
//
// What counts as the old seed:
//   users     no `spawned` (the test panel's accounts), and demo: true, npc: true, or
//             the seed's id with the seed's email (the live seed predates `demo`).
//             An account with a Firebase Auth login is kept and listed: someone uses it.
//   projects  the seed's ids (buildSeed), unless a kept account is a member.
//   the rest  the seed's own rows (by id, every collection but settings), and any
//             row tied to a removed account or group (projectId / userId).
// Sections the seed made are removed too — unless someone who stays is in one
// (a registered student in WD-401, a test-panel group, a draft): those stay,
// losing a removed instructor (pick a spawned one in the test panel).
// Audit entries and emails written after the seed are history and stay.
//
// Admin key: .secrets/service-account.json, as for scripts/live-spawn.

import { buildSeed } from '../../src/backend/seed.js'
import { COLLECTIONS } from '../../src/backend/schema.js'
import { connect } from '../live-spawn/core.mjs'

const root = new URL('../../', import.meta.url)
const confirm = process.argv.includes('--confirm-live')

const { db, auth, projectId, emulated } = connect(root)
console.log(`Project: ${projectId}${emulated ? ' (emulators)' : ' (LIVE)'}${confirm ? '' : ' — dry run'}\n`)

const seed = buildSeed()
const seedIds = (c) => new Set(Object.keys(seed[c] ?? {}))

// Everything, once (a few hundred documents).
const live = {}
for (const c of COLLECTIONS) {
  const snap = await db.collection(c).get()
  live[c] = new Map(snap.docs.map(d => [d.id, d.data()]))
}

/* --- Accounts ----------------------------------------------------------------------- */

// The live seed predates `demo`: its personas match the seed by id and email, its NPCs carry `npc`.
const isSeedUser = (id, u) => !u.spawned &&
  (u.demo === true || u.npc === true || (seed.users[id] && seed.users[id].email === u.email))
const seedUsers = [...live.users].filter(([id, u]) => isSeedUser(id, u))
const withLogin = []
for (const [id, u] of seedUsers) {
  const login = await auth.getUserByEmail(u.email).catch(e => (e.code === 'auth/user-not-found' ? null : Promise.reject(e)))
  if (login) withLogin.push(id)
}
const goneUsers = new Set(seedUsers.map(([id]) => id).filter(id => !withLogin.includes(id)))

/* --- Groups ------------------------------------------------------------------------- */

const membersOf = (pid) => [...live.projectMembers.values()].filter(m => m.projectId === pid).map(m => m.userId)
const keptProjects = []
const goneProjects = new Set()
for (const pid of seedIds('projects')) {
  if (!live.projects.has(pid)) continue
  if (membersOf(pid).some(uid => !goneUsers.has(uid))) keptProjects.push(pid)
  else goneProjects.add(pid)
}

/* --- Rows ----------------------------------------------------------------------------- */

const deletes = new Map(COLLECTIONS.map(c => [c, new Set()]))
const updates = [] // [collection, id, patch, why]
deletes.set('users', goneUsers)
deletes.set('projects', goneProjects)

const tied = (row) => goneProjects.has(row.projectId) || goneUsers.has(row.userId)
for (const c of COLLECTIONS) {
  if (['settings', 'users', 'projects', 'sections'].includes(c)) continue
  const ids = seedIds(c)
  for (const [id, row] of live[c]) {
    if (ids.has(id) && !keptProjects.includes(row.projectId)) deletes.get(c).add(id)
    // Later history stays; later records of a removed group or account go with it.
    else if (!['auditLogs', 'outbox', 'groupDrafts'].includes(c) && tied(row)) deletes.get(c).add(id)
  }
}

// Drafts: a removed group's go; one with a removed member loses that seat.
for (const [id, d] of live.groupDrafts) {
  if (goneProjects.has(d.projectId)) { deletes.get('groupDrafts').add(id); continue }
  const members = d.members ?? []
  const left = members.filter(m => !goneUsers.has(m.userId))
  if (!left.length) deletes.get('groupDrafts').add(id)
  else if (left.length < members.length) updates.push(['groupDrafts', id, { members: left }, `drops ${members.length - left.length} old member(s)`])
}

// Sections: in use by anyone who stays → kept, without a removed instructor.
const keptSections = []
for (const sid of seedIds('sections')) {
  const sec = live.sections.get(sid)
  if (!sec) continue
  const users = [...live.users].filter(([id, u]) => !goneUsers.has(id) && u.block === sec.block).map(([, u]) => u.name)
  const groups = [...live.projects].filter(([id, p]) => !goneProjects.has(id) && p.sectionId === sid).map(([, p]) => p.title)
  const drafts = [...live.groupDrafts].filter(([id, d]) => !deletes.get('groupDrafts').has(id) && d.sectionId === sid)
  if (!users.length && !groups.length && !drafts.length) { deletes.get('sections').add(sid); continue }
  const who = [users.length && `${users.length} account(s): ${users.slice(0, 6).join(', ')}${users.length > 6 ? ', …' : ''}`,
    groups.length && `${groups.length} group(s)`, drafts.length && `${drafts.length} draft(s)`].filter(Boolean).join('; ')
  keptSections.push(`${sec.block} (${sid}) — ${who}`)
  if (goneUsers.has(sec.instructorId)) {
    updates.push(['sections', sid, { instructorId: null }, `${sec.block} loses ${live.users.get(sec.instructorId)?.name ?? sec.instructorId} as instructor`])
  }
}

/* --- Report ------------------------------------------------------------------------- */

let total = 0
console.log('Would delete:')
for (const [c, ids] of deletes) {
  if (!ids.size) continue
  total += ids.size
  console.log(`  ${c.padEnd(20)} ${ids.size}`)
}
console.log(`  ${'total'.padEnd(20)} ${total}`)
console.log(`\nAccounts going (${goneUsers.size}): ${[...goneUsers].map(id => live.users.get(id).name).slice(0, 12).join(', ')}${goneUsers.size > 12 ? ', …' : ''}`)
if (updates.length) {
  console.log('\nWould change:')
  for (const [c, id, , why] of updates) console.log(`  ${c}/${id}: ${why}`)
}
if (keptSections.length) console.log(`\nSections kept (in use):\n  ${keptSections.join('\n  ')}`)
if (keptProjects.length) console.log(`\nSeed groups kept (a staying account is a member): ${keptProjects.join(', ')}`)
if (withLogin.length) console.log(`\nSeed accounts kept — they have a login: ${withLogin.map(id => `${live.users.get(id).name} <${live.users.get(id).email}>`).join(', ')}`)

if (!confirm) {
  console.log('\nDry run. Add --confirm-live to delete the above.')
  process.exit(0)
}

/* --- Write ------------------------------------------------------------------------- */

const ops = [
  ...updates.map(([c, id, patch]) => (b) => b.update(db.collection(c).doc(id), patch)),
  ...[...deletes].flatMap(([c, ids]) => [...ids].map(id => (b) => b.delete(db.collection(c).doc(id)))),
]
const BATCH_LIMIT = 400
for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
  const batch = db.batch()
  ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch))
  await batch.commit()
}
console.log(`\nDone: ${total} deleted, ${updates.length} changed.`)
process.exit(0)
