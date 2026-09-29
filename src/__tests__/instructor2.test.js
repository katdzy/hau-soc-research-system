// Prompt 9 — Instructor 2. Prof. Charlie: Instructor 2 of G3, Adviser of G2,
// Panel Member of G1. Capstone 2 tracking (S6.5 milestones, S6.7 readiness —
// NEW-43), the final-defense schedule after the PC's endorsement (S7.1 → S7.3),
// post-defense course requirements (S8.5 — NEW-44), what the role must not do,
// and the multi-hat isolation.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import {
  confirmMilestones, confirmReadiness, confirmPostDefenseRequirements, scheduleDefense, runGate, assignRole,
  unassignRole, addAnnotation, decideWeeklyLog, submitReview, signForm, submitDocument,
} from '../services/actions.js'
import { worklist } from '../services/worklist.js'
import { canView, canDo, viewBundle, allowedActions } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { canSign } from '../domain/forms.js'
import { STAGES, stageByKey, milestonesComplete } from '../domain/stages.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const audit = (action) => snap().auditLogs.filter(a => a.action === action)
const row = (uid, pid) => worklist(snap(), user(uid)).find(r => r.project.id === pid)
const pdf = { fileName: 'r.pdf', fileSize: 1000, fileType: 'application/pdf' }

/** G3 at Implementation with its milestones and readiness cleared, as if just routed. */
async function g3Implementation() {
  const s = applyStage(buildSeed(), 'p_g3', 'IMPLEMENTATION', { roles: SEED_ROLES.p_g3 })
  await load(s)
}

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('item 1 — the project appears only after Instructor 1 routes it (S5.8)', () => {
  it('assigned during the proposal revision: no access and no email until the routing, then both', async () => {
    const s = applyStage(buildSeed(), 'p_g2', 'PROPOSAL_REVISION', { roles: { ...SEED_ROLES.p_g2, [P.INSTRUCTOR_2]: undefined } })
    for (const f of Object.values(s.forms).filter(x => x.projectId === 'p_g2' && x.formType === FORMS.F2004.code)) {
      s.forms[f.id] = { ...f, status: 'Signed', signatories: f.signatories.map(x => ({ ...x, signedAt: x.signedAt ?? new Date().toISOString() })) }
    }
    for (const [id, a] of Object.entries(s.projectAssignments)) if (a.projectId === 'p_g2' && a.roleType === P.INSTRUCTOR_2) delete s.projectAssignments[id]
    await load(s)

    await assignRole(as('f_alpha'), null, 'p_g2', 'f_delta', P.INSTRUCTOR_2)
    expect(canView(user('f_delta'), b('p_g2'))).toBe(false)
    expect(worklist(snap(), user('f_delta')).map(r => r.project.id)).not.toContain('p_g2')
    expect(recipients('p_g2', 'New assignment')).toEqual([]) // no email about a project they cannot open yet

    await runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })
    expect(canView(user('f_delta'), b('p_g2'))).toBe(true)
    expect(recipients('p_g2', 'Stage: Implementation & Monitoring')).toContain('f_delta')
  })

  it('assigned once the project is in Capstone 2: the assignment email goes out at once', async () => {
    await load(scenarioStore('T7')) // G3 at Final Defense Endorsement (a PC step)
    const i2 = b('p_g3').assignments.find(a => a.roleType === P.INSTRUCTOR_2)
    await unassignRole(as('f_alpha'), null, 'p_g3', i2)
    expect(canView(user('f_charlie'), b('p_g3'))).toBe(false)
    await assignRole(as('f_alpha'), null, 'p_g3', 'f_echo', P.INSTRUCTOR_2)
    expect(recipients('p_g3', 'New assignment')).toEqual(['f_echo'])
    expect(canView(user('f_echo'), b('p_g3'))).toBe(true)
  })

  it('from Implementation through Clearance only (Capstone 2 and post-defense)', () => {
    for (const s of STAGES) {
      const inC2 = ['Capstone 2 · Implementation', 'Post-Defense Clearance'].includes(s.phase)
      expect(allowedActions(P.INSTRUCTOR_2, s.key).includes('viewProject'), s.key).toBe(inC2)
    }
  })
})

