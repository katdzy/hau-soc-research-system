// Prompt 3 — Instructor 1 (Prof. Bravo: Instructor 1 of G1, G2, G4 in block
// WD-401; Panel Member of G3). Group formation and the Capstone 1 gates through
// the write path, the handoffs to the Program Chair, the Adviser, the students
// and Instructor 2, the multi-hat isolation, and the "Must NOT" list.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import {
  createProject, addMember, runGate, submitReview, submitDocument, assignRole, scheduleDefense,
  confirmMilestones, recordVerdict, signForm,
} from '../services/actions.js'
import { worklist } from '../services/worklist.js'
import { canView, canDo, allowedActions } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { canSign } from '../domain/forms.js'
import { STAGES, stageByKey } from '../domain/stages.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const pdf = { fileName: 'draft.pdf', fileSize: 1000, fileType: 'application/pdf' }
const mailsFor = (event) => snap().outbox.filter(m => m.event === event)
const audit = (action) => snap().auditLogs.filter(a => a.action === action)

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('S1 — group formation', () => {
  it('S1.1 — a new group is written with its Instructor 1 assignment, history and audit in one unit', async () => {
    const p = await createProject(as('f_bravo'), null, { title: 'Untitled — Group 7', sectionId: 'sec_wd401' })
    expect(p).toMatchObject({ currentStage: 'GROUP_FORMATION', block: 'WD-401', sectionId: 'sec_wd401' })
    expect(snap().projectAssignments.filter(a => a.projectId === p.id)).toEqual([
      expect.objectContaining({ userId: 'f_bravo', roleType: P.INSTRUCTOR_1 }),
    ])
    expect(snap().workflowHistory.some(h => h.projectId === p.id && h.toStage === 'GROUP_FORMATION' && h.hat === P.INSTRUCTOR_1)).toBe(true)
    expect(audit('PROJECT_CREATED')[0]).toMatchObject({ actorId: 'f_bravo', hat: P.INSTRUCTOR_1, projectId: p.id })

    await addMember(as('f_bravo'), null, p.id, 's_whiskey')
    expect(snap().outbox.find(m => m.userIds.includes('s_whiskey'))).toMatchObject({ projectId: p.id, event: 'Added to a group', to: ['whiskey@student.hau.edu.ph'] })
    expect(canView(user('s_whiskey'), b(p.id))).toBe(true)
  })

  it('S1.1 — a student is never in two groups, even when two groups claim them at once', async () => {
    const me = as('f_bravo')
    await expect(addMember(me, null, 'p_g4', 's_kilo')).rejects.toThrow(/already in a group/)
    await expect(addMember(me, null, 'p_g4', 's_quebec')).rejects.toThrow(/not in section WD-401/)
    await expect(addMember(me, null, 'p_g4', 'f_charlie')).rejects.toThrow(/Only student/)

    const p = await createProject(me, null, { title: 'Group 8', sectionId: 'sec_wd401' })
    const q = await createProject(me, null, { title: 'Group 9', sectionId: 'sec_wd401' })
    const results = await Promise.allSettled([
      addMember(me, null, q.id, 's_whiskey'),
      addMember(me, null, p.id, 's_whiskey'),
    ])
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1)
    expect(snap().projectMembers.filter(m => m.userId === 's_whiskey').length).toBe(1)
  })

  it('S1.1 — a group holds four students (flag GROUP_SIZE)', async () => {
    expect(snap().projectMembers.filter(m => m.projectId === 'p_g4').length).toBe(4)
    await expect(addMember(as('f_bravo'), null, 'p_g4', 's_whiskey')).rejects.toThrow(/already has 4 members/)
  })

  it('S1.1 — only for a Capstone 1 block the instructor teaches', async () => {
    await expect(createProject(as('f_charlie'), null, { title: 'x', sectionId: 'sec_wd401' })).rejects.toThrow()
    await expect(createProject(as('f_bravo'), null, { title: 'x', sectionId: 'sec_nope' })).rejects.toThrow(/section you teach/)
  })

  it('S1.2 — forwarding the roster reaches the Program Chair’s "Needs adviser" queue', async () => {
    const empty = await createProject(as('f_bravo'), null, { title: 'Empty group', sectionId: 'sec_wd401' })
    await expect(runGate(user('f_bravo'), null, empty.id, { action: 'ENDORSE_ROSTER' })).rejects.toThrow(/at least one student/)

    await runGate(as('f_bravo'), null, 'p_g4', { action: 'ENDORSE_ROSTER' })
    expect(b('p_g4').project.currentStage).toBe('ADVISER_ASSIGNMENT')
    const pc = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g4')
    expect(pc.gates.map(g => g.gate.action)).toEqual(['ROUTE_ADVISER'])
    expect(mailsFor('Stage: Adviser Assignment')[0].userIds).toEqual(expect.arrayContaining(['f_alpha', 's_tango', 's_victor']))
    expect(audit('STAGE_ENDORSE_ROSTER')[0]).toMatchObject({ hat: P.INSTRUCTOR_1, before: { stage: 'GROUP_FORMATION' }, after: { stage: 'ADVISER_ASSIGNMENT' } })
    // Instructor 1 still sees the group, now waiting on the PC (NEW-6 applies after S5.8 only).
    const mine = worklist(snap(), user('f_bravo')).find(r => r.project.id === 'p_g4')
    expect(mine.gates).toEqual([])
    // Unassigned students (not specified — flagged): Whiskey stays ungrouped; forwarding is not blocked.
    expect(snap().projectMembers.some(m => m.userId === 's_whiskey')).toBe(false)
  })
})

