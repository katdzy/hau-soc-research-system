// Prompt 10 — University Research Office (URO Uniform). S9.4 clearance
// verification: the "Clearances to verify" queue, clearing (the Dean and AD see
// the project for the first time), the return path for certificates (NEW-7,
// NEW-45), what the URO must not do, and T11 / T12.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { runGate, returnToGroup, submitDocument, addAnnotation, submitReview, signForm } from '../services/actions.js'
import { worklist, officeQueues, groupDue } from '../services/worklist.js'
import { canView, canDo, viewBundle, allowedActions } from '../domain/guard.js'
import { resolveContext, allowedDocTypes } from '../domain/caac.js'
import { STAGES, uroReturnOutstanding } from '../domain/stages.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'
import { canSign } from '../domain/forms.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const audit = (action) => snap().auditLogs.filter(a => a.action === action)
const latest = (pid, t) => b(pid).documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0]
const pdf = { fileName: 'certificate.pdf', fileSize: 1000, fileType: 'application/pdf' }
const inQueue = (uid, name) => worklist(snap(), user(uid))
  .filter(r => r.gates.some(g => g.gate.queue === name && !g.blocker)).map(r => r.project.id)
const EDITOR = T.EDITORS_CERTIFICATE
const PLAG = T.PLAGIARISM_CERTIFICATE

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(scenarioStore('T11')) }) // G3 at URO Verification

describe('item 1 — "Clearances to verify"', () => {
  it('the URO has one queue; G3 is in it with the three items to verify', () => {
    expect(officeQueues(user('o_uniform')).map(q => q.name)).toEqual(['Clearances to verify'])
    expect(inQueue('o_uniform', 'Clearances to verify')).toEqual(['p_g3'])
    const gate = worklist(snap(), user('o_uniform'))[0].gates[0]
    expect(gate).toMatchObject({ hat: G.URO, blocker: null })
    expect(gate.gate.verifies).toEqual([EDITOR, PLAG, T.FINAL_MANUSCRIPT])
    for (const t of gate.gate.verifies) expect(viewBundle(user('o_uniform'), b('p_g3')).documents.some(d => d.docType === t), t).toBe(true)
  })

  it('T12 — before the PC endorses: not visible, not in the queue, guard rejects', async () => {
    await load(scenarioStore('T12'))
    expect(canView(user('o_uniform'), b('p_g3'))).toBe(false)
    expect(worklist(snap(), user('o_uniform'))).toEqual([])
    await expect(runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })).rejects.toThrow()
    await expect(returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [EDITOR], remarks: 'x' })).rejects.toThrow()
  })
})

describe('S9.4 — clear', () => {
  it('signs the Approval Sheet, marks the certificates Approved, and opens the project to the Dean and AD for the first time', async () => {
    expect(canView(user('f_echo'), b('p_g3'))).toBe(false) // AD: not before the URO clears
    expect(canDo(user('f_delta'), 'FINAL_APPROVE', b('p_g3')).ok).toBe(false) // T11
    await Promise.all([
      runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' }),
      runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' }).catch(() => null),
    ])
    expect(audit('STAGE_URO_VERIFY')).toHaveLength(1)
    expect(audit('STAGE_URO_VERIFY')[0]).toMatchObject({ actorId: 'o_uniform', hat: G.URO })
    expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
    const sheet = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    expect(sheet.signatories.find(s => s.role === G.URO)).toMatchObject({ userId: 'o_uniform', signedAt: expect.any(String) })
    expect([latest('p_g3', EDITOR).status, latest('p_g3', PLAG).status]).toEqual([DOC_STATUS.APPROVED, DOC_STATUS.APPROVED])

    expect(canView(user('f_echo'), b('p_g3'))).toBe(true)
    expect(inQueue('f_echo', 'Projects for final approval')).toEqual(['p_g3'])
    expect(inQueue('f_delta', 'Projects for final approval')).toEqual(['p_g3'])
    expect(recipients('p_g3', 'Fully cleared project endorsed')).toEqual(expect.arrayContaining(['f_echo', 'f_delta', 's_quebec']))
    // The URO's step is done: the project leaves the URO.
    expect(canView(user('o_uniform'), b('p_g3'))).toBe(false)
  })
})