describe('S6.5 — confirm the Capstone 2 milestones', () => {
  it('two milestones, one call each; audit per call; one email when both are in', async () => {
    await g3Implementation()
    expect(row('f_charlie', 'p_g3').tasks.map(t => t.label)).toContain('Confirm the revised manuscript and system components milestones')
    await confirmMilestones(as('f_charlie'), null, 'p_g3', 'revisedManuscript')
    expect(milestonesComplete(b('p_g3').project)).toBe(false)
    expect(recipients('p_g3', 'Milestones confirmed')).toEqual([])
    await confirmMilestones(as('f_charlie'), null, 'p_g3', 'systemComponents', 'Sensor nodes and dashboard demonstrated.')
    const p = b('p_g3').project
    expect(milestonesComplete(p)).toBe(true)
    expect(p).toMatchObject({ milestonesConfirmedBy: 'f_charlie', milestones: { systemComponents: { by: 'f_charlie', note: 'Sensor nodes and dashboard demonstrated.' } } })
    expect(audit('MILESTONE_CONFIRMED').map(a => [a.hat, a.after.milestone])).toEqual([
      [P.INSTRUCTOR_2, 'revisedManuscript'], [P.INSTRUCTOR_2, 'systemComponents'],
    ])
    // Reflects on: the Adviser (Dean Delta) and the group.
    expect(recipients('p_g3', 'Milestones confirmed')).toEqual(expect.arrayContaining(['f_delta', 's_quebec', 's_romeo']))
    expect(viewBundle(user('s_quebec'), b('p_g3')).project.milestones.systemComponents.by).toBe('f_charlie')
  })

  it('a double submit records once; a repeat or an unknown milestone is refused', async () => {
    await g3Implementation()
    const me = as('f_charlie')
    await Promise.all([
      confirmMilestones(me, null, 'p_g3', 'revisedManuscript'),
      confirmMilestones(me, null, 'p_g3', 'revisedManuscript').catch(() => null),
    ])
    expect(audit('MILESTONE_CONFIRMED')).toHaveLength(1)
    await expect(confirmMilestones(me, null, 'p_g3', 'revisedManuscript')).rejects.toThrow(/already confirmed/)
    await expect(confirmMilestones(me, null, 'p_g3', 'grades')).rejects.toThrow(/No milestone/)
  })

  it('only at Implementation, and only by Instructor 2', async () => {
    await g3Implementation()
    await expect(confirmMilestones(as('f_delta'), null, 'p_g3', 'revisedManuscript')).rejects.toThrow() // the Adviser
    await expect(confirmMilestones(as('s_quebec'), null, 'p_g3', 'revisedManuscript')).rejects.toThrow()
    await at('p_g3', 'FINAL_DEFENSE_ENDORSEMENT')
    expect(canDo(user('f_charlie'), 'confirmMilestones', b('p_g3'), { milestone: 'revisedManuscript' }).ok).toBe(false)
  })
})

describe('S6.7 — readiness check with the Adviser (NEW-43), then FM-2005', () => {
  it('waits on both milestones; then unblocks FM-2005 and emails the Adviser', async () => {
    await g3Implementation()
    await expect(confirmReadiness(as('f_charlie'), null, 'p_g3')).rejects.toThrow(/both Capstone 2 milestones/)
    expect(row('f_charlie', 'p_g3').tasks.some(t => t.kind === 'readiness')).toBe(false)
    await confirmMilestones(as('f_charlie'), null, 'p_g3', 'revisedManuscript')
    await confirmMilestones(as('f_charlie'), null, 'p_g3', 'systemComponents')
    expect(row('f_charlie', 'p_g3').tasks.some(t => t.kind === 'readiness')).toBe(true)

    // The Adviser's FM-2005 is blocked on it (G3 has 1 approved log at this stage: add a second).
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, ...pdf })
    const logs = Object.values(snap().weeklyLogs).filter(l => l.projectId === 'p_g3')
    await db.add('weeklyLogs', { ...logs[0], id: undefined, weekNo: 2 })
    await expect(runGate(as('f_delta'), null, 'p_g3', { action: 'RECOMMEND_FINAL_DEFENSE' })).rejects.toThrow(/ready for final defense/)

    await confirmReadiness(as('f_charlie'), null, 'p_g3', 'Checked with Dean Delta.')
    expect(b('p_g3').project).toMatchObject({ readinessConfirmedBy: 'f_charlie', readinessNote: 'Checked with Dean Delta.' })
    expect(audit('READINESS_CONFIRMED')[0]).toMatchObject({ actorId: 'f_charlie', hat: P.INSTRUCTOR_2 })
    expect(recipients('p_g3', 'Ready for final defense')).toEqual(['f_delta'])
    await expect(confirmReadiness(as('f_charlie'), null, 'p_g3')).rejects.toThrow(/already confirmed/)

    await runGate(as('f_delta'), null, 'p_g3', { action: 'RECOMMEND_FINAL_DEFENSE' })
    expect(b('p_g3').project.currentStage).toBe('FINAL_DEFENSE_ENDORSEMENT')
  })

  it('the Next-step panel lists the group, Instructor 2 and the Adviser in order', async () => {
    await g3Implementation()
    const steps = stageByKey('IMPLEMENTATION').gates[0].steps(b('p_g3'))
    expect(steps.map(s => [s.role, s.order])).toEqual([
      ['Group', 0], ['Group', 0], [P.INSTRUCTOR_2, 0], [P.INSTRUCTOR_2, 0], [P.INSTRUCTOR_2, 1], [P.ADVISER, 2],
    ])
  })
})