describe('S3 — topics and concept paper (Instructor 1 side)', () => {
  it('S3.2 — returning needs remarks; S3.3 approving needs one of the five topics', async () => {
    const me = as('f_bravo')
    await expect(submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.MAJOR })).rejects.toThrow(/change/)
    await expect(submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Not one of them' }))
      .rejects.toThrow(/Choose which/)
    await submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Library Seat Availability Monitor' })
    // Approving one topic rejects the rest by construction: topics close for the group.
    expect(b('p_g1').documents.find(d => d.id === 'd_g1_topic').status).toBe(DOC_STATUS.APPROVED)
  })

  it('S3.4 — registering sets the title everywhere and keeps the stage; it runs once', async () => {
    const me = as('f_bravo')
    await expect(runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })).rejects.toThrow(/Approve one/)
    await submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Library Seat Availability Monitor' })
    await runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })
    expect(b('p_g1').project).toMatchObject({
      title: 'Library Seat Availability Monitor', currentStage: 'TOPIC_PROPOSAL', previousTitles: ['Untitled — Group 1 (WD-401)'],
    })
    expect(audit('REGISTER_TOPIC')[0]).toMatchObject({ hat: P.INSTRUCTOR_1, after: { title: 'Library Seat Availability Monitor' } })
    await expect(runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })).rejects.toThrow(/already/)
    // Title shows for the students and the Adviser (same project record).
    for (const uid of ['s_kilo', 'f_alpha']) {
      expect(worklist(snap(), user(uid)).find(r => r.project.id === 'p_g1').project.title).toBe('Library Seat Availability Monitor')
    }
  })

  it('S3.6 — the concept-paper gate runs from the Documents tab only; a return keeps the stage', async () => {
    const me = as('f_bravo')
    await submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Library Seat Availability Monitor' })
    await runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })
    const cp = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf })
    await expect(runGate(as('f_bravo'), null, 'p_g1', { action: 'APPROVE_CONCEPT_PAPER' })).rejects.toThrow(/Documents tab/)
    await submitReview(as('f_bravo'), null, 'p_g1', cp.id, { decision: DECISIONS.MAJOR, comment: 'Narrow the scope.' })
    expect(b('p_g1').project.currentStage).toBe('TOPIC_PROPOSAL')
    const v2 = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf })
    // The Adviser reviews but does not decide at Topic Proposal (I1 is the gate).
    expect(canDo(user('f_alpha'), 'reviewDocument', b('p_g1'), { doc: v2 }).ok).toBe(false)
    await submitReview(as('f_bravo'), null, 'p_g1', v2.id, { decision: DECISIONS.APPROVE })
    expect(b('p_g1').project.currentStage).toBe('PROPOSAL_DEVELOPMENT')
    expect(audit('STAGE_APPROVE_CONCEPT_PAPER')[0]).toMatchObject({ hat: P.INSTRUCTOR_1 })
  })
})

