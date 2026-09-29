// Program names, the capstone schedule per program, and section names
// (WD-401 …; CS-301 for Capstone 1, CS-401 for Capstone 2).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { setSessionUserId } from '../state/session.js'
import { registerAccount } from '../services/actions.js'
import { sectionNow } from '../domain/stages.js'
import {
  PROGRAM_INFO, COURSES, courseSchedule, sectionProblem, parseSection, yearLevelOf, capstone2SectionOf, nextSemester,
} from '../domain/constants.js'

const name = (code) => PROGRAM_INFO.find(p => p.code === code).name

describe('programs and the capstone schedule', () => {
  it('lists the five programs by their full names and codes', () => {
    expect(PROGRAM_INFO.map(p => [p.code, p.name])).toEqual([
      ['WD', 'Bachelor of Science Major in Information Technology with area of specialization in Web Development'],
      ['NW', 'Bachelor of Science Major in Information Technology with area of specialization in Network Administration'],
      ['CS', 'Bachelor of Science Major in Computer Science'],
      ['EMC', 'Bachelor of Science Major in Entertainment and Multimedia Computing'],
      ['CYB', 'Bachelor of Science Major in Cybersecurity'],
    ])
  })

  it('every program takes Capstone 1 and 2 in 4th year — except CS (3rd year 2nd sem, then 4th year 1st sem)', () => {
    for (const code of ['WD', 'NW', 'EMC', 'CYB']) {
      expect(courseSchedule(name(code), COURSES.C1)).toBe('4th Year, 1st Semester')
      expect(courseSchedule(name(code), COURSES.C2)).toBe('4th Year, 2nd Semester')
    }
    expect(courseSchedule(name('CS'), COURSES.C1)).toBe('3rd Year, 2nd Semester')
    expect(courseSchedule(name('CS'), COURSES.C2)).toBe('4th Year, 1st Semester')
  })
})

describe('sections', () => {
  it('accepts WD-401…, CS-301 and CS-401; rejects wrong program, year or shape', () => {
    expect(sectionProblem('wd-401', name('WD'))).toBeNull()
    expect(sectionProblem(' WD-403 ', name('WD'))).toBeNull()
    expect(sectionProblem('CS-301', name('CS'), COURSES.C1)).toBeNull()
    expect(sectionProblem('CS-401', name('CS'), COURSES.C2)).toBeNull()
    expect(sectionProblem('CS-401', name('CS'), COURSES.C1)).toMatch(/3rd Year/)
    expect(sectionProblem('WD-301', name('WD'))).toMatch(/4th Year/)
    expect(sectionProblem('NW-401', name('WD'))).toMatch(/not a WD section/)
    expect(sectionProblem('WD-4A', name('WD'))).toMatch(/e\.g\. WD-401/)
    expect(sectionProblem('XX-401', null)).toMatch(/program code/)
    expect(parseSection('emc-402')).toMatchObject({ code: 'EMC', year: 4, number: '02' })
    expect(yearLevelOf('CS-301')).toBe('3rd Year')
  })

  it('Capstone 2 follows Capstone 1: same section for 4th-year programs; CS-301 → CS-401 the next year', () => {
    expect(capstone2SectionOf('WD-402')).toBe('WD-402')
    expect(capstone2SectionOf('CS-301')).toBe('CS-401')
    expect(nextSemester('AY 2026–2027, 1st Semester')).toBe('AY 2026–2027, 2nd Semester')
    expect(nextSemester('AY 2025–2026, 2nd Semester')).toBe('AY 2026–2027, 1st Semester')
  })

  it('a project reports the section it is in now', () => {
    const s = buildSeed()
    expect(sectionNow(s.projects.p_g1)).toEqual({ course: COURSES.C1, section: 'WD-401', term: 'AY 2026–2027, 1st Semester' })
    // G3 is a CS group in Capstone 2 during the same term.
    expect(sectionNow(s.projects.p_g3)).toEqual({ course: COURSES.C2, section: 'CS-401', term: 'AY 2026–2027, 1st Semester' })
    const later = applyStage(s, 'p_g1', 'IMPLEMENTATION')
    expect(sectionNow(later.projects.p_g1)).toEqual({ course: COURSES.C2, section: 'WD-401', term: 'AY 2026–2027, 2nd Semester' })
  })
})

describe('student registration', () => {
  beforeAll(() => { if (db.name !== 'local') throw new Error('local backend only') })
  beforeEach(async () => { await db.replaceAll(buildSeed()); setSessionUserId(null) })

  it('records the section in capitals, the program and the year level it implies', async () => {
    const u = await registerAccount(null, { name: 'A', email: 'a@student.hau.edu.ph', program: name('CS'), block: 'cs-302' })
    expect(u).toMatchObject({ block: 'CS-302', program: name('CS'), yearLevel: '3rd Year' })
    const v = await registerAccount(null, { name: 'B', email: 'b@student.hau.edu.ph', block: 'EMC-401' })
    expect(v.program).toBe(name('EMC'))
  })

  it('rejects a section that does not fit the program', async () => {
    await expect(registerAccount(null, { name: 'C', email: 'c@student.hau.edu.ph', program: name('WD'), block: 'CS-401' })).rejects.toThrow(/not a WD section/)
    await expect(registerAccount(null, { name: 'D', email: 'd@student.hau.edu.ph', program: name('WD'), block: 'WD-4A' })).rejects.toThrow(/WD-401/)
    await expect(registerAccount(null, { name: 'E', email: 'e@student.hau.edu.ph', program: name('WD'), block: '' })).rejects.toThrow()
    // Faculty accounts have no section.
    await expect(registerAccount(null, { name: 'F', email: 'f@hau.edu.ph' })).resolves.toMatchObject({ block: '' })
  })
})
