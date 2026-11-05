// Dev-only (R9). The test panel's spawner: sections, students, groups, faculty
// and office holders made on demand, one − / + at a time, instead of a fixed
// cast. Every function takes the keyed store (`toStore(snap)`) and returns a
// new one plus a line saying what changed; the panel writes it with
// replaceStore, or on a live project sends the difference (diffStores) to the
// dev server, which makes real logins for new accounts. Nothing here goes
// through the guard — it sets data up, it does not act as anyone.
//
// Spawned accounts are active and verified, carry `demo: true` (never mailed,
// functions/mailRouting.js) and `spawned` (what the − buttons take back).
// Addresses start with `test.` so they cannot be mistaken for real people's.

import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, COURSES, PROGRAM_INFO, programByCode, yearLevelOf, parseSection,
  normalizeSection, sectionProblem,
} from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'
import { emptyStore } from '../backend/schema.js'

export const TERM = 'AY 2026–2027, 1st Semester'

const FIRST = [
  'Andrea', 'Bea', 'Carlo', 'Dana', 'Elijah', 'Francine', 'Gabriel', 'Hannah', 'Ivan', 'Jasmine', 'Kenneth', 'Lara',
  'Miguel', 'Nicole', 'Oliver', 'Patricia', 'Quinn', 'Rafael', 'Sofia', 'Tristan', 'Ursula', 'Vince', 'Wendy', 'Xavier',
  'Ysabel', 'Zach', 'Paolo', 'Kristine', 'Joaquin', 'Angela', 'Marco', 'Bianca',
]
const LAST = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino', 'Castillo',
  'Navarro', 'Dizon', 'Manalo', 'Lacson', 'Pineda', 'Tolentino', 'Sison', 'Gomez', 'Salvador', 'David', 'Mercado',
  'Yabut', 'Lansangan', 'Zapanta', 'Guevarra', 'Pangilinan', 'Tiongson', 'Dela Cruz', 'Ocampo', 'Serrano',
]

// Office holders the spawner makes. Program Chairs are per program.
export const OFFICE_ROLES = [G.COORDINATOR, G.DEAN, G.ASSOCIATE_DEAN, G.URO, G.ADMIN]
const OFFICE_SLUG = {
  [G.COORDINATOR]: 'pc', [G.DEAN]: 'dean', [G.ASSOCIATE_DEAN]: 'ad', [G.URO]: 'uro', [G.ADMIN]: 'admin',
}
const OFFICE_TITLE = {
  [G.COORDINATOR]: 'Prof.', [G.DEAN]: 'Dean', [G.ASSOCIATE_DEAN]: 'Dr.', [G.URO]: 'Dr.', [G.ADMIN]: '',
}

const now = () => new Date().toISOString()
const values = (col) => Object.values(col ?? {})
const copy = (store) => ({ ...emptyStore(), ...Object.fromEntries(Object.entries(store).map(([k, v]) => [k, { ...v }])) })
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '')
/** WD-401 → wd401, for ids. */
const blockKey = (block) => block.toLowerCase().replace(/[^a-z0-9]/g, '')
const pad = (n) => String(n).padStart(2, '0')

const isStudent = (u) => (u.globalRoles ?? []).includes(G.STUDENT)
const isFaculty = (u) => !isStudent(u) && (u.globalRoles ?? []).includes(G.FACULTY)
const holdsOffice = (u) => (u.globalRoles ?? []).some(r => OFFICE_ROLES.includes(r))

/** Next free number after the highest `prefix<n>` id in a collection. */
function nextSeq(col, prefix) {
  let max = 0
  for (const id of Object.keys(col ?? {})) {
    if (id.startsWith(prefix)) max = Math.max(max, Number(id.slice(prefix.length)) || 0)
  }
  return max + 1
}

/** A first + last name nobody in the store has yet. */
function freshName(users, salt) {
  const taken = new Set(values(users).map(u => u.name.replace(/^(Prof\.|Dean|Dr\.)\s+/, '')))
  const n = FIRST.length * LAST.length
  for (let i = 0; i < n; i++) {
    const k = (salt * 97 + i) % n // 97 is coprime with n: every name once, neighbours far apart
    const name = `${FIRST[k % FIRST.length]} ${LAST[Math.floor(k / FIRST.length)]}`
    if (!taken.has(name)) return name
  }
  return `Test Person ${salt}`
}

