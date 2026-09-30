// Prompt 6 — Adviser. Prof. Alpha (G1), Prof. Charlie (G2), Dean Delta (G3).
// Reviewing, log signing, FM-AAC-SOC-2005, revision verification and the
// Approval Sheet, each through the write path, with the handoff it triggers.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import * as actions from '../services/actions.js'
import {
  submitDocument, submitReview, decideWeeklyLog, confirmMilestones, confirmReadiness, runGate, signForm, recordVerdict, addAnnotation,
} from '../services/actions.js'
import { worklist } from '../services/worklist.js'
import { canView, canDo, viewBundle, canViewAnnotation } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { canSign } from '../domain/forms.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const pdf = (name = 'file.pdf') => ({ fileName: name, fileSize: 1000, fileType: 'application/pdf' })
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const tasksOf = (uid, pid) => worklist(snap(), user(uid)).find(r => r.project.id === pid)?.tasks ?? []

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('S4.2 / S6.4 — review decisions', () => {
  it('return → the group uploads vN+1; the old version stays readable and untouched; then approve', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    const v = (n) => b('p_g1').documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT).find(d => d.versionNumber === n)
    const draft = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf('draft.pdf') })
    expect(tasksOf('f_alpha', 'p_g1')).toEqual([expect.objectContaining({ kind: 'review', hat: P.ADVISER })])

    await expect(submitReview(as('f_alpha'), null, 'p_g1', draft.id, { decision: DECISIONS.MAJOR })).rejects.toThrow(/change/)
    await submitReview(as('f_alpha'), null, 'p_g1', draft.id, { decision: DECISIONS.MAJOR, comment: 'Objective 2 is not measurable.' })
    expect(recipients('p_g1', 'Revision requested')).toEqual(expect.arrayContaining(['s_kilo', 's_lima']))
    const returned = { ...v(draft.versionNumber) }

    const next = await submitDocument(as('s_lima'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf('draft-2.pdf') })
    const old = v(draft.versionNumber)
    expect(old.status).toBe(DOC_STATUS.SUPERSEDED)
    expect({ ...old, status: returned.status, updatedAt: undefined }).toEqual({ ...returned, updatedAt: undefined })
    for (const uid of ['f_alpha', 's_kilo']) {
      expect(viewBundle(user(uid), b('p_g1')).documents.some(d => d.id === draft.id), uid).toBe(true)
    }
    await submitReview(as('f_alpha'), null, 'p_g1', next.id, { decision: DECISIONS.APPROVE })
    expect(v(next.versionNumber).status).toBe(DOC_STATUS.APPROVED)
    expect(v(next.versionNumber).fileName).toBe('draft-2.pdf')
    expect(snap().auditLogs.filter(a => a.action === 'REVIEW_DECISION').every(a => a.hat === P.ADVISER)).toBe(true)
  })

  it('T17 — a double-clicked Approve records one decision', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    const d = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf() })
    const me = as('f_alpha')
    const results = await Promise.allSettled([
      submitReview(me, null, 'p_g1', d.id, { decision: DECISIONS.APPROVE }),
      submitReview(me, null, 'p_g1', d.id, { decision: DECISIONS.APPROVE }),
    ])
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1)
    expect(snap().reviews.filter(r => r.documentId === d.id).length).toBe(1)
  })

  it('S3.2 / S3.6 — at Topic Proposal the Adviser reads and annotates (guard, R12) but Instructor 1 decides', () => {
    const doc = b('p_g1').documents.find(d => d.id === 'd_g1_topic')
    expect(canDo(user('f_alpha'), 'annotate', b('p_g1'), { doc }).ok).toBe(true)
    expect(canDo(user('f_alpha'), 'reviewDocument', b('p_g1'), { doc }).ok).toBe(false)
  })
})

