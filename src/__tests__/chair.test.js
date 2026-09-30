// Prompt 8 — Panel Chair (= Panel Member + verdict). Prof. Alpha, Panel Chair
// of G2 (also Adviser of G1 and Program Chair/Coordinator). The verdict on
// FM-AAC-SOC-2004 and its effect on every other role.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { recordVerdict, correctVerdict, addAnnotation, submitReview, submitDocument, runGate, flagOverdueRevisions } from '../services/actions.js'
import { canSign } from '../domain/forms.js'
import { worklist, groupDue } from '../services/worklist.js'
import { canView, canDo, viewBundle, canViewAnnotation } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, FORMS, VERDICTS, PROJECT_ROLES as P } from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)
const DAY = 864e5
const daysLeft = (iso) => Math.round((new Date(iso) - Date.now()) / DAY)
const students = () => b('p_g2').members.map(m => m.userId)

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('S5.6 — recording the proposal verdict (G2)', () => {
  it('the verdict values come from VERDICT_VALUES; the required revisions are required text', async () => {
    expect(Object.values(VERDICTS)).toEqual(Object.values(FLAGS.VERDICT_VALUES))
    await expect(recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: 'Passed', remarks: 'x' })).rejects.toThrow(/Choose a verdict/)
    await expect(recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: '  ' })).rejects.toThrow(/required revisions/)
    await expect(recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.REDEFENSE })).rejects.toThrow(/re-defense/)
    expect(b('p_g2').defenses.every(d => !d.verdict)).toBe(true)
  })

  it('Minor → Proposal Revision with a 7-day countdown; FM-2004 issued; group, Adviser and I1 told', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'Add the load-test results.' })
    const p = b('p_g2').project
    expect(p.currentStage).toBe('PROPOSAL_REVISION') // NEW-3: a sub-status of Proposal Defense
    expect(p.revisionClass).toBe('Minor')
    expect(daysLeft(p.revisionDeadline)).toBe(FLAGS.REVISION_DAYS.Minor)
    const f = b('p_g2').forms.find(x => x.formType === FORMS.F2004.code)
    expect(f.payload).toMatchObject({ verdict: VERDICTS.MINOR, remarks: 'Add the load-test results.', defenseType: 'Proposal' })
    expect(f.signatories.map(s => [s.role, Boolean(s.signedAt)])).toEqual([
      [P.PANEL_CHAIR, true], [P.ADVISER, false], [P.PANEL_MEMBER, false],
    ])
    // Reflects on the group (verdict, requirements, countdown), the Adviser and Instructor 1.
    expect(recipients('p_g2', 'Revision requested')).toEqual(expect.arrayContaining([...students(), 'f_charlie']))
    expect(groupDue(b('p_g2'), resolveContext(user('s_november'), b('p_g2'))).map(t => t.label))
      .toEqual(['Upload the revised manuscript for the Adviser', `Revisions due in ${FLAGS.REVISION_DAYS.Minor} day(s)`])
    const seen = viewBundle(user('s_november'), b('p_g2')).defenses.find(d => d.verdict)
    expect(seen).toMatchObject({ verdict: VERDICTS.MINOR, remarks: 'Add the load-test results.' })
    expect(recipients('p_g2', 'Stage: Proposal Defense · Revisions')).toContain('f_bravo')
    expect(snap().auditLogs.find(a => a.action === 'VERDICT_RECORDED')).toMatchObject({ actorId: 'f_alpha', hat: P.PANEL_CHAIR })
  })

  it('Major → a 14-day countdown', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MAJOR, remarks: 'Redo the evaluation design.' })
    expect(daysLeft(b('p_g2').project.revisionDeadline)).toBe(FLAGS.REVISION_DAYS.Major)
  })

  it('NEW-41 — Re-defense: required changes and a countdown; the Adviser’s approval returns it to scheduling', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.REDEFENSE, remarks: 'The prototype did not run.' })
    const p = b('p_g2').project
    expect(p).toMatchObject({ currentStage: 'PROPOSAL_REVISION', revisionClass: 'Re-defense', revisionStatus: 'Pending' })
    expect(daysLeft(p.revisionDeadline)).toBe(FLAGS.REVISION_DAYS[FLAGS.REDEFENSE_REVISION_DAYS])
    // FM-2004 records it with the Chair's line only: nobody else signs a re-defense.
    const f = b('p_g2').forms.find(x => x.formType === FORMS.F2004.code)
    expect(f).toMatchObject({ status: 'Signed', payload: { verdict: VERDICTS.REDEFENSE } })
    expect(f.signatories.map(x => x.role)).toEqual([P.PANEL_CHAIR])
    expect(recipients('p_g2', 'Re-defense')).toEqual(expect.arrayContaining([...students(), 'f_charlie']))
    // Instructor 1 cannot route to Capstone 2 during a re-defense.
    await expect(runGate(as('f_bravo'), null, 'p_g2', { action: 'CLOSE_PROPOSAL_REVISION' })).rejects.toThrow(/current stage/)
    const rev = await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, fileName: 'r.pdf', fileType: 'application/pdf' })
    await submitReview(as('f_charlie'), null, 'p_g2', rev.id, { decision: DECISIONS.APPROVE })
    expect(b('p_g2').project).toMatchObject({ currentStage: 'PROPOSAL_DEFENSE_SCHEDULING', revisionDeadline: null })
    expect(b('p_g2').defenses.find(d => d.verdict).revisionStatus).toBe('Completed')
    const pc = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g2')
    expect(pc.gates.map(g => g.gate.queue)).toContain('Proposal defenses to schedule')
  })

  it('one verdict per defense; a double-submit records once', async () => {
    const me = as('f_alpha')
    const results = await Promise.allSettled([
      recordVerdict(me, null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'A' }),
      recordVerdict(me, null, 'p_g2', { verdict: VERDICTS.MAJOR, remarks: 'B' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1)
    expect(b('p_g2').defenses.filter(d => d.verdict).length).toBe(1)
    expect(snap().auditLogs.filter(a => a.action === 'VERDICT_RECORDED').length).toBe(1)
    // And no change afterwards: the stage has moved on and the guard refuses.
    await expect(recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.REDEFENSE, remarks: 'C' })).rejects.toThrow()
  })

  it('NEW-40 — the verdict waits until the scheduled time has passed', async () => {
    const d = b('p_g2').defenses.find(x => !x.verdict)
    await db.update('defenses', d.id, { scheduledAt: new Date(Date.now() + 3 * DAY).toISOString() })
    await expect(recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })).rejects.toThrow(/after it is held/)
    const gate = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g2').gates[0]
    expect(gate.blocker).toMatch(/after it is held/)
    await db.update('defenses', d.id, { scheduledAt: new Date(Date.now() - 3600e3).toISOString() })
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    expect(b('p_g2').project.currentStage).toBe('PROPOSAL_REVISION')
  })
})