function account(store, id, { title = '', domain, globalRoles, spawned, ...extra }) {
  const seq = Object.keys(store.users).length + 1
  const person = freshName(store.users, seq)
  const local = `test.${slug(person.split(' ')[0])}.${slug(person.split(' ').slice(1).join(''))}`
  let email = `${local}${domain}`
  for (let i = 2; values(store.users).some(u => u.email === email); i++) email = `${local}${i}${domain}`
  const user = {
    id, name: title ? `${title} ${person}` : person, email, globalRoles, programScope: [],
    status: 'Active', emailVerified: true, verifyToken: null, demo: true,
    idNumber: '', program: '', yearLevel: '', block: '', createdAt: now(),
    spawned: { ...spawned, at: now() }, ...extra,
  }
  store.users[id] = user
  return user
}

/** The newest of `rows` (by spawn time, then id), or null. */
const newest = (rows) => [...rows].sort((a, b) =>
  String(b.spawned?.at ?? b.createdAt ?? '').localeCompare(String(a.spawned?.at ?? a.createdAt ?? '')) ||
  b.id.localeCompare(a.id, undefined, { numeric: true }))[0] ?? null

/** Drop an account and every membership, assignment and draft seat it holds. */
function removeUser(store, userId) {
  delete store.users[userId]
  for (const [id, m] of Object.entries(store.projectMembers)) if (m.userId === userId) delete store.projectMembers[id]
  for (const [id, a] of Object.entries(store.projectAssignments)) if (a.userId === userId) delete store.projectAssignments[id]
  for (const [id, s] of Object.entries(store.sections)) if (s.instructorId === userId) store.sections[id] = { ...s, instructorId: null }
  for (const [id, d] of Object.entries(store.groupDrafts)) {
    if ((d.members ?? []).some(m => m.userId === userId)) {
      store.groupDrafts[id] = { ...d, members: d.members.filter(m => m.userId !== userId) }
    }
  }
}

/* --- Faculty and offices ----------------------------------------------------------- */

export function spawnFaculty(store) {
  const s = copy(store)
  const id = `t_f_${pad(nextSeq(s.users, 't_f_'))}`
  const u = account(s, id, { title: 'Prof.', domain: '@hau.edu.ph', globalRoles: [G.FACULTY], spawned: { kind: 'faculty' } })
  return { store: s, note: `Added ${u.name} (faculty).`, user: u }
}

/** Faculty with no office: the pool advisers, panelists and instructors come from. */
export const plainFaculty = (users) => values(users).filter(u => isFaculty(u) && !holdsOffice(u))

export function dropFaculty(store) {
  const s = copy(store)
  // Section instructors go last, so a section keeps its teacher while it can.
  const pool = plainFaculty(s.users)
  const u = newest(pool.filter(x => x.spawned?.kind !== 'instructor')) ?? newest(pool)
  if (!u) return { store, note: 'No faculty to remove.' }
  removeUser(s, u.id)
  return { store: s, note: `Removed ${u.name} and their assignments.` }
}

export function officeHolders(users, role, program = null) {
  return values(users).filter(u => (u.globalRoles ?? []).includes(role) &&
    (!program || (u.programScope ?? []).includes(program)))
}

export function spawnOffice(store, role, program = null) {
  if (role === G.COORDINATOR && !program) throw new Error('A Program Chair needs a program.')
  const s = copy(store)
  const tag = role === G.COORDINATOR ? `${OFFICE_SLUG[role]}_${programByCode(codeOfProgram(program)).code.toLowerCase()}` : OFFICE_SLUG[role]
  const prefix = `t_o_${tag}_`
  const id = `${prefix}${nextSeq(s.users, prefix)}`
  const u = account(s, id, {
    title: OFFICE_TITLE[role], domain: '@hau.edu.ph', globalRoles: [G.FACULTY, role],
    spawned: { kind: 'office', role, program }, ...(program ? { programScope: [program] } : {}),
  })
  const where = program ? ` for ${codeOfProgram(program)}` : ''
  return { store: s, note: `Added ${u.name} (${role}${where}).`, user: u }
}

export function dropOffice(store, role, program = null) {
  const s = copy(store)
  const u = newest(officeHolders(s.users, role, program))
  if (!u) return { store, note: `No ${role} to remove.` }
  removeUser(s, u.id)
  return { store: s, note: `Removed ${u.name} (${role}).` }
}

/* --- Sections ----------------------------------------------------------------------- */

const codeOfProgram = (program) => PROGRAM_INFO.find(p => p.name === program || p.code === program)?.code ?? program

export const sectionsOf = (store, code, course) => values(store.sections)
  .filter(x => x.course === course && parseSection(x.block)?.code === code)

/**
 * A new section of `code`'s `course`, numbered after the program's existing
 * blocks in that year (WD's Capstone 1 and 2 are both 4th year, so they share
 * the numbers), taught by a newly spawned faculty member.
 */
