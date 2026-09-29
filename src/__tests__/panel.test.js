// Prompt 7 — Panel Member. Prof. Charlie (G1), Prof. Bravo (G3), AD Echo (G2).
// What a panelist sees and signs, isolation between panelists and projects,
// and the S5.7 / S8.4 / S9.3b handoffs.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { submitDocument, submitReview, signForm, recordVerdict, unassignRole } from '../services/actions.js'
import { worklist } from '../services/worklist.js'
import { canView, canDo, viewBundle, canViewAnnotation, allowedActions } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { canSign } from '../domain/forms.js'
import { stageByKey } from '../domain/stages.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const pdf = { fileName: 'r.pdf', fileSize: 1000, fileType: 'application/pdf' }
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const f2004 = (pid, type) => b(pid).forms.find(f => f.formType === FORMS.F2004.code && f.payload.defenseType === type)

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('what a panelist sees (items 1, 3, 4)', () => {
  it('T15 — only the latest version of each document; an older version is not in the bundle at all', () => {
    const all = b('p_g2').documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT)
    const seen = viewBundle(user('f_echo'), b('p_g2'))
    expect(all.length).toBe(2)
    expect(seen.documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT).map(d => d.versionNumber)).toEqual([2])
    const old = all.find(d => d.status === DOC_STATUS.SUPERSEDED)
    expect(seen.documents.some(d => d.id === old.id)).toBe(false)
    expect(canDo(user('f_echo'), 'viewDocumentHistory', b('p_g2')).ok).toBe(false)
    // The defense schedule is visible.
    expect(seen.defenses.some(d => !d.verdict)).toBe(true)
  })

  it('the project appears only from panel assignment (S5.1) and disappears when removed (T16)', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT', { preassign: [P.PANEL_MEMBER] })
    expect(canView(user('f_charlie'), b('p_g1'))).toBe(false)
    await load(scenarioStore('T16'))
    expect(worklist(snap(), user('f_charlie')).map(r => r.project.id)).toContain('p_g1')
    await unassignRole(as('f_alpha'), null, 'p_g1', b('p_g1').assignments.find(a => a.userId === 'f_charlie'))
    expect(canView(user('f_charlie'), b('p_g1'))).toBe(false)
  })

  it('R12 guard — private notes are the author’s alone; AI summary per AI_SUMMARY_AUDIENCE', async () => {
    await load(scenarioStore('T4'))
    const note = b('p_g1').annotations.find(a => a.visibility === 'private')
    const sees = (uid, a = note) => canViewAnnotation(user(uid), resolveContext(user(uid), b('p_g1')), a)
    expect(sees('f_charlie')).toBe(true) // author
    expect(sees('f_foxtrot')).toBe(false) // the Panel Chair
    expect(sees('f_alpha')).toBe(false) // the Adviser
    expect(sees('s_kilo')).toBe(false) // students, before the verdict
    const released = { ...note, releasedAt: new Date().toISOString() }
    expect(sees('s_kilo', released)).toBe(true) // PANEL_NOTES_RELEASE = students-on-verdict
    expect(sees('f_foxtrot', released)).toBe(false) // never between panelists
    expect(canDo(user('f_charlie'), 'viewAiSummary', b('p_g1')).ok).toBe(true)
    expect(canDo(user('s_kilo'), 'viewAiSummary', b('p_g1')).ok).toBe(false)
  })
})

