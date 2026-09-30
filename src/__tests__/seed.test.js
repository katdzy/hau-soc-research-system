// The stage builder fabricates history; none of it may land in the future.
import { it, expect } from 'vitest'
import { SCENARIOS, scenarioStore } from '../dev/scenarios.js'
it('seed and scenarios: no generated timestamp is in the future except schedules and deadlines', () => {
  const skip = new Set(['scheduledAt', 'revisionDeadline'])
  for (const sc of SCENARIOS) {
    const s = scenarioStore(sc.id)
    for (const [col, rows] of Object.entries(s)) for (const r of Object.values(rows)) for (const [k, v] of Object.entries(r)) {
      if (!skip.has(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) expect(new Date(v).getTime(), `${sc.id} ${col}.${k}`).toBeLessThanOrEqual(Date.now())
    }
  }
})

import { buildSeed } from '../backend/seed.js'
import { PROGRAM_INFO, parseSection, PROJECT_ROLES as P, PANEL_ROLES } from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'

it('seed: three groups of four per program, each student in one group of their own program', () => {
  const s = buildSeed()
  const projects = Object.values(s.projects)
  const members = Object.values(s.projectMembers)
  const users = s.users
  for (const { name } of PROGRAM_INFO) {
    expect(projects.filter(p => p.program === name).length, name).toBe(3)
  }
  for (const p of projects) {
    const mine = members.filter(m => m.projectId === p.id)
    expect(mine.length, p.id).toBe(FLAGS.GROUP_SIZE)
    for (const m of mine) expect(parseSection(users[m.userId].block).program, `${p.id} ${m.userId}`).toBe(p.program)
    // The Adviser never sits on the group's own panel (BLOCK_ADVISER_ON_PANEL).
    const roles = Object.values(s.projectAssignments).filter(a => a.projectId === p.id)
    const advisers = roles.filter(a => a.roleType === P.ADVISER).map(a => a.userId)
    expect(roles.filter(a => PANEL_ROLES.includes(a.roleType) && advisers.includes(a.userId)), p.id).toEqual([])
  }
  const ids = members.map(m => m.userId)
  expect(new Set(ids).size).toBe(ids.length)
  expect(Object.values(users).filter(u => u.email).map(u => u.email).length)
    .toBe(new Set(Object.values(users).map(u => u.email)).size)
})