export function spawnSection(store, code, course) {
  const info = programByCode(code)
  if (!info) throw new Error(`Unknown program ${code}`)
  const year = info.capstone[course].year
  const used = new Set(values(store.sections).map(x => x.block))
  let n = 1
  while (used.has(`${info.code}-${year}${pad(n)}`)) n++
  const { store: s, section, instructor } = addSection(store, `${info.code}-${year}${pad(n)}`, course)
  return { store: s, note: `Added ${section.block} (${course}), taught by ${instructor.name}.` }
}

/** A section named `block` of `course`, taught by a newly spawned faculty member. The caller checks the name. */
function addSection(store, block, course) {
  const added = spawnFaculty(store)
  const s = added.store
  const instructor = { ...added.user, spawned: { kind: 'instructor', at: added.user.spawned.at } }
  s.users[instructor.id] = instructor
  // WD's Capstone 1 and 2 are both 4th year, so WD-401 may name one of each.
  let id = `sec_${blockKey(block)}`
  if (s.sections[id]) id = `${id}_${course === COURSES.C2 ? 'c2' : 'c1'}`
  const section = {
    id, course, block, program: parseSection(block).program, yearLevel: yearLevelOf(block), term: TERM,
    instructorId: instructor.id, spawned: { at: now() },
  }
  s.sections[id] = section
  return { store: s, section, instructor }
}

/** The `course` section named `block` (any case), or null. */
export const sectionByBlock = (store, block, course) =>
  values(store.sections).find(x => x.block === normalizeSection(block) && x.course === course) ?? null

/**
 * `count` students in the `course` section named `block` — e.g. WD-405 — made
 * first, with its own instructor, when there is none by that name yet.
 */
export function spawnStudentsInBlock(store, block, course, count = 1) {
  const problem = sectionProblem(block, null, course)
  if (problem) throw new Error(problem)
  if (!Number.isInteger(count) || count < 1) throw new Error('Add at least one student.')
  let s = store
  let sec = sectionByBlock(s, block, course)
  let made = null
  if (!sec) {
    const r = addSection(s, normalizeSection(block), course)
    s = r.store; sec = r.section; made = r.instructor
  }
  for (let i = 0; i < count; i++) s = spawnStudent(s, sec.id).store
  const who = count === 1 ? '1 student' : `${count} students`
  const where = made ? `${sec.block}, a new ${course} section taught by ${made.name}` : sec.block
  return { store: s, note: `Added ${who} to ${where}.`, sectionId: sec.id }
}

/** Remove the newest section of `code`'s `course` with its students. Refuses while it has groups. */
export function dropSection(store, code, course) {
  const sec = newest(sectionsOf(store, code, course))
  if (!sec) return { store, note: `No ${code} ${course} section to remove.` }
  const groups = values(store.projects).filter(p => p.sectionId === sec.id)
  if (groups.length) throw new Error(`${sec.block} still has ${groups.length} group${groups.length > 1 ? 's' : ''} — remove them first.`)
  const s = copy(store)
  delete s.sections[sec.id]
  const students = studentsIn(s, sec)
  for (const u of students) removeUser(s, u.id)
  for (const [id, d] of Object.entries(s.groupDrafts)) if (d.sectionId === sec.id) delete s.groupDrafts[id]
  return { store: s, note: `Removed ${sec.block}${students.length ? ` and its ${students.length} student${students.length > 1 ? 's' : ''}` : ''}.` }
}

export function setInstructor(store, sectionId, userId) {
  const s = copy(store)
  const sec = s.sections[sectionId]
  if (!sec) throw new Error('Unknown section')
  s.sections[sectionId] = { ...sec, instructorId: userId || null }
  return { store: s, note: `${sec.block} is now taught by ${s.users[userId]?.name ?? 'nobody'}.` }
}

/* --- Students and groups ------------------------------------------------------------- */

export const studentsIn = (store, sec) => values(store.users).filter(u => isStudent(u) && u.block === sec.block)
export const groupsIn = (store, sec) => values(store.projects).filter(p => p.sectionId === sec.id)
const inGroup = (store, userId) => values(store.projectMembers).some(m => m.userId === userId)