describe('S7.1 → S7.3 — the final-defense schedule', () => {
  it('T7 — blocked before the PC endorses (UI and guard); enabled and emailed after', async () => {
    await load(scenarioStore('T7'))
    expect(canDo(user('f_charlie'), 'scheduleDefense', b('p_g3')).ok).toBe(false)
    await expect(scheduleDefense(as('f_charlie'), null, 'p_g3', { scheduledAt: new Date().toISOString(), venue: 'Room' })).rejects.toThrow()
    expect(row('f_charlie', 'p_g3').gates).toEqual([])
    // The Defense tab shows the step disabled, with what comes first (it reads the dormant grant).
    expect(resolveContext(user('f_charlie'), b('p_g3')).dormant.some(d => d.cap === 'defense.schedule')).toBe(true)

    await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_FINAL_DEFENSE' })
    expect(recipients('p_g3', 'Stage: Final Defense Scheduling')).toContain('f_charlie')
    // On the dashboard the step sits under the Instructor 2 hat (not an office queue).
    expect(row('f_charlie', 'p_g3').gates.map(g => [g.gate.action, g.hat, g.blocker])).toEqual([['SCHEDULE_FINAL_DEFENSE', P.INSTRUCTOR_2, null]])
  })

  it('publishing notifies the group, the Adviser and the panel, and moves to the Final Defense', async () => {
    await at('p_g3', 'FINAL_DEFENSE_SCHEDULING')
    const when = new Date(Date.now() + 7 * 864e5).toISOString()
    await Promise.all([
      scheduleDefense(as('f_charlie'), null, 'p_g3', { scheduledAt: when, venue: 'SOC Conference Room' }),
      scheduleDefense(as('f_charlie'), null, 'p_g3', { scheduledAt: when, venue: 'SOC Conference Room' }).catch(() => null),
    ])
    expect(b('p_g3').defenses.filter(d => d.type === 'Final')).toHaveLength(1)
    expect(b('p_g3').project.currentStage).toBe('FINAL_DEFENSE')
    expect(recipients('p_g3', 'Defense scheduled')).toEqual(expect.arrayContaining(['s_quebec', 's_romeo', 'f_delta', 'f_foxtrot', 'f_bravo']))
    expect(audit('DEFENSE_SCHEDULED')[0]).toMatchObject({ actorId: 'f_charlie', hat: P.INSTRUCTOR_2 })
    for (const uid of ['s_quebec', 'f_delta', 'f_bravo']) {
      expect(viewBundle(user(uid), b('p_g3')).defenses.find(d => d.type === 'Final' && !d.verdict).venue, uid).toBe('SOC Conference Room')
    }
  })
})