describe('private notes on the verdict (R12, guard only — PANEL_NOTES_RELEASE)', () => {
  it('released to the students when the verdict is recorded; never to other panelists (the Chair included)', async () => {
    const note = () => b('p_g2').annotations.find(a => a.authorId === 'f_echo' && a.visibility === 'private')
    const sees = (uid) => canViewAnnotation(user(uid), resolveContext(user(uid), b('p_g2')), note())
    expect([sees('f_echo'), sees('f_alpha'), sees('s_november'), sees('f_charlie')]).toEqual([true, false, false, false])
    // The Chair's own note stays hers.
    const m = viewBundle(user('f_alpha'), b('p_g2')).documents.find(x => x.docType === T.PROPOSAL_MANUSCRIPT)
    const mine = await addAnnotation(as('f_alpha'), null, 'p_g2', m.id, { text: 'Ask about queue fairness.' })
    expect(canViewAnnotation(user('f_echo'), resolveContext(user('f_echo'), b('p_g2')), mine)).toBe(false)

    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    expect(note().releasedAt).toBeTruthy()
    expect([sees('f_echo'), sees('f_alpha'), sees('s_november'), sees('f_charlie')]).toEqual([true, false, true, false])
    expect(canDo(user('s_november'), 'viewPrivatePanelNotes', b('p_g2')).ok).toBe(true)
  })
})