export function spawnStudent(store, sectionId) {
  const sec = store.sections[sectionId]
  if (!sec) throw new Error('Unknown section')
  const s = copy(store)
  const prefix = `t_s_${blockKey(sec.block)}_`
  const id = `${prefix}${pad(nextSeq(s.users, prefix))}`
  const idSeq = values(s.users).filter(isStudent).length + 1
  const u = account(s, id, {
    domain: '@student.hau.edu.ph', globalRoles: [G.STUDENT], spawned: { kind: 'student', sectionId },
    idNumber: `2023-${String(5000 + idSeq).padStart(4, '0')}`, program: sec.program,
    yearLevel: yearLevelOf(sec.block), block: sec.block,
  })
  return { store: s, note: `Added ${u.name} to ${sec.block}.`, user: u }
}

/** Remove the newest student of a section — one with no group if there is one. */
export function dropStudent(store, sectionId) {
  const sec = store.sections[sectionId]
  const all = sec ? studentsIn(store, sec) : []
  const u = newest(all.filter(x => !inGroup(store, x.id))) ?? newest(all)
  if (!u) return { store, note: 'No students to remove.' }
  const s = copy(store)
  removeUser(s, u.id)
  return { store: s, note: `Removed ${u.name}${inGroup(store, u.id) ? ' (and their group seat)' : ''}.` }
}

/**
 * A group at Group Formation in a Capstone 1 section, as Instructor 1 would
 * create it: the section's instructor holds Instructor 1, and GROUP_SIZE of the
 * section's students with no group join it (spawned if the section is short).
 */
export function spawnGroup(store, sectionId) {
  let s = copy(store)
  const sec = s.sections[sectionId]
  if (!sec) throw new Error('Unknown section')
  if (sec.course !== COURSES.C1) throw new Error('Groups are formed in Capstone 1 sections.')
  if (!sec.instructorId || !s.users[sec.instructorId]) throw new Error(`${sec.block} has no instructor.`)
  let free = studentsIn(s, sec).filter(u => !inGroup(s, u.id) &&
    !values(s.groupDrafts).some(d => ['Draft', 'Returned', 'Submitted'].includes(d.status) && d.members.some(m => m.userId === u.id)))
  let added = 0
  while (free.length < FLAGS.GROUP_SIZE) {
    const r = spawnStudent(s, sectionId)
    s = r.store; free = [...free, r.user]; added++
  }
  const n = groupsIn(s, sec).length + 1
  const projectId = `p_t_${blockKey(sec.block)}_${nextSeq(s.projects, `p_t_${blockKey(sec.block)}_`)}`
  const at = now()
  s.projects[projectId] = {
    id: projectId, title: `Untitled — Group ${n} (${sec.block})`, previousTitles: [], category: 'Capstone',
    researchArea: 'Not yet set', program: sec.program, term: sec.term, block: sec.block, sectionId: sec.id,
    currentStage: 'GROUP_FORMATION', status: 'Active', archiveResult: null,
    revisionClass: null, revisionDeadline: null, revisionStatus: null,
    milestonesConfirmedAt: null, milestonesConfirmedBy: null, milestones: {}, adviserApprovals: {},
    readinessConfirmedAt: null, readinessConfirmedBy: null, postDefenseConfirmedAt: null, postDefenseConfirmedBy: null,
    uroReturns: [], createdAt: at, spawned: { at },
  }
  s.projectAssignments[`a_${projectId}_i1`] = {
    id: `a_${projectId}_i1`, projectId, userId: sec.instructorId, roleType: P.INSTRUCTOR_1,
    status: 'Accepted', assignedAt: at, assignedBy: sec.instructorId,
  }
  for (const u of free.slice(0, FLAGS.GROUP_SIZE)) {
    s.projectMembers[`m_${projectId}_${u.id}`] = { id: `m_${projectId}_${u.id}`, projectId, userId: u.id, joinedAt: at }
  }
  s.workflowHistory[`h_${projectId}_0`] = {
    id: `h_${projectId}_0`, projectId, fromStage: null, toStage: 'GROUP_FORMATION', actorId: sec.instructorId,
    action: 'GROUP_CREATED', hat: P.INSTRUCTOR_1, note: 'Spawned from the test panel', at,
  }
  const extra = added ? ` (${added} new student${added > 1 ? 's' : ''})` : ''
  return { store: s, note: `Formed Group ${n} in ${sec.block}${extra}.`, projectId }
}

// Every collection that holds a project's own records.
const PROJECT_SCOPED = ['projectMembers', 'projectAssignments', 'documents', 'annotations', 'reviews', 'aiSummaries',
  'weeklyLogs', 'defenses', 'forms', 'workflowHistory', 'permissionOverrides']