describe('S4 — proposal development', () => {
  it('S4.2 — Instructor 1 returns drafts but cannot approve them; the Adviser approves', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    const d = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf })
    const bravo = user('f_bravo')
    expect(canDo(bravo, 'returnDocument', b('p_g1'), { doc: d }).ok).toBe(true)
    expect(canDo(bravo, 'reviewDocument', b('p_g1'), { doc: d }).ok).toBe(false)
    await expect(submitReview(as('f_bravo'), null, 'p_g1', d.id, { decision: DECISIONS.APPROVE })).rejects.toThrow()
    await submitReview(as('f_bravo'), null, 'p_g1', d.id, { decision: DECISIONS.MAJOR, comment: 'Add the RRL matrix.' })
    expect(b('p_g1').documents.find(x => x.id === d.id).status).toBe(DOC_STATUS.FOR_REVISION)
    expect(snap().outbox.filter(m => m.userIds.includes('s_kilo') && m.event === 'Revision requested').length).toBe(1)
  })

  it('S4.3 — approval for defense waits for the Adviser, then lands in the PC’s "Needs panel" queue', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    const d = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf })
    await expect(runGate(as('f_bravo'), null, 'p_g1', { action: 'APPROVE_FOR_DEFENSE' })).rejects.toThrow(/approved by the Adviser/)
    await submitReview(as('f_alpha'), null, 'p_g1', d.id, { decision: DECISIONS.APPROVE })
    await runGate(as('f_bravo'), null, 'p_g1', { action: 'APPROVE_FOR_DEFENSE' })
    expect(b('p_g1').project.currentStage).toBe('PANEL_ASSIGNMENT')
    expect(worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g1').gates.map(g => g.gate.action))
      .toContain('CONFIRM_PANEL')
    expect(mailsFor('Stage: Panel Assignment')[0].userIds).toContain('f_alpha')
    expect(audit('STAGE_APPROVE_FOR_DEFENSE')[0]).toMatchObject({ hat: P.INSTRUCTOR_1 })
  })
})

