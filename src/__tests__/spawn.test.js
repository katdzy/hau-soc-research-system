// The test panel's spawner (src/dev/spawn.js): accounts and groups made on
// demand must be ones the real workflow accepts.
import { it, expect, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { emptyStore } from '../backend/schema.js'
import { applyStage } from '../backend/stageBuilder.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, COURSES, PROGRAM_INFO, programByCode, sectionProblem } from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'
import { setSessionUserId } from '../state/session.js'
import { createProject, addMember } from '../services/actions.js'
import {
  spawnSection, dropSection, spawnStudent, dropStudent, spawnGroup, dropGroup, spawnFaculty, dropFaculty,
  spawnOffice, dropOffice, rolesForStage, starterStore, sectionsOf, studentsIn, groupsIn, plainFaculty, officeHolders,
  diffStores, spawnStudentsInBlock, sectionByBlock,
} from '../dev/spawn.js'

const users = (s) => Object.values(s.users)
const WD = programByCode('WD').name

beforeEach(async () => { await db.replaceAll(emptyStore()); setSessionUserId(null) })

it('spawn: sections number on per program and year, each with a newly spawned instructor', () => {
  let s = emptyStore()
  s = spawnSection(s, 'WD', COURSES.C1).store
  s = spawnSection(s, 'WD', COURSES.C2).store // also 4th year: next number
  s = spawnSection(s, 'CS', COURSES.C1).store // CS takes Capstone 1 in 3rd year
  const blocks = Object.values(s.sections).map(x => x.block).sort()
  expect(blocks).toEqual(['CS-301', 'WD-401', 'WD-402'])
  for (const sec of Object.values(s.sections)) {
    expect(sectionProblem(sec.block, sec.program, sec.course), sec.block).toBeNull()
    expect(s.users[sec.instructorId].globalRoles).toEqual([G.FACULTY])
  }
  s = dropSection(s, 'WD', COURSES.C2).store
  expect(sectionsOf(s, 'WD', COURSES.C2)).toEqual([])
  expect(sectionsOf(s, 'WD', COURSES.C1)).toHaveLength(1)
})

it('spawn: accounts are active, verified, demo, on the institutional domains, with unique names and addresses', () => {
  const s = starterStore()
  const all = users(s)
  expect(all.length).toBe(PROGRAM_INFO.length * (1 + 8 + 1) + 4 + 4)
  for (const u of all) {
    expect(u.status).toBe('Active')
    expect(u.emailVerified).toBe(true)
    expect(u.demo).toBe(true)
    expect(u.email).toMatch(/^test\.[a-z0-9.]+@(student\.)?hau\.edu\.ph$/)
  }
  expect(new Set(all.map(u => u.email)).size).toBe(all.length)
  expect(new Set(all.map(u => u.name)).size).toBe(all.length)
  for (const { name } of PROGRAM_INFO) expect(officeHolders(s.users, G.COORDINATOR, name), name).toHaveLength(1)
  for (const r of [G.DEAN, G.ASSOCIATE_DEAN, G.URO, G.ADMIN]) expect(officeHolders(s.users, r), r).toHaveLength(1)
})

it('spawn: − takes back the newest of its kind and clears what the account held', () => {
  let s = spawnSection(emptyStore(), 'WD', COURSES.C1).store
  const sec = Object.values(s.sections)[0]
  for (let i = 0; i < 5; i++) s = spawnStudent(s, sec.id).store
  s = spawnGroup(s, sec.id).store
  const grouped = Object.values(s.projectMembers).map(m => m.userId)
  // The one student with no group goes first.
  s = dropStudent(s, sec.id).store
  expect(studentsIn(s, sec).map(u => u.id).sort()).toEqual([...grouped].sort())
  // Then a grouped one, with their seat.
  s = dropStudent(s, sec.id).store
  expect(Object.values(s.projectMembers)).toHaveLength(3)

  s = spawnFaculty(s).store
  const extra = plainFaculty(s.users).find(u => u.spawned.kind === 'faculty')
  s = dropFaculty(s).store
  expect(s.users[extra.id]).toBeUndefined()
  expect(s.users[sec.instructorId]).toBeDefined() // the instructor goes last

  s = spawnOffice(s, G.COORDINATOR, WD).store
  expect(officeHolders(s.users, G.COORDINATOR, WD)).toHaveLength(1)
  s = dropOffice(s, G.COORDINATOR, WD).store
  expect(officeHolders(s.users, G.COORDINATOR, WD)).toHaveLength(0)

  expect(() => dropSection(s, 'WD', COURSES.C1)).toThrow(/still has 1 group/)
  s = dropGroup(s, sec.id).store
  expect(groupsIn(s, sec)).toEqual([])
  expect(Object.values(s.projectAssignments)).toEqual([])
  s = dropSection(s, 'WD', COURSES.C1).store
  expect(users(s).filter(u => u.globalRoles.includes(G.STUDENT))).toEqual([])
})

it('spawn: a formed group has GROUP_SIZE members and the section instructor as Instructor 1', () => {
  let s = spawnSection(emptyStore(), 'NW', COURSES.C1).store
  const sec = Object.values(s.sections)[0]
  const r = spawnGroup(s, sec.id) // no students yet: spawns them
  s = r.store
  const p = s.projects[r.projectId]
  expect(p.currentStage).toBe('GROUP_FORMATION')
  expect(Object.values(s.projectMembers).filter(m => m.projectId === p.id)).toHaveLength(FLAGS.GROUP_SIZE)
  expect(Object.values(s.projectAssignments)).toMatchObject([{ projectId: p.id, userId: sec.instructorId, roleType: P.INSTRUCTOR_1 }])
  expect(() => spawnGroup(spawnSection(s, 'NW', COURSES.C2).store, 'sec_nw402')).toThrow(/Capstone 1/)
})

it('spawn: the spawned section instructor can create a group and add spawned students through the guard', async () => {
  let s = spawnSection(emptyStore(), 'EMC', COURSES.C1).store
  const sec = Object.values(s.sections)[0]
  for (let i = 0; i < 2; i++) s = spawnStudent(s, sec.id).store
  await db.replaceAll(s)
  setSessionUserId(sec.instructorId)
  const teacher = db.snapshot().users.find(u => u.id === sec.instructorId)
  const project = await createProject(teacher, db.snapshot(), { title: 'Spawned group', sectionId: sec.id })
  for (const u of studentsIn(s, sec)) await addMember(teacher, db.snapshot(), project.id, u.id)
  const members = db.snapshot().projectMembers.filter(m => m.projectId === project.id)
  expect(members).toHaveLength(2)
})

it('spawn: rolesForStage fills the panel from the pool, never with the adviser or an office, and adds the offices', () => {
  let s = spawnSection(emptyStore(), 'CYB', COURSES.C1).store
  const sec = Object.values(s.sections)[0]
  const g = spawnGroup(s, sec.id)
  const { store, roles } = rolesForStage(g.store, g.projectId)
  expect(roles[P.INSTRUCTOR_1]).toBe(sec.instructorId)
  const panel = [roles[P.PANEL_CHAIR], ...roles[P.PANEL_MEMBER]]
  expect(panel).not.toContain(roles[P.ADVISER])
  expect(new Set([roles[P.ADVISER], ...panel]).size).toBe(3)
  for (const id of [roles[P.ADVISER], ...panel]) expect(store.users[id].globalRoles).toEqual([G.FACULTY])
  for (const r of [G.DEAN, G.ASSOCIATE_DEAN, G.URO]) expect(officeHolders(store.users, r)).toHaveLength(1)
  // The stage builder accepts them all the way to the end.
  const done = applyStage(store, g.projectId, 'ARCHIVED', { roles })
  expect(done.projects[g.projectId].currentStage).toBe('ARCHIVED')
})

it('lists what a spawn or a removal changes, document by document (what the live spawner sends)', () => {
  const start = starterStore()
  const sec = sectionsOf(start, 'WD', COURSES.C1)[0]

  const added = spawnGroup(start, sec.id)
  const adds = diffStores(start, added.store)
  expect(adds.every(c => c.kind === 'create')).toBe(true)
  expect(adds.filter(c => c.collection === 'projectMembers')).toHaveLength(FLAGS.GROUP_SIZE)
  expect(adds.find(c => c.collection === 'projects').row.spawned).toBeTruthy()

  // Removing the section's instructor deletes the account and clears the section's teacher.
  const teacher = start.users[sec.instructorId]
  const without = structuredClone(start)
  delete without.users[teacher.id]
  without.sections[sec.id] = { ...without.sections[sec.id], instructorId: null }
  const changes = diffStores(start, without)
  expect(changes).toEqual([
    { collection: 'users', id: teacher.id, kind: 'delete' },
    { collection: 'sections', id: sec.id, kind: 'update', row: without.sections[sec.id] },
  ].sort((a, b) => Object.keys(start).indexOf(a.collection) - Object.keys(start).indexOf(b.collection)))
  expect(diffStores(start, start)).toEqual([])
})


it('spawn: students go into the section you name, which is made (with its instructor) when it is new', () => {
  let s = spawnSection(emptyStore(), 'WD', COURSES.C1).store // WD-401
  const wd401 = sectionByBlock(s, 'wd-401', COURSES.C1)
  let r = spawnStudentsInBlock(s, 'wd-401', COURSES.C1, 3)
  expect(r.sectionId).toBe(wd401.id)
  expect(Object.keys(r.store.sections)).toHaveLength(1)
  expect(studentsIn(r.store, wd401)).toHaveLength(3)
  s = r.store

  r = spawnStudentsInBlock(s, 'WD-405', COURSES.C1, 2)
  const wd405 = r.store.sections[r.sectionId]
  expect(wd405).toMatchObject({ block: 'WD-405', course: COURSES.C1, program: WD })
  expect(sectionProblem(wd405.block, wd405.program, wd405.course)).toBeNull()
  expect(r.store.users[wd405.instructorId].globalRoles).toEqual([G.FACULTY])
  expect(studentsIn(r.store, wd405).map(u => u.block)).toEqual(['WD-405', 'WD-405'])
  expect(r.note).toMatch(/new Capstone 1 section/)

  // WD takes both courses in 4th year: a Capstone 2 WD-401 is a second section, not the first one again.
  r = spawnStudentsInBlock(r.store, 'WD-401', COURSES.C2, 1)
  expect(r.sectionId).not.toBe(wd401.id)
  expect(r.store.sections[wd401.id].course).toBe(COURSES.C1)

  expect(() => spawnStudentsInBlock(s, 'CS-401', COURSES.C1)).toThrow(/3rd Year/)
  expect(() => spawnStudentsInBlock(s, 'XX-401', COURSES.C1)).toThrow(/program code/)
  expect(() => spawnStudentsInBlock(s, 'WD-401', COURSES.C1, 0)).toThrow(/at least one/)
})