describe('S7.6 — the final verdict (G2 at Final Defense)', () => {
  it('Minor → Final Revision; Instructor 2 and the panel see the status', async () => {
    await at('p_g2', 'FINAL_DEFENSE')
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'Add the confusion matrix.' })
    expect(b('p_g2').project.currentStage).toBe('FINAL_REVISION')
    for (const uid of ['f_foxtrot', 'f_echo', 'f_charlie']) {
      expect(viewBundle(user(uid), b('p_g2')).defenses.find(d => d.type === 'Final').verdict, uid).toBe(VERDICTS.MINOR)
    }
  })

  it('Re-defense → changes, the Adviser approves, then Final Defense Scheduling for Instructor 2 (S7.7 → S7.3)', async () => {
    await at('p_g2', 'FINAL_DEFENSE')
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.REDEFENSE, remarks: 'System not deployed.' })
    expect(b('p_g2').project.currentStage).toBe('FINAL_REVISION')
    // The panel's FM-2004 sign-off does not apply; nothing opens Clearance.
    expect(canSign(b('p_g2').forms.filter(f => f.formType === FORMS.F2004.code).at(-1), user('f_echo'), b('p_g2')).ok).toBe(false)
    const rev = await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, fileName: 'r.pdf', fileType: 'application/pdf' })
    await submitReview(as('f_charlie'), null, 'p_g2', rev.id, { decision: DECISIONS.APPROVE })
    expect(b('p_g2').project.currentStage).toBe('FINAL_DEFENSE_SCHEDULING')
    expect(canDo(user('f_foxtrot'), 'scheduleDefense', b('p_g2')).ok).toBe(true)
  })
})

describe('NEW-42 — correcting a verdict (once, within 24 hours, before anyone acts)', () => {
  const recorded = () => b('p_g2').defenses.find(d => d.verdict)

  it('the Chair corrects Minor → Major: countdown from the original time, FM-2004 updated, audited, re-emailed', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'Tighten the scope.' })
    await expect(correctVerdict(as('f_alpha'), null, 'p_g2', { defenseId: recorded().id, verdict: VERDICTS.MAJOR, remarks: 'Redo the evaluation.' }))
      .rejects.toThrow(/why the verdict is being corrected/)
    await correctVerdict(as('f_alpha'), null, 'p_g2', { defenseId: recorded().id, verdict: VERDICTS.MAJOR, remarks: 'Redo the evaluation.', reason: 'Recorded the wrong class.' })
    const d = recorded()
    expect(d).toMatchObject({ verdict: VERDICTS.MAJOR, previousVerdict: VERDICTS.MINOR, correctionReason: 'Recorded the wrong class.', revisionClass: 'Major' })
    expect(Math.round((new Date(d.revisionDeadline) - new Date(d.recordedAt)) / DAY)).toBe(FLAGS.REVISION_DAYS.Major)
    expect(b('p_g2').project.revisionClass).toBe('Major')
    expect(b('p_g2').forms.find(f => f.formType === FORMS.F2004.code).payload).toMatchObject({ verdict: VERDICTS.MAJOR, remarks: 'Redo the evaluation.' })
    expect(snap().auditLogs.find(a => a.action === 'VERDICT_CORRECTED')).toMatchObject({
      actorId: 'f_alpha', hat: P.PANEL_CHAIR, before: { verdict: VERDICTS.MINOR }, after: { verdict: VERDICTS.MAJOR }, meta: { reason: 'Recorded the wrong class.' },
    })
    expect(recipients('p_g2', 'Verdict corrected')).toEqual(expect.arrayContaining([...students(), 'f_charlie']))
    // Once only.
    await expect(correctVerdict(as('f_alpha'), null, 'p_g2', { defenseId: d.id, verdict: VERDICTS.MINOR, remarks: 'x', reason: 'y' })).rejects.toThrow(/already been corrected/)
  })

  it('Minor → Re-defense changes the path: the panel lines go, and the approval returns it to scheduling', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    await correctVerdict(as('f_alpha'), null, 'p_g2', { defenseId: recorded().id, verdict: VERDICTS.REDEFENSE, remarks: 'Demo failed.', reason: 'Wrong verdict.' })
    expect(b('p_g2').forms.find(f => f.formType === FORMS.F2004.code).signatories.map(x => x.role)).toEqual([P.PANEL_CHAIR])
    const rev = await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, fileName: 'r.pdf', fileType: 'application/pdf' })
    await submitReview(as('f_charlie'), null, 'p_g2', rev.id, { decision: DECISIONS.APPROVE })
    expect(b('p_g2').project.currentStage).toBe('PROPOSAL_DEFENSE_SCHEDULING')
  })

  it('refused once someone acts, after 24 hours, or for anyone but the Chair', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    const input = () => ({ defenseId: recorded().id, verdict: VERDICTS.MAJOR, remarks: 'y', reason: 'z' })
    await expect(correctVerdict(as('f_echo'), null, 'p_g2', input())).rejects.toThrow()
    await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, fileName: 'r.pdf', fileType: 'application/pdf' })
    await expect(correctVerdict(as('f_alpha'), null, 'p_g2', input())).rejects.toThrow(/already uploaded a revised manuscript/)

    await load(buildSeed())
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    await db.update('defenses', recorded().id, { recordedAt: new Date(Date.now() - 25 * 3600e3).toISOString() })
    await expect(correctVerdict(as('f_alpha'), null, 'p_g2', input())).rejects.toThrow(/within 24 hours/)
  })
})