describe('S9.4 — return to the group (NEW-7, NEW-45)', () => {
  it('certificates (or the manuscript, NEW-46), remarks required; the returned version is For Revision; group and Adviser emailed', async () => {
    const me = as('o_uniform')
    await expect(returnToGroup(me, null, 'p_g3', { docTypes: [T.PRESENTATION_VIDEO], remarks: 'x' })).rejects.toThrow(/Only the certificates/)
    await expect(returnToGroup(me, null, 'p_g3', { docTypes: [], remarks: 'x' })).rejects.toThrow(/Choose/)
    await expect(returnToGroup(me, null, 'p_g3', { docTypes: [EDITOR], remarks: ' ' })).rejects.toThrow(/Say what/)
    const v1 = latest('p_g3', EDITOR)
    await Promise.all([
      returnToGroup(me, null, 'p_g3', { docTypes: [EDITOR], remarks: 'The certificate is unsigned.' }),
      returnToGroup(me, null, 'p_g3', { docTypes: [EDITOR], remarks: 'The certificate is unsigned.' }).catch(() => null),
    ])
    expect(b('p_g3').project.uroReturns).toHaveLength(1)
    expect(b('p_g3').project).toMatchObject({ currentStage: 'URO_VERIFICATION', uroReturns: [{ by: 'o_uniform', docTypes: [EDITOR], documentIds: [v1.id] }] })
    expect(latest('p_g3', EDITOR)).toMatchObject({ id: v1.id, status: DOC_STATUS.FOR_REVISION })
    expect(latest('p_g3', PLAG).status).not.toBe(DOC_STATUS.FOR_REVISION)
    expect(audit('URO_RETURNED')[0]).toMatchObject({ actorId: 'o_uniform', hat: G.URO, after: { remarks: 'The certificate is unsigned.' } })
    expect(recipients('p_g3', 'Returned by the URO').sort()).toEqual(['f_delta', ...b('p_g3').members.map(m => m.userId)].sort())
    // The Approval Sheet signatures stand.
    const sheet = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    expect(sheet.signatories.filter(s => s.order <= 3).every(s => s.signedAt)).toBe(true)
  })

  it('the URO waits: no clearing and no second return until the group replaces the certificate', async () => {
    await returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [EDITOR, PLAG], remarks: 'Both are expired.' })
    await expect(runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })).rejects.toThrow(/Waiting for a new/)
    await expect(returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [EDITOR], remarks: 'x' })).rejects.toThrow(/Already returned/)
    expect(worklist(snap(), user('o_uniform'))[0].gates[0].blocker).toMatch(/Waiting for a new/)
  })

  it('students see the remarks and upload vN+1 of exactly the returned certificate; it comes back to the URO', async () => {
    await returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [EDITOR, PLAG], remarks: 'Both are expired.' })
    const ctx = resolveContext(user('s_quebec'), b('p_g3'))
    expect(groupDue(b('p_g3'), ctx).filter(t => t.urgent).map(t => t.label)).toEqual([
      `${EDITOR} v1 was returned — upload a revised version`, `${PLAG} v1 was returned — upload a revised version`,
    ])
    expect(viewBundle(user('s_quebec'), b('p_g3')).project.uroReturns[0].remarks).toBe('Both are expired.')
    expect(allowedDocTypes('URO_VERIFICATION', b('p_g3'))).toEqual([EDITOR, PLAG])
    await expect(submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, ...pdf })).rejects.toThrow(/not accepted/)

    const v2 = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: EDITOR, ...pdf })
    expect(v2.versionNumber).toBe(2)
    expect(b('p_g3').documents.find(d => d.id === v2.supersedes).status).toBe(DOC_STATUS.SUPERSEDED)
    expect(uroReturnOutstanding(b('p_g3'))).toEqual([PLAG])
    expect(recipients('p_g3', 'Certificates resubmitted')).toEqual([]) // not until both are in
    await expect(submitDocument(as('s_romeo'), null, 'p_g3', { docType: EDITOR, ...pdf })).rejects.toThrow(/not accepted/)

    await submitDocument(as('s_romeo'), null, 'p_g3', { docType: PLAG, ...pdf })
    expect(uroReturnOutstanding(b('p_g3'))).toEqual([])
    expect(recipients('p_g3', 'Certificates resubmitted')).toEqual(['o_uniform'])
    expect(inQueue('o_uniform', 'Clearances to verify')).toEqual(['p_g3'])
    expect(groupDue(b('p_g3'), resolveContext(user('s_quebec'), b('p_g3')))).toEqual([])

    await runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })
    expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
    expect(latest('p_g3', EDITOR)).toMatchObject({ versionNumber: 2, status: DOC_STATUS.APPROVED })
  })

  it('only the URO returns, and only at URO Verification', async () => {
    for (const uid of ['f_delta', 'f_alpha', 's_quebec', 'a_sierra', 'f_foxtrot']) {
      expect(canDo(user(uid), 'uroReturn', b('p_g3'), { docTypes: [EDITOR] }).ok, uid).toBe(false)
    }
    for (const s of STAGES) {
      expect(allowedActions(G.URO, s.key).includes('uroReturn'), s.key).toBe(s.key === 'URO_VERIFICATION')
    }
    // A later stage change clears it: the stage builder starts every project with no returns.
    await at('p_g3', 'URO_VERIFICATION')
    expect(b('p_g3').project.uroReturns).toEqual([])
  })
})

