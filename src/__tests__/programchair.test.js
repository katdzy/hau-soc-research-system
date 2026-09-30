// Prompt 4 — Program Chair/Coordinator. Prof. Alpha (WD + CS; Adviser of G1,
// Panel Chair of G2) and the NPC coordinators (Prof. Teresa Lim for NW, Prof.
// Grace Tan for EMC). Assignments and endorsements through the write path, and
// their reflection on the Dean/AD, panel, Instructor 2, URO and students.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { assignRole, unassignRole, runGate, scheduleDefense, recordVerdict, submitReview } from '../services/actions.js'
import { worklist, officeQueues } from '../services/worklist.js'
import { canView, canDo, viewBundle } from '../domain/guard.js'
import { DOC_STATUS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const mailsFor = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event)
const recipients = (pid, event) => mailsFor(pid, event).flatMap(m => m.userIds)
const inQueue = (uid, queue) => worklist(snap(), user(uid)).filter(r =>
  r.gates.some(g => g.gate.queue === queue) || r.tasks.some(t => t.queue === queue)).map(r => r.project.id)

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('dashboard queues (item 1)', () => {
  it('a Program Chair/Coordinator has the §4 queues, in workflow order', () => {
    expect(officeQueues(user('f_alpha')).map(q => q.name)).toEqual([
      'Needs adviser', 'Needs panel', 'Proposal defenses to schedule', 'Needs Instructor 2',
      'Recommendations to endorse', 'Approval Sheets to endorse',
    ])
    // Other offices get theirs from the same gates.
    expect(officeQueues(user('f_delta')).map(q => q.name)).toEqual(['Adviser assignments to approve', 'Projects for final approval'])
    expect(officeQueues(user('o_uniform')).map(q => q.name)).toEqual(['Clearances to verify'])
    expect(officeQueues(user('f_bravo'))).toEqual([])
  })

  it('each queue fills from the Coordinator’s own programs only', () => {
    expect(inQueue('f_npc_nw1', 'Needs adviser')).toEqual(['p_nw2'])
    expect(inQueue('f_npc_nw1', 'Needs panel')).toEqual(['p_nw3'])
    expect(inQueue('f_npc_emc1', 'Proposal defenses to schedule')).toEqual(['p_emc2'])
    expect(inQueue('f_npc_emc1', 'Needs Instructor 2')).toEqual(['p_emc3'])
    expect(inQueue('f_alpha', 'Needs adviser')).toEqual([]) // no WD/CS group is waiting
  })

  it('Prof. Alpha’s Adviser and Panel Chair hats are separate from the office', () => {
    const rows = worklist(snap(), user('f_alpha'))
    const g2 = rows.find(r => r.project.id === 'p_g2')
    expect(g2.gates.map(g => [g.gate.action, g.hat])).toEqual([['RECORD_PROPOSAL_VERDICT', P.PANEL_CHAIR]])
    expect(rows.find(r => r.project.id === 'p_g1').ctx.active.some(g => g.role === P.ADVISER)).toBe(true)
  })
})

describe('S2.1 — assign and route the Adviser', () => {
  it('the proposed Adviser learns nothing and sees nothing until the Dean and AD approve', async () => {
    const pc = as('f_npc_nw1')
    await assignRole(pc, null, 'p_nw2', 'f_npc_nw3', P.ADVISER)
    expect(snap().outbox.some(m => m.userIds.includes('f_npc_nw3'))).toBe(false)
    expect(canView(user('f_npc_nw3'), b('p_nw2'))).toBe(false)
    const student = b('p_nw2').members[0].userId
    expect(viewBundle(user(student), b('p_nw2')).assignments.map(a => a.roleType)).not.toContain(P.ADVISER)

    await runGate(as('f_npc_nw1'), null, 'p_nw2', { action: 'ROUTE_ADVISER' })
    expect(b('p_nw2').project.currentStage).toBe('ADVISER_APPROVAL')
    const routed = recipients('p_nw2', 'Stage: Adviser Approval')
    expect(routed).toEqual(expect.arrayContaining(['f_delta', 'f_echo']))
    expect(routed).not.toContain('f_npc_nw3')
    expect(inQueue('f_delta', 'Adviser assignments to approve')).toContain('p_nw2')
    expect(canView(user('f_npc_nw1'), b('p_nw2'))).toBe(false) // NEW-11: not a PC step any more
    expect(canView(user('f_npc_nw3'), b('p_nw2'))).toBe(false)

    await runGate(as('f_delta'), null, 'p_nw2', { action: 'APPROVE_ADVISER' })
    await runGate(as('f_echo'), null, 'p_nw2', { action: 'APPROVE_ADVISER' })
    expect(canView(user('f_npc_nw3'), b('p_nw2'))).toBe(true)
    expect(recipients('p_nw2', 'Adviser appointed')).toEqual(expect.arrayContaining(['f_npc_nw3', student]))
    expect(viewBundle(user(student), b('p_nw2')).assignments.map(a => a.roleType)).toContain(P.ADVISER)
    expect(snap().auditLogs.find(a => a.action === 'ROLE_ASSIGNED' && a.projectId === 'p_nw2'))
      .toMatchObject({ actorId: 'f_npc_nw1', hat: G.COORDINATOR, after: { userId: 'f_npc_nw3', roleType: P.ADVISER } })
  })

  it('routing needs an Adviser; the PC outside their programs cannot', async () => {
    await expect(runGate(as('f_npc_nw1'), null, 'p_nw2', { action: 'ROUTE_ADVISER' })).rejects.toThrow(/Assign an Adviser/)
    await expect(assignRole(as('f_alpha'), null, 'p_nw2', 'f_npc_nw3', P.ADVISER)).rejects.toThrow(/not available/)
  })
})