describe('S6.2 / S6.7 — Implementation (T1)', () => {
  it('S6.2 — approve + e-sign, or return with remarks; the group and Instructor 2 see the status', async () => {
    await load(scenarioStore('T1'))
    const log = b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    expect(tasksOf('f_alpha', 'p_g1')).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'log', n: 1 })]))
    await expect(decideWeeklyLog(as('f_alpha'), null, 'p_g1', log.id, { approve: false })).rejects.toThrow(/why/)
    await decideWeeklyLog(as('f_alpha'), null, 'p_g1', log.id, { approve: false, remarks: 'List the modules tested.' })
    expect(b('p_g1').weeklyLogs.find(l => l.id === log.id)).toMatchObject({ status: 'Returned', adviserRemarks: 'List the modules tested.' })
    expect(tasksOf('s_kilo', 'p_g1').map(t => t.label)).toContain(`Week ${log.weekNo} log was returned — resubmit it`)
    // Instructor 2 (Foxtrot) follows progress, but cannot sign (OQ#7, WEEKLY_LOG_SIGNER = Adviser).
    expect(viewBundle(user('f_foxtrot'), b('p_g1')).weeklyLogs.find(l => l.id === log.id).status).toBe('Returned')
    expect(canDo(user('f_foxtrot'), 'signWeeklyLog', b('p_g1'), { log: { status: 'Submitted' } }).ok).toBe(false)
  })

  it('S6.7 — FM-2005 needs 2 signed logs, a final manuscript, Instructor 2’s milestones and readiness check; then it reaches the PC', async () => {
    await load(scenarioStore('T1'))
    const blocked = () => runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE' })
    await expect(blocked()).rejects.toThrow(/2 approved weekly logs/)
    const log = b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    await decideWeeklyLog(as('f_alpha'), null, 'p_g1', log.id, { approve: true })
    expect(b('p_g1').weeklyLogs.find(l => l.id === log.id)).toMatchObject({ status: 'Approved', signedBy: 'f_alpha' })
    await expect(blocked()).rejects.toThrow(/Final Manuscript/)
    await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.FINAL_MANUSCRIPT, ...pdf() })
    await expect(blocked()).rejects.toThrow(/Instructor 2 has not confirmed the Capstone 2 milestones/)
    await confirmMilestones(as('f_foxtrot'), null, 'p_g1', 'revisedManuscript')
    await confirmMilestones(as('f_foxtrot'), null, 'p_g1', 'systemComponents', 'System components demonstrated.')
    await expect(blocked()).rejects.toThrow(/ready for final defense/) // NEW-43
    await confirmReadiness(as('f_foxtrot'), null, 'p_g1')
    await runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE' })

    expect(b('p_g1').project.currentStage).toBe('FINAL_DEFENSE_ENDORSEMENT')
    const f = b('p_g1').forms.find(x => x.formType === FORMS.F2005.code)
    expect(f.signatories[0]).toMatchObject({ role: P.ADVISER, userId: 'f_alpha' })
    // The PC's "Recommendations to endorse" — Prof. Alpha is also WD's Program Chair.
    const pcRow = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g1')
    expect(pcRow.gates.map(g => [g.gate.queue, g.hat])).toEqual([['Recommendations to endorse', G.COORDINATOR]])
    // Alpha is both G1's Adviser and WD's PC: nobody is emailed about their own action.
    expect(recipients('p_g1', 'Stage: Final Defense Endorsement')).toEqual(expect.arrayContaining(['s_kilo', 's_lima']))
    expect(recipients('p_g1', 'Stage: Final Defense Endorsement')).not.toContain('f_alpha')
    expect(snap().auditLogs.find(a => a.action === 'FORM_SUBMITTED')).toMatchObject({ hat: P.ADVISER, after: { formType: FORMS.F2005.code } })
  })
})