describe('NEW-46 — the URO returns the manuscript (flag URO_MANUSCRIPT_RETURN)', () => {
  const sheets = () => b('p_g3').forms.filter(f => f.formType === FORMS.APPROVAL.code)
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))

  it('back to Final Requirements; the old sheet is voided and a new one is signed again, in order, after the new manuscript', async () => {
    const old = sheets()[0]
    await returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [T.FINAL_MANUSCRIPT], remarks: 'Chapter 5 does not match the system tested.' })
    expect(b('p_g3').project.currentStage).toBe('CLEARANCE')
    expect(sheets()).toHaveLength(2)
    expect(sheets()[1]).toMatchObject({ id: old.id, status: 'Void' })
    expect(sheets()[1].signatories.filter(x => x.order <= 3).every(x => x.signedAt)).toBe(true) // the record stays
    expect(sheets()[0]).toMatchObject({ status: 'Circulating', payload: { reissueOf: old.id } })
    expect(sheets()[0].signatories.every(x => !x.signedAt)).toBe(true)
    expect(latest('p_g3', T.FINAL_MANUSCRIPT).status).toBe(DOC_STATUS.FOR_REVISION)
    expect(canView(user('o_uniform'), b('p_g3'))).toBe(false) // until the PC endorses again
    expect(recipients('p_g3', 'Returned by the URO')).toEqual(expect.arrayContaining(['s_quebec', 'f_delta']))
    expect(audit('STAGE_URO_RETURN_MANUSCRIPT')[0]).toMatchObject({ actorId: 'o_uniform', hat: G.URO, before: { stage: 'URO_VERIFICATION' }, after: { stage: 'CLEARANCE' } })

    // The Adviser waits for the group; the voided sheet cannot be signed.
    expect(canSign(sheets()[0], user('f_delta'), b('p_g3')).reason).toMatch(/waiting for the group’s new Final Manuscript/)
    await expect(signForm(as('f_delta'), null, 'p_g3', sheets()[0].id)).rejects.toThrow()
    expect(recipients('p_g3', 'Approval Sheet to sign')).toEqual([])
    const due = groupDue(b('p_g3'), resolveContext(user('s_quebec'), b('p_g3')))
    expect(due).toEqual([expect.objectContaining({ label: `${T.FINAL_MANUSCRIPT} v1 was returned — upload a revised version`, urgent: true })])

    const v2 = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, ...pdf })
    expect(v2.versionNumber).toBe(2)
    expect(recipients('p_g3', 'Approval Sheet to sign')).toEqual(['f_delta'])
    await signForm(as('f_delta'), null, 'p_g3', sheets()[0].id)
    await signForm(as('f_foxtrot'), null, 'p_g3', sheets()[0].id)
    await signForm(as('f_bravo'), null, 'p_g3', sheets()[0].id)
    await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_TO_URO' })
    expect(b('p_g3').project.currentStage).toBe('URO_VERIFICATION')
    expect(inQueue('o_uniform', 'Clearances to verify')).toEqual(['p_g3'])
    await runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })
    expect(latest('p_g3', T.FINAL_MANUSCRIPT)).toMatchObject({ versionNumber: 2, status: DOC_STATUS.APPROVED })
    expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
  })

  it('switched off: only the certificates can be returned', async () => {
    const was = FLAGS.URO_MANUSCRIPT_RETURN
    FLAGS.URO_MANUSCRIPT_RETURN = 'off'
    try {
      await expect(returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [T.FINAL_MANUSCRIPT], remarks: 'x' })).rejects.toThrow(/Only the certificates can be returned/)
    } finally { FLAGS.URO_MANUSCRIPT_RETURN = was }
  })
})