describe('S5.1 / S5.2 — proposal panel and schedule', () => {
  it('panelists see the project and get an email as soon as they are assigned', async () => {
    const pc = as('f_npc_nw1')
    await assignRole(pc, null, 'p_nw3', 'f_npc_nw2', P.PANEL_CHAIR)
    await assignRole(as('f_npc_nw1'), null, 'p_nw3', 'f_npc_nw0', P.PANEL_MEMBER)
    expect(recipients('p_nw3', 'Assigned to a panel').sort()).toEqual(['f_npc_nw0', 'f_npc_nw2'])
    expect(canView(user('f_npc_nw2'), b('p_nw3'))).toBe(true)
    // Latest version only for the panel.
    expect(viewBundle(user('f_npc_nw2'), b('p_nw3')).latestOnly).toBe(true)
    await runGate(as('f_npc_nw1'), null, 'p_nw3', { action: 'CONFIRM_PANEL' })
    expect(b('p_nw3').project.currentStage).toBe('PROPOSAL_DEFENSE_SCHEDULING')
    expect(inQueue('f_npc_nw1', 'Proposal defenses to schedule')).toEqual(['p_nw3'])
  })

  it('confirming needs a Chair and a Member', async () => {
    await expect(runGate(as('f_npc_nw1'), null, 'p_nw3', { action: 'CONFIRM_PANEL' })).rejects.toThrow(/Panel Chair/)
  })

  it('S5.2 (flag PROPOSAL_DEFENSE_SCHEDULER = PC) — the PC publishes the schedule; group, Adviser and panel are emailed', async () => {
    await scheduleDefense(as('f_npc_emc1'), null, 'p_emc2', { scheduledAt: new Date(Date.now() + 5 * 864e5).toISOString(), venue: 'Room 305' })
    expect(b('p_emc2').project.currentStage).toBe('PROPOSAL_DEFENSE')
    const to = recipients('p_emc2', 'Defense scheduled')
    expect(to).toEqual(expect.arrayContaining([...b('p_emc2').members.map(m => m.userId), 'f_npc_emc3', 'f_npc_emc2', 'f_npc_emc1']))
    // Instructor 1 cannot schedule it (NEW-2 default).
    await load(buildSeed())
    await expect(scheduleDefense(as('f_npc_emc0'), null, 'p_emc2', { scheduledAt: new Date().toISOString(), venue: 'x' })).rejects.toThrow()
  })

  it('Instructor 2 assignment for Capstone 2 (OQ#5, flag INSTRUCTOR_2_ASSIGNER = PC)', async () => {
    await assignRole(as('f_npc_emc1'), null, 'p_emc3', 'f_npc_emc0', P.INSTRUCTOR_2)
    expect(inQueue('f_npc_emc1', 'Needs Instructor 2')).toEqual([])
    expect(recipients('p_emc3', 'New assignment')).toEqual(['f_npc_emc0'])
  })
})