describe('S8.3 / S9.3a — verifying revisions and the Approval Sheet (Dean Delta, G3)', () => {
  it('S8.3 — FM-2004 waits for a revised manuscript made for THIS verdict; then the panel is asked to verify', async () => {
    const f = () => b('p_g3').forms.find(x => x.formType === FORMS.F2004.code && x.payload.defenseType === 'Final')
    // The approved revised manuscript from the proposal defense does not count.
    expect(canSign(f(), user('f_delta'), b('p_g3'))).toMatchObject({ ok: false, reason: expect.stringMatching(/not uploaded its revised manuscript/) })
    await expect(signForm(as('f_delta'), null, 'p_g3', f().id)).rejects.toThrow()
    const rev = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.REVISED_MANUSCRIPT, ...pdf() })
    expect(tasksOf('f_delta', 'p_g3')).toEqual([expect.objectContaining({ kind: 'revision' })])
    expect(canSign(f(), user('f_delta'), b('p_g3')).reason).toMatch(/Approve the revised manuscript/)
    await submitReview(as('f_delta'), null, 'p_g3', rev.id, { decision: DECISIONS.APPROVE })
    await signForm(as('f_delta'), null, 'p_g3', f().id)
    // Panel: "Revisions to verify".
    expect(recipients('p_g3', `${FORMS.F2004.code} to sign`)).toEqual(['f_bravo'])
    expect(tasksOf('f_bravo', 'p_g3')).toEqual([expect.objectContaining({ kind: 'revision', hat: P.PANEL_MEMBER, label: `Verify the revisions and sign ${FORMS.F2004.code}` })])
  })

  it('S9.3a — the Approval Sheet waits for both certificates; the Adviser’s signature opens the panel’s lines', async () => {
    await at('p_g3', 'CLEARANCE')
    const sheet = () => b('p_g3').forms.find(x => x.formType === FORMS.APPROVAL.code)
    expect(canSign(sheet(), user('f_delta'), b('p_g3')).reason).toMatch(/Editor’s Certificate|Editor's Certificate/)
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.EDITORS_CERTIFICATE, ...pdf() })
    await submitDocument(as('s_romeo'), null, 'p_g3', { docType: T.PLAGIARISM_CERTIFICATE, ...pdf() })
    expect(tasksOf('f_delta', 'p_g3')).toEqual([expect.objectContaining({ kind: 'form', label: 'Approval Sheet to sign' })])
    await signForm(as('f_delta'), null, 'p_g3', sheet().id)
    expect(recipients('p_g3', 'Approval Sheet to sign').sort()).toEqual(['f_bravo', 'f_foxtrot'])
    expect(snap().auditLogs.find(a => a.action === 'SIGNATURE_APPLIED' && a.projectId === 'p_g3')).toMatchObject({ actorId: 'f_delta', hat: P.ADVISER })
  })
})

describe('Must NOT (item 4) and T4 / T8', () => {
  it('T4 — no panelist’s private note (guard; R12)', async () => {
    await load(scenarioStore('T4'))
    const note = b('p_g1').annotations.find(a => a.visibility === 'private')
    expect(canViewAnnotation(user('f_alpha'), resolveContext(user('f_alpha'), b('p_g1')), note)).toBe(false)
    expect(viewBundle(user('f_alpha'), b('p_g1')).annotations).toEqual([])
    expect(canDo(user('f_alpha'), 'viewPrivatePanelNotes', b('p_g1')).ok).toBe(false)
  })

  it('no verdict, no other adviser’s group, no edit or delete path', async () => {
    await expect(recordVerdict(as('f_charlie'), null, 'p_g2', { verdict: 'Re-defense' })).rejects.toThrow() // Adviser of G2
    const m = b('p_g2').documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
    await expect(submitReview(as('f_alpha'), null, 'p_g2', m.id, { decision: DECISIONS.APPROVE })).rejects.toThrow() // Alpha is not G2's Adviser
    expect(canView(user('f_delta'), b('p_g1'))).toBe(false)
    expect(Object.keys(actions).filter(n => /^(delete|remove|edit|update|replace)Document/i.test(n))).toEqual([])
    await expect(addAnnotation(as('f_charlie'), null, 'p_g2', m.id, { text: 'x' })).rejects.toThrow() // no annotating at a defense stage as Adviser
  })

  it('no Approval Sheet before the revisions are complete: it is issued only when final revisions close', () => {
    expect(b('p_g3').project.currentStage).toBe('FINAL_REVISION')
    expect(b('p_g3').forms.some(f => f.formType === FORMS.APPROVAL.code)).toBe(false)
  })

  it('T8 — Dean Delta has the full Adviser view of G3', () => {
    expect(viewBundle(user('f_delta'), b('p_g3')).documents.length).toBe(b('p_g3').documents.length)
    expect(resolveContext(user('f_delta'), b('p_g3')).projectRoles).toEqual([P.ADVISER])
  })
})