describe('S8.4 — verify and sign FM-2004 after the final defense (Bravo, G3)', () => {
  it('only after the Adviser verifies; the last signature completes revisions and opens Clearance', async () => {
    expect(canSign(f2004('p_g3', 'Final'), user('f_bravo'), b('p_g3'))).toMatchObject({ ok: false, reason: expect.stringMatching(/waiting on Adviser/) })
    await expect(signForm(as('f_bravo'), null, 'p_g3', f2004('p_g3', 'Final').id)).rejects.toThrow()
    // The Next-step panel shows Bravo where he is in line.
    const steps = stageByKey('FINAL_REVISION').gates[0].steps(b('p_g3'))
    expect(steps.find(s => s.role === P.PANEL_MEMBER)).toMatchObject({ userId: 'f_bravo', done: false })

    const rev = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.REVISED_MANUSCRIPT, ...pdf })
    await submitReview(as('f_delta'), null, 'p_g3', rev.id, { decision: DECISIONS.APPROVE })
    await signForm(as('f_delta'), null, 'p_g3', f2004('p_g3', 'Final').id)
    expect(worklist(snap(), user('f_bravo')).find(r => r.project.id === 'p_g3').tasks)
      .toEqual([expect.objectContaining({ kind: 'revision', label: `Verify the revisions and sign ${FORMS.F2004.code}` })])

    await signForm(as('f_bravo'), null, 'p_g3', f2004('p_g3', 'Final').id)
    const p = b('p_g3').project
    expect(p).toMatchObject({ currentStage: 'CLEARANCE', revisionDeadline: null, revisionStatus: null })
    expect(b('p_g3').defenses.find(d => d.type === 'Final').revisionStatus).toBe('Completed')
    expect(b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)).toBeTruthy()
    expect(recipients('p_g3', 'Approval Sheet to sign')).toEqual(['f_delta'])
    expect(recipients('p_g3', 'Stage: Final Requirements')).toEqual(expect.arrayContaining(['s_quebec', 's_romeo']))
    expect(snap().auditLogs.find(a => a.action === 'STAGE_COMPLETE_FINAL_REVISION')).toMatchObject({ actorId: 'f_bravo', hat: P.PANEL_MEMBER })
  })

  it('S5.7 — after the proposal defense the last signature tells Instructor 1 to move the group on', async () => {
    await at('p_g2', 'PROPOSAL_REVISION')
    const rev = await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, ...pdf })
    await submitReview(as('f_charlie'), null, 'p_g2', rev.id, { decision: DECISIONS.APPROVE })
    await signForm(as('f_charlie'), null, 'p_g2', f2004('p_g2', 'Proposal').id)
    expect(recipients('p_g2', `${FORMS.F2004.code} to sign`)).toEqual(['f_echo'])
    await signForm(as('f_echo'), null, 'p_g2', f2004('p_g2', 'Proposal').id)
    expect(b('p_g2').project.currentStage).toBe('PROPOSAL_REVISION') // S5.8 is Instructor 1's step
    expect(recipients('p_g2', 'Revisions verified')).toEqual(['f_bravo'])
  })
})

describe('S9.3b — the Approval Sheet (G3 at Clearance)', () => {
  it('panel signs after the Adviser, in any order; when all have signed the PC is emailed and can endorse', async () => {
    await load(scenarioStore('T12')) // Clearance with both certificates
    const sheet = () => b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    expect(canSign(sheet(), user('f_bravo'), b('p_g3')).reason).toMatch(/waiting on Adviser/)
    await signForm(as('f_delta'), null, 'p_g3', sheet().id)
    await signForm(as('f_bravo'), null, 'p_g3', sheet().id) // Member before Chair: same order, any order
    expect(recipients('p_g3', 'Approval Sheet to endorse')).toEqual([])
    await signForm(as('f_foxtrot'), null, 'p_g3', sheet().id)
    expect(recipients('p_g3', 'Approval Sheet to endorse')).toEqual(['f_alpha'])
    const pc = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g3')
    expect(pc.gates.find(g => g.gate.action === 'ENDORSE_TO_URO')).toMatchObject({ blocker: null, hat: G.COORDINATOR })
  })
})

describe('Must NOT (item 5)', () => {
  it('T5 — a Panel Member never records the verdict', async () => {
    await load(scenarioStore('T5'))
    expect(canDo(user('f_charlie'), 'recordVerdict', b('p_g1')).ok).toBe(false)
    await expect(recordVerdict(as('f_charlie'), null, 'p_g1', { verdict: 'Re-defense' })).rejects.toThrow()
    for (const stage of ['PROPOSAL_DEFENSE', 'FINAL_DEFENSE']) expect(allowedActions(P.PANEL_MEMBER, stage)).not.toContain('recordVerdict')
  })

  it('no review decision, no adviser action, no other project', async () => {
    const m = b('p_g2').documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
    expect(canDo(user('f_echo'), 'reviewDocument', b('p_g2'), { doc: { ...m, status: DOC_STATUS.SUBMITTED } }).ok).toBe(false)
    expect(canDo(user('f_echo'), 'signWeeklyLog', b('p_g2'), { log: { status: 'Submitted' } }).ok).toBe(false)
    expect(canView(user('f_echo'), b('p_g1'))).toBe(false)
    expect(canView(user('f_bravo'), b('p_g2'))).toBe(true) // as Instructor 1, not as panel
    expect(resolveContext(user('f_bravo'), b('p_g2')).projectRoles).toEqual([P.INSTRUCTOR_1])
  })

  it('NEW-6 (SAME_PANEL_BOTH_DEFENSES) — the proposal panel carries over to the final defense', async () => {
    await at('p_g2', 'FINAL_DEFENSE')
    const panel = b('p_g2').assignments.filter(a => [P.PANEL_CHAIR, P.PANEL_MEMBER].includes(a.roleType)).map(a => a.userId).sort()
    expect(panel).toEqual(['f_alpha', 'f_echo'])
  })
})
