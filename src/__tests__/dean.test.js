// Prompt 5 — Dean and Associate Dean. Dean Delta (also Adviser of G3) and AD
// Echo (also Panel Member of G2): adviser approval (S2.2), final approval
// (S9.5), progressive visibility (T9), records and reports (S10.1, S10.3).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { runGate, addAnnotation } from '../services/actions.js'
import { worklist, officeQueues } from '../services/worklist.js'
import { canView, canDo, viewBundle } from '../domain/guard.js'
import { resolveInstitution, can } from '../domain/caac.js'
import { stageByKey, STAGES } from '../domain/stages.js'
import { DOC_STATUS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, roles = {}) => load(applyStage(buildSeed(), pid, stage, { roles: { ...SEED_ROLES[pid], ...roles } }))
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const approvalSteps = (pid) => stageByKey('ADVISER_APPROVAL').gates[0].steps(b(pid))

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('dashboard (item 1)', () => {
  it('queues, records and reports for both offices; hats kept apart', () => {
    for (const id of ['f_delta', 'f_echo']) {
      expect(officeQueues(user(id)).map(q => q.name)).toEqual(['Adviser assignments to approve', 'Projects for final approval'])
      const inst = resolveInstitution(user(id), snap())
      expect(can(inst, 'records.search') && can(inst, 'report.generate')).toBe(true)
    }
    // The seed has CYB Group 1 waiting on both offices.
    for (const id of ['f_delta', 'f_echo']) {
      const row = worklist(snap(), user(id)).find(r => r.project.id === 'p_cyb1')
      expect(row.gates.map(g => [g.gate.queue, g.hat])).toEqual([['Adviser assignments to approve', id === 'f_delta' ? G.DEAN : G.ASSOCIATE_DEAN]])
    }
    // Delta's Adviser hat (G3) and Echo's Panel hat (G2).
    expect(worklist(snap(), user('f_delta')).find(r => r.project.id === 'p_g3').ctx.active.some(g => g.role === P.ADVISER)).toBe(true)
    expect(worklist(snap(), user('f_echo')).find(r => r.project.id === 'p_g2').ctx.projectRoles).toEqual([P.PANEL_MEMBER])
  })
})