describe('S5.8 — routing to Capstone 2', () => {
  async function readyToRoute({ signed = true, withI2 = true } = {}) {
    const s = applyStage(buildSeed(), 'p_g2', 'PROPOSAL_REVISION', { roles: SEED_ROLES.p_g2 })
    for (const f of Object.values(s.forms).filter(x => x.projectId === 'p_g2' && x.formType === FORMS.F2004.code)) {
      if (signed) s.forms[f.id] = { ...f, status: 'Signed', signatories: f.signatories.map(x => ({ ...x, signedAt: x.signedAt ?? new Date().toISOString() })) }
    }
    if (withI2) {
      s.projectAssignments.a_i2 = { id: 'a_i2', projectId: 'p_g2', userId: 'f_foxtrot', roleType: P.INSTRUCTOR_2, status: 'Accepted' }
    }
    await load(s)
  }

  it('is blocked until FM-2004 is signed and an Instructor 2 is assigned', async () => {
    await readyToRoute({ signed: false })
    await expect(runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })).rejects.toThrow(/still needs/)
    await readyToRoute({ withI2: false })
    await expect(runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })).rejects.toThrow(/Instructor 2/)
  })

  it('the Next-step panel lists who acts, in order, and the current step moves as each one acts', async () => {
    await readyToRoute({ signed: false, withI2: false })
    const gate = stageByKey('PROPOSAL_REVISION').gates[0]
    const now = () => { const st = gate.steps(b('p_g2')); return st.find(x => !x.done) }
    const roles = gate.steps(b('p_g2')).map(x => x.role)
    expect(roles).toEqual([P.PANEL_CHAIR, 'Group', P.ADVISER, P.ADVISER, P.PANEL_MEMBER, 'Program Chair/Coordinator', P.INSTRUCTOR_1])
    expect(gate.steps(b('p_g2'))[0].done).toBe(true) // the Chair signed with the verdict
    expect(now()).toMatchObject({ role: 'Group', label: 'Upload the revised manuscript' })

    const rev = await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, ...pdf })
    expect(now()).toMatchObject({ role: P.ADVISER, label: 'Approve the revised manuscript' })
    await submitReview(as('f_charlie'), null, 'p_g2', rev.id, { decision: DECISIONS.APPROVE })
    expect(now()).toMatchObject({ role: P.ADVISER, label: 'Sign FM-AAC-SOC-2004' })
    const f = b('p_g2').forms.find(x => x.formType === FORMS.F2004.code)
    await signForm(as('f_charlie'), null, 'p_g2', f.id)
    expect(now()).toMatchObject({ role: P.PANEL_MEMBER, userId: 'f_echo' })
    await signForm(as('f_echo'), null, 'p_g2', f.id)
    expect(now()).toMatchObject({ role: 'Program Chair/Coordinator', label: 'Assign an Instructor 2' })
    await assignRole(as('f_alpha'), null, 'p_g2', 'f_foxtrot', P.INSTRUCTOR_2)
    expect(now()).toMatchObject({ role: P.INSTRUCTOR_1, gate: true })
    await runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })
    expect(b('p_g2').project.currentStage).toBe('IMPLEMENTATION')
  })

  it('moves to Implementation, emails Instructor 2 and opens the project to them; Instructor 1 loses it (NEW-6)', async () => {
    await readyToRoute()
    expect(canView(user('f_foxtrot'), b('p_g2'))).toBe(false)
    await runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })
    expect(b('p_g2').project.currentStage).toBe('IMPLEMENTATION')
    expect(canView(user('f_foxtrot'), b('p_g2'))).toBe(true)
    expect(mailsFor('Stage: Implementation & Monitoring')[0].userIds).toEqual(expect.arrayContaining(['f_foxtrot', 's_november', 'f_charlie']))
    expect(canView(user('f_bravo'), b('p_g2'))).toBe(false) // flag I1_ACCESS_AFTER_ROUTING = 'none'
    expect(audit('STAGE_CLOSE_PROPOSAL_REVISION')[0]).toMatchObject({ actorId: 'f_bravo', hat: P.INSTRUCTOR_1 })
  })
})

describe('multi-hat (item 4)', () => {
  it('on G3 Prof. Bravo is only a Panel Member: no Instructor 1 action, the panel sign-off in turn', async () => {
    const ctx = resolveContext(user('f_bravo'), b('p_g3'))
    expect(ctx.projectRoles).toEqual([P.PANEL_MEMBER])
    for (const a of ['manageRoster', 'REGISTER_TOPIC', 'APPROVE_FOR_DEFENSE', 'CLOSE_PROPOSAL_REVISION', 'returnDocument', 'reviewDocument']) {
      expect(canDo(user('f_bravo'), a, b('p_g3'), { doc: { status: DOC_STATUS.SUBMITTED, docType: T.REVISED_MANUSCRIPT } }).ok, a).toBe(false)
    }
    // FM-2004: Bravo's line opens once the Adviser has verified the revisions.
    const f = b('p_g3').forms.find(x => x.formType === FORMS.F2004.code && x.payload.defenseType === 'Final')
    expect(canSign(f, user('f_bravo'), b('p_g3')).ok).toBe(false)
    const adviserDone = { ...f, signatories: f.signatories.map(x => (x.role === P.ADVISER ? { ...x, signedAt: new Date().toISOString() } : x)) }
    expect(canSign(adviserDone, user('f_bravo'), b('p_g3')).ok).toBe(true)
  })

  it('on G1, G2 and G4 no panel action ever appears for Prof. Bravo', async () => {
    for (const pid of ['p_g1', 'p_g2', 'p_g4']) {
      const ctx = resolveContext(user('f_bravo'), b(pid))
      expect(ctx.projectRoles, pid).toEqual([P.INSTRUCTOR_1])
      expect(canDo(user('f_bravo'), 'recordVerdict', b(pid)).ok, pid).toBe(false)
      for (const cap of ['annotation.private', 'verdict.record']) expect(ctx.grants.has(cap), `${pid} ${cap}`).toBe(false)
    }
    // At every stage, the Instructor 1 hat carries no panel or PC capability.
    for (const s of STAGES) {
      const acts = allowedActions(P.INSTRUCTOR_1, s.key)
      for (const a of ['recordVerdict', 'assignAdviser', 'assignPanel', 'assignInstructor2', 'scheduleDefense', 'confirmMilestones', 'signWeeklyLog']) {
        expect(acts, `${s.key} ${a}`).not.toContain(a)
      }
    }
  })
})