describe('S8.5 — post-defense course requirements (NEW-44, record only)', () => {
  it('at Final Revision: once, audited, no email; the group and Adviser see it; nothing waits on it', async () => {
    expect(b('p_g3').project.currentStage).toBe('FINAL_REVISION')
    expect(row('f_charlie', 'p_g3').tasks.map(t => t.label)).toContain('Confirm the post-defense course requirements')
    await confirmPostDefenseRequirements(as('f_charlie'), null, 'p_g3', 'Demo and user manual submitted.')
    expect(b('p_g3').project).toMatchObject({ postDefenseConfirmedBy: 'f_charlie', postDefenseNote: 'Demo and user manual submitted.' })
    expect(audit('POST_DEFENSE_REQUIREMENTS_CONFIRMED')[0]).toMatchObject({ hat: P.INSTRUCTOR_2 })
    expect(snap().workflowHistory.some(h => h.action === 'POST_DEFENSE_REQUIREMENTS_CONFIRMED' && h.hat === P.INSTRUCTOR_2)).toBe(true)
    expect(snap().outbox.filter(m => m.projectId === 'p_g3')).toEqual([])
    expect(viewBundle(user('s_quebec'), b('p_g3')).project.postDefenseConfirmedBy).toBe('f_charlie')
    await expect(confirmPostDefenseRequirements(as('f_charlie'), null, 'p_g3')).rejects.toThrow(/already confirmed/)
  })

  it('open at Final Requirements too; closed before the final defense and from URO verification on', async () => {
    await load(scenarioStore('T10')) // Clearance, Approval Sheet panel-signed
    expect(canDo(user('f_charlie'), 'confirmPostDefenseRequirements', b('p_g3')).ok).toBe(true)
    // Not a gate: the PC endorses without it.
    await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_TO_URO' })
    expect(b('p_g3').project.currentStage).toBe('URO_VERIFICATION')
    expect(canDo(user('f_charlie'), 'confirmPostDefenseRequirements', b('p_g3')).ok).toBe(false)
    for (const stage of ['IMPLEMENTATION', 'FINAL_DEFENSE', 'URO_VERIFICATION', 'FINAL_APPROVAL']) {
      expect(allowedActions(P.INSTRUCTOR_2, stage), stage).not.toContain('confirmPostDefenseRequirements')
    }
  })
})

describe('Must NOT (item 4)', () => {
  it('T6 — annotate as Instructor 2: rejected at every stage, including a forced call', async () => {
    for (const s of STAGES) expect(allowedActions(P.INSTRUCTOR_2, s.key), s.key).not.toContain('annotate')
    await g3Implementation()
    const draft = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, ...pdf })
    expect(canDo(user('f_charlie'), 'annotate', b('p_g3'), { doc: draft }).ok).toBe(false)
    await expect(addAnnotation(as('f_charlie'), null, 'p_g3', draft.id, { text: 'x', category: 'General' })).rejects.toThrow()
    expect(snap().annotations.filter(a => a.authorId === 'f_charlie')).toEqual([])
    // Nor any review decision on it.
    await expect(submitReview(as('f_charlie'), null, 'p_g3', draft.id, { decision: DECISIONS.APPROVE })).rejects.toThrow()
  })

  it('sign weekly logs (OQ#7, WEEKLY_LOG_SIGNER = Adviser)', async () => {
    await load(scenarioStore('T1'))
    await at('p_g3', 'IMPLEMENTATION', { pendingLog: true })
    const log = b('p_g3').weeklyLogs.find(l => l.status === 'Submitted')
    expect(canDo(user('f_charlie'), 'signWeeklyLog', b('p_g3'), { log }).ok).toBe(false)
    await expect(decideWeeklyLog(as('f_charlie'), null, 'p_g3', log.id, { approve: true })).rejects.toThrow()
    expect(b('p_g3').weeklyLogs.find(l => l.id === log.id).status).toBe('Submitted')
  })

  it('sign clearance forms (§9 DFD 7.0 leftover) or FM-2004', async () => {
    await load(scenarioStore('T10'))
    const sheet = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    expect(sheet.signatories.some(s => s.userId === 'f_charlie' || s.role === P.INSTRUCTOR_2)).toBe(false)
    expect(canSign(sheet, user('f_charlie'), b('p_g3')).ok).toBe(false)
    await expect(signForm(as('f_charlie'), null, 'p_g3', sheet.id)).rejects.toThrow()
    await load(buildSeed())
    const f2004 = b('p_g3').forms.find(f => f.formType === FORMS.F2004.code && f.payload.defenseType === 'Final')
    expect(f2004.signatories.some(s => s.role === P.INSTRUCTOR_2)).toBe(false)
    await expect(signForm(as('f_charlie'), null, 'p_g3', f2004.id)).rejects.toThrow()
    for (const a of ['ENDORSE_TO_URO', 'URO_VERIFY', 'FINAL_APPROVE', 'recordVerdict', 'RECOMMEND_FINAL_DEFENSE', 'ENDORSE_FINAL_DEFENSE']) {
      for (const s of STAGES) expect(allowedActions(P.INSTRUCTOR_2, s.key), `${a} ${s.key}`).not.toContain(a)
    }
  })
})