describe('S2.2 — adviser approval (flag ADVISER_APPROVAL = both, any order)', () => {
  it('shows 1 of 2 to both offices, then appoints the Adviser once both approve', async () => {
    expect(approvalSteps('p_cyb1').map(s => [s.role, s.done])).toEqual([[G.DEAN, false], [G.ASSOCIATE_DEAN, false]])
    await runGate(as('f_echo'), null, 'p_cyb1', { action: 'APPROVE_ADVISER' })
    expect(b('p_cyb1').project.currentStage).toBe('ADVISER_APPROVAL')
    expect(approvalSteps('p_cyb1').map(s => [s.role, s.done])).toEqual([[G.DEAN, false], [G.ASSOCIATE_DEAN, true]])
    // Echo sees she has approved; Delta sees it is his turn.
    const gate = stageByKey('ADVISER_APPROVAL').gates[0]
    expect(gate.requires(b('p_cyb1'), user('f_echo'))).toMatch(/You have approved. Waiting on: Dean/)
    expect(gate.requires(b('p_cyb1'), user('f_delta'))).toBeNull()
    expect(recipients('p_cyb1', 'Adviser assignment to approve')).toEqual(['f_delta'])
    await expect(runGate(as('f_echo'), null, 'p_cyb1', { action: 'APPROVE_ADVISER' })).rejects.toThrow(/You have approved/)

    const adviser = b('p_cyb1').assignments.find(a => a.roleType === P.ADVISER).userId
    expect(canView(user(adviser), b('p_cyb1'))).toBe(false)
    await runGate(as('f_delta'), null, 'p_cyb1', { action: 'APPROVE_ADVISER' })
    expect(b('p_cyb1').project.currentStage).toBe('TOPIC_PROPOSAL') // Conceptualization
    expect(canView(user(adviser), b('p_cyb1'))).toBe(true)
    expect(worklist(snap(), user(adviser)).find(r => r.project.id === 'p_cyb1').ctx.active.some(g => g.role === P.ADVISER)).toBe(true)
    const student = b('p_cyb1').members[0].userId
    expect(viewBundle(user(student), b('p_cyb1')).assignments.some(a => a.roleType === P.ADVISER)).toBe(true)
    expect(recipients('p_cyb1', 'Adviser appointed')).toEqual(expect.arrayContaining([adviser, student]))
    // Progressive visibility: once approved, neither office sees it.
    expect(canView(user('f_delta'), b('p_cyb1'))).toBe(false)
    expect(canView(user('f_echo'), b('p_cyb1'))).toBe(false)
    const audits = snap().auditLogs.filter(a => a.projectId === 'p_cyb1').map(a => [a.action, a.hat])
    expect(audits).toEqual(expect.arrayContaining([['ADVISER_APPROVAL_RECORDED', G.ASSOCIATE_DEAN], ['STAGE_APPROVE_ADVISER', G.DEAN]]))
  })

  it('cannot approve before the Program Chair routes the assignment', async () => {
    await at('p_g4', 'ADVISER_ASSIGNMENT', { [P.ADVISER]: 'f_charlie' })
    expect(canView(user('f_delta'), b('p_g4'))).toBe(false)
    await expect(runGate(as('f_delta'), null, 'p_g4', { action: 'APPROVE_ADVISER' })).rejects.toThrow(/not available/)
  })

  it('NEW-5 (decided: other office alone) — an assignment naming the Dean is approved by the AD alone', async () => {
    await load(applyStage(buildSeed(), 'p_g4', 'ADVISER_ASSIGNMENT', { roles: { ...SEED_ROLES.p_g4, [P.ADVISER]: 'f_delta' }, preassign: [P.ADVISER] }))
    await runGate(as('f_alpha'), null, 'p_g4', { action: 'ROUTE_ADVISER' })
    expect(b('p_g4').project.adviserOffices).toEqual([G.DEAN])
    expect(canDo(user('f_delta'), 'APPROVE_ADVISER', b('p_g4')).reason).toMatch(/not the Adviser being approved/)
    expect(recipients('p_g4', 'Stage: Adviser Approval')).toContain('f_echo')
    const steps = stageByKey('ADVISER_APPROVAL').gates[0].steps(b('p_g4'))
    expect(steps.map(s => [s.role, s.done])).toEqual([[G.DEAN, true], [G.ASSOCIATE_DEAN, false]])
    expect(steps[0].label).toMatch(/Named as the Adviser/)
    await runGate(as('f_echo'), null, 'p_g4', { action: 'APPROVE_ADVISER' })
    expect(b('p_g4').project.currentStage).toBe('TOPIC_PROPOSAL')
    expect(recipients('p_g4', 'Adviser appointed')).toContain('f_delta')
  })

  it('NEW-5 — the same holds the other way round (AD named)', async () => {
    await load(applyStage(buildSeed(), 'p_g4', 'ADVISER_ASSIGNMENT', { roles: { ...SEED_ROLES.p_g4, [P.ADVISER]: 'f_echo' }, preassign: [P.ADVISER] }))
    await runGate(as('f_alpha'), null, 'p_g4', { action: 'ROUTE_ADVISER' })
    await expect(runGate(as('f_echo'), null, 'p_g4', { action: 'APPROVE_ADVISER' })).rejects.toThrow()
    await runGate(as('f_delta'), null, 'p_g4', { action: 'APPROVE_ADVISER' })
    expect(b('p_g4').project.currentStage).toBe('TOPIC_PROPOSAL')
  })
})