describe('S7.1 / S7.2 — final defense', () => {
  it('endorsing after FM-2005 enables Instructor 2’s schedule and emails them', async () => {
    await load(scenarioStore('T7')) // G3 (CS) at Final Defense Endorsement; Alpha coordinates CS
    expect(inQueue('f_alpha', 'Recommendations to endorse')).toEqual(['p_g3'])
    expect(canDo(user('f_charlie'), 'scheduleDefense', b('p_g3')).ok).toBe(false)
    expect(canDo(user('f_alpha'), 'assignPanel', b('p_g3')).ok).toBe(true) // S7.2
    await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_FINAL_DEFENSE' })
    expect(canDo(user('f_charlie'), 'scheduleDefense', b('p_g3')).ok).toBe(true)
    expect(recipients('p_g3', 'Stage: Final Defense Scheduling')).toContain('f_charlie')
  })

  it('cannot endorse before the Adviser’s FM-2005', async () => {
    const s = applyStage(buildSeed(), 'p_g3', 'FINAL_DEFENSE_ENDORSEMENT', { roles: SEED_ROLES.p_g3 })
    for (const [id, f] of Object.entries(s.forms)) if (f.projectId === 'p_g3' && f.formType === FORMS.F2005.code) delete s.forms[id]
    await load(s)
    await expect(runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_FINAL_DEFENSE' })).rejects.toThrow(/FM-AAC-SOC-2005/)
  })
})

describe('S9.3c — Approval Sheet endorsement (T10)', () => {
  it('reaches the URO queue; the final signature stays out of reach', async () => {
    await load(scenarioStore('T10'))
    expect(inQueue('f_alpha', 'Approval Sheets to endorse')).toEqual(['p_g3'])
    expect(canView(user('o_uniform'), b('p_g3'))).toBe(false)
    await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_TO_URO' })
    expect(b('p_g3').project.currentStage).toBe('URO_VERIFICATION')
    expect(canView(user('o_uniform'), b('p_g3'))).toBe(true)
    expect(recipients('p_g3', 'Stage: URO Verification')).toContain('o_uniform')
    const sheet = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    expect(sheet.signatories.find(x => x.role === G.COORDINATOR)).toMatchObject({ userId: 'f_alpha' })
    expect(sheet.signatories.find(x => x.role === G.COORDINATOR).signedAt).toBeTruthy()
    await expect(runGate(as('f_alpha'), null, 'p_g3', { action: 'FINAL_APPROVE' })).rejects.toThrow()
  })
})

describe('T16 / T19 and the Must-NOT list', () => {
  it('T16 — removing Prof. Charlie from G1’s panel takes G1 off his dashboard and is audited', async () => {
    await load(scenarioStore('T16'))
    expect(worklist(snap(), user('f_charlie')).map(r => r.project.id)).toContain('p_g1')
    const row = b('p_g1').assignments.find(a => a.userId === 'f_charlie')
    await unassignRole(as('f_alpha'), null, 'p_g1', row)
    expect(worklist(snap(), user('f_charlie')).map(r => r.project.id)).not.toContain('p_g1')
    expect(snap().auditLogs.find(a => a.action === 'ROLE_UNASSIGNED')).toMatchObject({ hat: G.COORDINATOR })
  })

  it('T19 (NEW-5, BLOCK_ADVISER_ON_PANEL decided) — Prof. Alpha cannot sit on the panel of G1, which she advises', async () => {
    await load(scenarioStore('T19'))
    await expect(assignRole(as('f_alpha'), null, 'p_g1', 'f_alpha', P.PANEL_MEMBER)).rejects.toThrow(/Adviser on this project/)
    await expect(assignRole(as('f_alpha'), null, 'p_g1', 'f_alpha', P.PANEL_CHAIR)).rejects.toThrow(/Adviser on this project/)
  })

  it('T1 / T2 / T3 / NEW-11 — the right hat on each project, no documents outside a PC step', async () => {
    await load(scenarioStore('T1'))
    const log = b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    expect(canDo(user('f_alpha'), 'signWeeklyLog', b('p_g1'), { log }).hat).toBe(P.ADVISER)
    await load(buildSeed())
    const m = b('p_g2').documents.find(d => d.docType === 'Proposal Manuscript' && d.status === DOC_STATUS.APPROVED)
    await expect(submitReview(as('f_alpha'), null, 'p_g2', m.id, { decision: 'Approve' })).rejects.toThrow()
    expect(canView(user('f_alpha'), b('p_g3'))).toBe(false)
    expect(canDo(user('f_alpha'), 'readDocuments', b('p_g3')).ok).toBe(false)
    await expect(recordVerdict(as('f_alpha'), null, 'p_g1', { verdict: 'Re-defense' })).rejects.toThrow()
  })
})
