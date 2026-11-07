// Sections (revision 2026-11-07, OQ#5): the Program Chair/Coordinator sets up
// the sections of the programs they coordinate and names who teaches each.
// Prof. Alpha coordinates WD and CS; Prof. Bravo teaches WD-401 (G1, G2, G4).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { setSessionUserId } from '../state/session.js'
import { createSection, setSectionInstructor, removeSection, sectionHandover } from '../services/actions.js'
import { resolveInstitution, can } from '../domain/caac.js'
import { COURSES, PROJECT_ROLES as P, termOf, termProblem } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const sec = (block, course = COURSES.C1) => snap().sections.find(s => s.block === block && s.course === course)
const i1Of = (pid) => snap().projectAssignments.filter(a => a.projectId === pid && a.roleType === P.INSTRUCTOR_1).map(a => a.userId)
const term = 'AY 2026–2027, 1st Semester'

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await db.replaceAll(buildSeed()); setSessionUserId(null) })

describe('who may manage sections', () => {
  it('a Program Chair/Coordinator with programs holds section.manage; nobody else does', () => {
    expect(can(resolveInstitution(user('f_alpha'), snap()), 'section.manage')).toBe(true)
    for (const id of ['f_bravo', 'f_delta', 'a_sierra', 's_kilo']) {
      expect(can(resolveInstitution(user(id), snap()), 'section.manage')).toBe(false)
    }
  })

  it('a coordinator with no programs yet holds it dormant, and the guard says why', async () => {
    await db.update('users', 'f_alpha', { programScope: [] })
    const inst = resolveInstitution(user('f_alpha'), snap())
    expect(can(inst, 'section.manage')).toBe(false)
    await expect(createSection(as('f_alpha'), null, { block: 'WD-405', course: COURSES.C1, term }))
      .rejects.toThrow(/coordinate at least one program/)
  })

  it('the service refuses anyone without the capability, whatever the UI shows', async () => {
    await expect(createSection(as('a_sierra'), null, { block: 'WD-405', course: COURSES.C1, term }))
      .rejects.toThrow(/Not permitted/)
    await expect(setSectionInstructor(as('f_bravo'), null, sec('WD-401').id, 'f_charlie'))
      .rejects.toThrow(/Not permitted/)
  })
})

describe('createSection', () => {
  it('adds a section in a program you coordinate, with its instructor, and tells them', async () => {
    await createSection(as('f_alpha'), null, { block: 'wd-405', course: COURSES.C1, term, instructorId: 'f_charlie' })
    const s = sec('WD-405')
    expect(s).toMatchObject({ program: user('f_alpha').programScope[0], yearLevel: '4th Year', term, instructorId: 'f_charlie' })
    // Teaching it makes Prof. Charlie an Instructor 1 who can create groups.
    expect(can(resolveInstitution(user('f_charlie'), snap()), 'group.create')).toBe(true)
    expect(snap().outbox.some(m => m.event === 'Section assigned' && m.userIds.includes('f_charlie'))).toBe(true)
    expect(snap().auditLogs.some(a => a.action === 'SECTION_CREATED' && a.entityId === s.id)).toBe(true)
  })

  it('refuses a program you do not coordinate, a bad name, a bad term, a duplicate and a non-faculty instructor', async () => {
    const me = as('f_alpha')
    await expect(createSection(me, null, { block: 'NW-405', course: COURSES.C1, term })).rejects.toThrow(/not in a program you coordinate/)
    await expect(createSection(me, null, { block: 'WD405', course: COURSES.C1, term })).rejects.toThrow(/program code, year level/)
    await expect(createSection(me, null, { block: 'CS-405', course: COURSES.C1, term })).rejects.toThrow(/take Capstone 1 in 3rd Year/)
    await expect(createSection(me, null, { block: 'WD-405', course: COURSES.C1, term: '2026 first sem' })).rejects.toThrow(/Enter the term/)
    await expect(createSection(me, null, { block: 'WD-401', course: COURSES.C1, term })).rejects.toThrow(/already exists/)
    await expect(createSection(me, null, { block: 'WD-405', course: COURSES.C1, term, instructorId: 's_kilo' })).rejects.toThrow(/faculty accounts only/)
    await expect(createSection(me, null, { block: 'WD-405', course: COURSES.C1, term, instructorId: 'f_papa' })).rejects.toThrow(/not active/)
  })

  it('WD-401 may name a Capstone 2 section too, since WD takes both in 4th year', async () => {
    await createSection(as('f_alpha'), null, { block: 'WD-401', course: COURSES.C2, term })
    expect(sec('WD-401', COURSES.C2)).toMatchObject({ instructorId: null })
  })
})