describe('S9.5 — final approval', () => {
  it('T11 — no final signature before the URO clears', async () => {
    await load(scenarioStore('T11')) // G3 at URO Verification
    expect(canView(user('f_delta'), b('p_g3'))).toBe(true) // as G3's Adviser
    expect(canDo(user('f_delta'), 'FINAL_APPROVE', b('p_g3')).ok).toBe(false)
    expect(canView(user('f_echo'), b('p_g3'))).toBe(false)
    await expect(runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE' })).rejects.toThrow()
  })

  it('after URO clearance: both sign in any order → Archived, Completed, records table', async () => {
    await at('p_g3', 'FINAL_APPROVAL')
    const gate = stageByKey('FINAL_APPROVAL').gates[0]
    const open = () => gate.steps(b('p_g3')).filter(s => !s.done).map(s => s.role)
    expect(open()).toEqual([G.DEAN, G.ASSOCIATE_DEAN])
    await runGate(as('f_echo'), null, 'p_g3', { action: 'FINAL_APPROVE' })
    expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
    expect(open()).toEqual([G.DEAN])
    expect(recipients('p_g3', 'Final approval')).toContain('f_delta')
    await runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE' })
    const p = b('p_g3').project
    expect(p).toMatchObject({ currentStage: 'ARCHIVED', status: 'Archived', archiveResult: 'Pass' })
    expect(b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code).status).toBe('Signed')
    expect(b('p_g3').documents.filter(d => d.status !== DOC_STATUS.SUPERSEDED).every(d => d.status === DOC_STATUS.ARCHIVED)).toBe(true)
    // Students: completed, emailed; the Dean and AD read the archived record.
    expect(recipients('p_g3', 'Stage: Archived')).toEqual(expect.arrayContaining(['s_quebec', 's_romeo']))
    expect(canView(user('f_echo'), b('p_g3'))).toBe(true)
    expect(snap().auditLogs.find(a => a.action === 'STAGE_FINAL_APPROVE')).toMatchObject({ actorId: 'f_delta', hat: G.DEAN })
  })
})

describe('T8 / T9 — visibility, including pasted URLs', () => {
  it('T9 — as Dean or AD a project appears only at Adviser Approval, Final Approval and Archived', async () => {
    const visibleAt = []
    for (const s of STAGES) {
      const store = applyStage(buildSeed(), 'p_g1', s.key, { roles: SEED_ROLES.p_g1 })
      const sn = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Object.values(v)]))
      const bb = bundle(sn, 'p_g1')
      const seen = ['f_delta', 'f_echo'].map(id => canView(sn.users.find(u => u.id === id), bb))
      expect(seen[0], s.key).toBe(seen[1])
      if (seen[0]) visibleAt.push(s.key)
    }
    expect(visibleAt).toEqual(['ADVISER_APPROVAL', 'FINAL_APPROVAL', 'ARCHIVED'])
  })

  it('T8 — Delta has the full Adviser view of G3; Echo only panel actions on G2; no leak across', () => {
    expect(viewBundle(user('f_delta'), b('p_g3')).documents.length).toBe(b('p_g3').documents.length)
    expect(canDo(user('f_delta'), 'viewDocumentHistory', b('p_g3')).ok).toBe(true)
    expect(viewBundle(user('f_echo'), b('p_g2')).latestOnly).toBe(true)
    expect(canDo(user('f_echo'), 'recordVerdict', b('p_g2')).ok).toBe(false)
    // Neither office hat opens the other persona's project.
    expect(canView(user('f_echo'), b('p_g3'))).toBe(false)
    expect(canView(user('f_delta'), b('p_g2'))).toBe(false)
  })

  it('no annotation where they hold no reviewer hat (R12, guard only)', async () => {
    await at('p_g1', 'ADVISER_APPROVAL')
    const doc = b('p_g1').documents[0] ?? { status: DOC_STATUS.SUBMITTED, docType: 'Proposal Manuscript' }
    expect(canDo(user('f_delta'), 'annotate', b('p_g1'), { doc }).ok).toBe(false)
    await at('p_g2', 'FINAL_APPROVAL', { [P.PANEL_MEMBER]: ['f_echo'] })
    const m = b('p_g2').documents.find(d => d.docType === 'Final Manuscript')
    expect(canDo(user('f_delta'), 'annotate', b('p_g2'), { doc: { ...m, status: DOC_STATUS.SUBMITTED } }).ok).toBe(false)
    await expect(addAnnotation(as('f_delta'), null, 'p_g2', m.id, { text: 'x' })).rejects.toThrow()
  })
})