describe('Must NOT (item 5)', () => {
  it('assign advisers or panels', async () => {
    await at('p_g4', 'ADVISER_ASSIGNMENT')
    await expect(assignRole(as('f_bravo'), null, 'p_g4', 'f_charlie', P.ADVISER)).rejects.toThrow()
    await at('p_g1', 'PANEL_ASSIGNMENT')
    await expect(assignRole(as('f_bravo'), null, 'p_g1', 'f_charlie', P.PANEL_MEMBER)).rejects.toThrow()
  })

  it('schedule a defense (proposal: PC per NEW-2; final: Instructor 2)', async () => {
    await at('p_g2', 'PROPOSAL_DEFENSE_SCHEDULING')
    await expect(scheduleDefense(as('f_bravo'), null, 'p_g2', { scheduledAt: new Date().toISOString(), venue: 'Room' })).rejects.toThrow()
    await at('p_g2', 'FINAL_DEFENSE_SCHEDULING')
    await expect(scheduleDefense(as('f_bravo'), null, 'p_g2', { scheduledAt: new Date().toISOString(), venue: 'Room' })).rejects.toThrow()
  })

  it('confirm Capstone 2 milestones or record a verdict', async () => {
    await at('p_g2', 'IMPLEMENTATION')
    await expect(confirmMilestones(as('f_bravo'), null, 'p_g2', 'systemComponents')).rejects.toThrow(/Not permitted|not available/)
    await load(buildSeed())
    await expect(recordVerdict(as('f_bravo'), null, 'p_g2', { verdict: 'Re-defense' })).rejects.toThrow()
  })

  it('see groups outside the block as Instructor 1', async () => {
    // G3 is a CS group (CS-301 → CS-401); Bravo sees it only while the panel hat is active.
    await at('p_g3', 'TOPIC_PROPOSAL')
    expect(canView(user('f_bravo'), b('p_g3'))).toBe(false)
    expect(worklist(snap(), user('f_bravo')).map(r => r.project.id)).not.toContain('p_g3')
  })

  it('approve before the precondition is met', async () => {
    const me = as('f_bravo')
    await expect(runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })).rejects.toThrow(/Approve one/)
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    await expect(runGate(as('f_bravo'), null, 'p_g1', { action: 'APPROVE_FOR_DEFENSE' })).rejects.toThrow()
    // A gate from another stage is refused.
    await expect(runGate(as('f_bravo'), null, 'p_g1', { action: 'ENDORSE_ROSTER' })).rejects.toThrow()
  })

  it('T21 — every Instructor 1 write carries the hat "Instructor 1"', async () => {
    const me = as('f_bravo')
    await submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Library Seat Availability Monitor' })
    await runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })
    await runGate(me, null, 'p_g4', { action: 'ENDORSE_ROSTER' })
    const mine = snap().auditLogs.filter(a => a.actorId === 'f_bravo')
    expect(mine.length).toBeGreaterThanOrEqual(3)
    expect(new Set(mine.map(a => a.hat))).toEqual(new Set([P.INSTRUCTOR_1]))
    // (Rows fabricated by the stage builder carry no hat; only real writes are checked.)
    const written = snap().workflowHistory.filter(h => h.actorId === 'f_bravo' && h.note !== 'Set by the stage builder')
    expect(written.length).toBeGreaterThanOrEqual(3)
    expect(written.every(h => h.hat === P.INSTRUCTOR_1)).toBe(true)
  })
})