describe('URO emails (flag URO_EMAILS — not stated in the manuscript)', () => {
  it('each can be switched off', async () => {
    const was = { ...FLAGS.URO_EMAILS }
    FLAGS.URO_EMAILS = { endorsedToUro: false, certificatesResubmitted: false }
    try {
      await returnToGroup(as('o_uniform'), null, 'p_g3', { docTypes: [T.EDITORS_CERTIFICATE], remarks: 'Unsigned.' })
      await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.EDITORS_CERTIFICATE, ...pdf })
      expect(recipients('p_g3', 'Certificates resubmitted')).toEqual([])
      await load(scenarioStore('T10'))
      await runGate(as('f_alpha'), null, 'p_g3', { action: 'ENDORSE_TO_URO' })
      expect(recipients('p_g3', 'Stage: URO Verification')).not.toContain('o_uniform')
    } finally { FLAGS.URO_EMAILS = was }
  })

  it('URO_SIGNS_APPROVAL_SHEET (on): the URO line is signed by clearing, never from the Forms tab', async () => {
    expect(FLAGS.URO_SIGNS_APPROVAL_SHEET).toBe(true)
    const line = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code).signatories.find(x => x.role === G.URO)
    expect(line).toMatchObject({ order: 4, viaGate: true })
  })

  it('URO_SIGNS_APPROVAL_SHEET off: no URO line; clearing is recorded without a signature and the Dean/AD still sign', async () => {
    const was = FLAGS.URO_SIGNS_APPROVAL_SHEET
    FLAGS.URO_SIGNS_APPROVAL_SHEET = false
    try {
      await load(scenarioStore('T11')) // rebuilt with the flag off
      const sheet = () => b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
      expect(sheet().signatories.some(x => x.role === G.URO)).toBe(false)
      await runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })
      expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
      expect(audit('STAGE_URO_VERIFY')[0]).toMatchObject({ actorId: 'o_uniform', hat: G.URO })
      expect(audit('SIGNATURE_APPLIED').filter(a => a.actorId === 'o_uniform')).toEqual([])
      await runGate(as('f_echo'), null, 'p_g3', { action: 'FINAL_APPROVE' })
      await runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE' })
      expect(b('p_g3').project.currentStage).toBe('ARCHIVED')
    } finally { FLAGS.URO_SIGNS_APPROVAL_SHEET = was }
  })
})

describe('Must NOT (item 3)', () => {
  it('annotate or decide on the manuscript (guard only, R12)', async () => {
    const m = latest('p_g3', T.FINAL_MANUSCRIPT)
    expect(canDo(user('o_uniform'), 'annotate', b('p_g3'), { doc: { ...m, status: DOC_STATUS.SUBMITTED } }).ok).toBe(false)
    await expect(addAnnotation(as('o_uniform'), null, 'p_g3', m.id, { text: 'x', category: 'General' })).rejects.toThrow()
    await expect(submitReview(as('o_uniform'), null, 'p_g3', m.id, { decision: DECISIONS.APPROVE })).rejects.toThrow()
    expect(canDo(user('o_uniform'), 'viewDocumentHistory', b('p_g3')).ok).toBe(false)
  })

  it('take any earlier workflow action, at any stage', () => {
    const own = new Set(['viewProject', 'readDocuments', 'viewAnnotations', 'URO_VERIFY', 'uroReturn', 'signForm'])
    for (const s of STAGES) {
      const extra = allowedActions(G.URO, s.key).filter(a => !own.has(a))
      expect(extra, s.key).toEqual([])
    }
    // signForm is the Approval Sheet's own check: the URO line is signed only through URO_VERIFY.
    const sheet = b('p_g3').forms.find(f => f.formType === FORMS.APPROVAL.code)
    return expect(signForm(as('o_uniform'), null, 'p_g3', sheet.id)).rejects.toThrow()
  })

  it('T11 — the Dean cannot give the final signature before the URO clears', async () => {
    await expect(runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE' })).rejects.toThrow()
    await expect(runGate(as('f_echo'), null, 'p_g3', { action: 'FINAL_APPROVE' })).rejects.toThrow()
  })
})