describe('setSectionInstructor', () => {
  it('moves the Capstone 1 groups’ Instructor 1 seat to the new instructor', async () => {
    const s = sec('WD-401')
    expect(sectionHandover(snap(), s, 'f_charlie').map(h => h.projectId)).toEqual(expect.arrayContaining(['p_g1', 'p_g2']))
    await setSectionInstructor(as('f_alpha'), null, s.id, 'f_charlie')
    expect(sec('WD-401').instructorId).toBe('f_charlie')
    expect(i1Of('p_g1')).toEqual(['f_charlie'])
    expect(i1Of('p_g2')).toEqual(['f_charlie'])
    // Prof. Bravo no longer teaches a section, so no longer creates groups.
    expect(can(resolveInstitution(user('f_bravo'), snap()), 'group.create')).toBe(false)
    const mail = (event) => snap().outbox.filter(m => m.event === event).flatMap(m => m.userIds)
    expect(mail('Section assigned')).toContain('f_charlie')
    expect(mail('Section reassigned')).toContain('f_bravo')
    expect(snap().workflowHistory.filter(h => h.projectId === 'p_g1' && h.action === 'ROLE_ASSIGNED').length).toBeGreaterThan(0)
  })

  it('leaves groups past Capstone 1 with their Instructor 1', async () => {
    await db.update('projects', 'p_g2', { currentStage: 'IMPLEMENTATION' })
    await setSectionInstructor(as('f_alpha'), null, sec('WD-401').id, 'f_charlie')
    expect(i1Of('p_g1')).toEqual(['f_charlie'])
    expect(i1Of('p_g2')).toEqual(['f_bravo'])
  })

  it('clearing the instructor moves no group', async () => {
    await setSectionInstructor(as('f_alpha'), null, sec('WD-401').id, null)
    expect(sec('WD-401').instructorId).toBeNull()
    expect(i1Of('p_g1')).toEqual(['f_bravo'])
  })

  it('refuses a section outside your programs and a no-op change', async () => {
    await expect(setSectionInstructor(as('f_npc_nw1'), null, sec('WD-401').id, 'f_charlie')).rejects.toThrow(/not in a program you coordinate/)
    await expect(setSectionInstructor(as('f_alpha'), null, sec('WD-401').id, 'f_bravo')).rejects.toThrow(/already teaches/)
  })
})

describe('removeSection', () => {
  it('removes an unused section only', async () => {
    await expect(removeSection(as('f_alpha'), null, sec('WD-401').id)).rejects.toThrow(/has \d+ groups/)
    await createSection(as('f_alpha'), null, { block: 'WD-409', course: COURSES.C1, term })
    await removeSection(as('f_alpha'), null, sec('WD-409').id)
    expect(sec('WD-409')).toBeUndefined()
    expect(snap().auditLogs.some(a => a.action === 'SECTION_REMOVED')).toBe(true)
  })
})

it('terms read like "AY 2026–2027, 1st Semester"', () => {
  expect(termProblem(term)).toBeNull()
  expect(termProblem('AY 2026–2028, 1st Semester')).toMatch(/consecutive/)
  expect(termOf(new Date(2026, 10, 7))).toBe(term)
  expect(termOf(new Date(2027, 1, 1))).toBe('AY 2026–2027, 2nd Semester')
})