/** Remove the newest group of a section and its records. The students stay. Audit and outbox are kept. */
export function dropGroup(store, sectionId) {
  const sec = store.sections[sectionId]
  const p = sec ? newest(groupsIn(store, sec)) : null
  if (!p) return { store, note: 'No groups to remove.' }
  const s = copy(store)
  delete s.projects[p.id]
  for (const col of PROJECT_SCOPED) {
    for (const [id, r] of Object.entries(s[col] ?? {})) if (r.projectId === p.id) delete s[col][id]
  }
  for (const [id, d] of Object.entries(s.groupDrafts)) if (d.projectId === p.id) delete s.groupDrafts[id]
  return { store: s, note: `Removed ${p.title}. Its students are back in ${sec.block} with no group.` }
}

/* --- Jumping a group to a stage ------------------------------------------------------ */

/**
 * Who holds each project role when the stage builder moves `projectId` on:
 * whoever already holds it, else faculty from the pool — never the Adviser on
 * the panel (BLOCK_ADVISER_ON_PANEL), never office holders. Spawns faculty
 * when the pool is too small.
 */
export function rolesForStage(store, projectId) {
  let s = store
  const p = s.projects[projectId]
  if (!p) throw new Error('Unknown project')
  const held = (role) => values(s.projectAssignments).filter(a => a.projectId === projectId && a.roleType === role).map(a => a.userId)
  const instructor = s.sections[p.sectionId]?.instructorId ?? null
  const i1 = held(P.INSTRUCTOR_1)[0] ?? instructor
  // Faculty who teach no section first, so instructors are not on every panel.
  const teaches = (id) => values(s.sections).some(x => x.instructorId === id)
  const pool = () => plainFaculty(s.users).map(u => u.id).filter(id => id !== i1)
    .sort((a, b) => Number(teaches(a)) - Number(teaches(b)))
  let spawned = 0
  while (pool().length < (i1 ? 3 : 4)) { s = spawnFaculty(s).store; spawned++ }
  // Later stages are signed off by the offices; make sure each exists.
  for (const [role, program] of [[G.COORDINATOR, p.program], [G.DEAN], [G.ASSOCIATE_DEAN], [G.URO]]) {
    if (!officeHolders(s.users, role, program).length) { s = spawnOffice(s, role, program).store; spawned++ }
  }
  const free = pool()
  const take = (exclude) => free.find(id => !exclude.includes(id))
  const adviser = held(P.ADVISER)[0] ?? take([])
  const chair = held(P.PANEL_CHAIR)[0] ?? take([adviser])
  const member = held(P.PANEL_MEMBER)[0] ?? take([adviser, chair])
  const i2 = held(P.INSTRUCTOR_2)[0] ?? i1 ?? chair
  return {
    store: s, spawned,
    roles: {
      [P.INSTRUCTOR_1]: i1 ?? take([adviser, chair, member]), [P.ADVISER]: adviser,
      [P.PANEL_CHAIR]: chair, [P.PANEL_MEMBER]: [member], [P.INSTRUCTOR_2]: i2,
    },
  }
}

/* --- Live projects --------------------------------------------------------------------- */

/**
 * What turns `before` into `after` (keyed stores): one
 * `{ collection, id, kind: 'create' | 'update' | 'delete', row }` per document.
 * On a live project the panel sends this to the dev server
 * (scripts/live-spawn/devServer.mjs) instead of replacing the store.
 */
export function diffStores(before, after) {
  const changes = []
  for (const collection of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[collection] ?? {}
    const now = after[collection] ?? {}
    for (const [id, row] of Object.entries(now)) {
      if (!was[id]) changes.push({ collection, id, kind: 'create', row })
      else if (JSON.stringify(was[id]) !== JSON.stringify(row)) changes.push({ collection, id, kind: 'update', row })
    }
    for (const id of Object.keys(was)) if (!now[id]) changes.push({ collection, id, kind: 'delete' })
  }
  return changes
}

/* --- Presets --------------------------------------------------------------------------- */

/**
 * A small working school to start from: a Capstone 1 section per program with
 * eight students, four more faculty, a Program Chair per program and one of
 * each office. No groups — form them in the app (or with + Group).
 */
export function starterStore(store = emptyStore()) {
  let s = copy(store)
  for (const { code, name } of PROGRAM_INFO) {
    s = spawnSection(s, code, COURSES.C1).store
    const sec = newest(sectionsOf(s, code, COURSES.C1))
    for (let i = 0; i < 8; i++) s = spawnStudent(s, sec.id).store
    s = spawnOffice(s, G.COORDINATOR, name).store
  }
  for (let i = 0; i < 4; i++) s = spawnFaculty(s).store
  for (const role of OFFICE_ROLES.filter(r => r !== G.COORDINATOR)) s = spawnOffice(s, role).store
  return s
}