describe('T2 / T5 / T18', () => {
  it('T2 — no adviser actions on G2', () => {
    const m = b('p_g2').documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
    expect(canDo(user('f_alpha'), 'reviewDocument', b('p_g2'), { doc: { ...m, status: DOC_STATUS.SUBMITTED } }).ok).toBe(false)
    expect(canDo(user('f_alpha'), 'recordVerdict', b('p_g2')).hat).toBe(P.PANEL_CHAIR)
    expect(resolveContext(user('f_alpha'), b('p_g2')).projectRoles).toEqual([P.PANEL_CHAIR])
  })

  it('T5 (inverse) — the Chair can, the Panel Member cannot', async () => {
    expect(canDo(user('f_echo'), 'recordVerdict', b('p_g2')).ok).toBe(false)
    await expect(recordVerdict(as('f_echo'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })).rejects.toThrow()
    expect(canDo(user('f_alpha'), 'recordVerdict', b('p_g2')).ok).toBe(true)
  })

  it('T18 — the countdown a verdict starts expires into Overdue, with the email', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'x' })
    // Eight days on: G2's countdown (and the seed's other running ones) have expired.
    await flagOverdueRevisions(Date.now() + (FLAGS.REVISION_DAYS.Minor + 1) * DAY)
    expect(b('p_g2').defenses.find(d => d.verdict).revisionStatus).toBe('Overdue')
    expect(b('p_g2').project.revisionStatus).toBe('Overdue')
    expect(recipients('p_g2', 'Overdue Revision')).toEqual(expect.arrayContaining([...students(), 'f_charlie']))
    // The Chair is not an Adviser here: the revision itself goes to the Adviser, not to her.
    expect(canDo(user('f_alpha'), 'reviewDocument', b('p_g2'), { doc: { docType: T.REVISED_MANUSCRIPT, status: DOC_STATUS.SUBMITTED } }).ok).toBe(false)
    await expect(submitReview(as('f_alpha'), null, 'p_g2', 'nope', { decision: 'Approve' })).rejects.toThrow()
    expect(canView(user('f_alpha'), b('p_g2'))).toBe(true)
  })
})