describe('multi-hat (item 5) — Charlie on G1, G2 and G3', () => {
  it('on G3 only the Instructor 2 hat: no adviser or panel action', () => {
    const ctx = resolveContext(user('f_charlie'), b('p_g3'))
    expect(ctx.projectRoles).toEqual([P.INSTRUCTOR_2])
    const doc = { status: DOC_STATUS.SUBMITTED, docType: T.REVISED_MANUSCRIPT }
    for (const a of ['reviewDocument', 'annotate', 'signWeeklyLog', 'recordVerdict', 'RECOMMEND_FINAL_DEFENSE']) {
      expect(canDo(user('f_charlie'), a, b('p_g3'), { doc, log: { status: 'Submitted' } }).ok, a).toBe(false)
    }
  })

  it('Adviser actions work on G2; panel actions on G1 once G1 has a panel; neither carries the other hat', async () => {
    await at('p_g2', 'IMPLEMENTATION', { pendingLog: true })
    const log = b('p_g2').weeklyLogs.find(l => l.status === 'Submitted')
    expect(canDo(user('f_charlie'), 'signWeeklyLog', b('p_g2'), { log })).toMatchObject({ ok: true, hat: P.ADVISER })
    expect(canDo(user('f_charlie'), 'confirmMilestones', b('p_g2'), { milestone: 'revisedManuscript' }).ok).toBe(false) // Foxtrot is G2's Instructor 2

    await load(scenarioStore('T5')) // G1 at Proposal Defense, Charlie on the panel
    const m = b('p_g1').documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT && d.status !== DOC_STATUS.SUPERSEDED)
    expect(canDo(user('f_charlie'), 'annotate', b('p_g1'), { doc: m })).toMatchObject({ ok: true, hat: P.PANEL_MEMBER })
    expect(resolveContext(user('f_charlie'), b('p_g1')).projectRoles).toEqual([P.PANEL_MEMBER])
    // G3 stays Instructor-2-only on Charlie's worklist.
    const g3 = row('f_charlie', 'p_g3')
    expect(new Set(g3.ctx.active.map(g => g.role))).toEqual(new Set([P.INSTRUCTOR_2]))
  })
})

describe('T21 — every Instructor 2 write carries the hat "Instructor 2"', () => {
  it('milestones, readiness, schedule and post-defense requirements', async () => {
    await g3Implementation()
    const me = as('f_charlie')
    await confirmMilestones(me, null, 'p_g3', 'revisedManuscript')
    await confirmMilestones(me, null, 'p_g3', 'systemComponents')
    await confirmReadiness(me, null, 'p_g3')
    await at('p_g3', 'FINAL_DEFENSE_SCHEDULING')
    await scheduleDefense(as('f_charlie'), null, 'p_g3', { scheduledAt: new Date(Date.now() + 864e5).toISOString(), venue: 'Room' })
    await load(buildSeed())
    await confirmPostDefenseRequirements(as('f_charlie'), null, 'p_g3')
    const mine = snap().auditLogs.filter(a => a.actorId === 'f_charlie')
    expect(mine.length).toBeGreaterThanOrEqual(1)
    expect(new Set(mine.map(a => a.hat))).toEqual(new Set([P.INSTRUCTOR_2]))
    const written = snap().workflowHistory.filter(h => h.actorId === 'f_charlie' && h.note !== 'Set by the stage builder')
    expect(written.every(h => h.hat === P.INSTRUCTOR_2)).toBe(true)
  })
})
