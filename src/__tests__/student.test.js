// Prompt 2 — Student. Every student step in WORKFLOWS.md §3 through the write
// path (guard → all-or-nothing write → audit → history → notification/outbox),
// the §4 "Never" list, and the student side of T4, T13, T14, T18.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import * as actions from '../services/actions.js'
import {
  submitDocument, submitReview, submitWeeklyLog, runGate, flagOverdueRevisions, createProject, addAnnotation,
  recordVerdict,
} from '../services/actions.js'
import { groupDue, worklist } from '../services/worklist.js'
import { canView, canDo, viewBundle, allowedActions, canViewAnnotation } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { STAGES } from '../domain/stages.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage, opts = {}) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid], ...opts }))
const pdf = (name = 'upload.pdf') => ({ fileName: name, fileSize: 120000, fileType: 'application/pdf' })
const TOPICS = ['Smart Parking Finder', 'Canteen Pre-Order App', 'Org Event Attendance via QR', 'Lab Borrowing Log', 'Alumni Job Board']
const lastMail = () => [...snap().outbox].sort((x, y) => (x.at < y.at ? 1 : -1))[0]
const mailTo = (event) => snap().outbox.filter(m => m.event === event).flatMap(m => m.userIds).sort()

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('S3 — topics and concept paper', () => {
  it('S3.1 — five distinct topics in one PDF; I1 and the Adviser are notified; audit + history written', async () => {
    const me = as('s_kilo')
    await expect(submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS.slice(0, 4), ...pdf() }))
      .rejects.toThrow(/all 5 topics/)
    await expect(submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: [...TOPICS.slice(0, 4), 'smart parking finder '], ...pdf() }))
      .rejects.toThrow(/different/)
    await expect(submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS }))
      .rejects.toThrow(/Attach the PDF/)
    await expect(submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, fileName: 'topics.docx' }))
      .rejects.toThrow(/Only PDF/)
    await expect(submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, fileName: 'fake.pdf', fileType: 'image/png' }))
      .rejects.toThrow(/Only PDF/)

    const v2 = await submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf('topics.pdf') })
    expect(v2).toMatchObject({ versionNumber: 2, topics: TOPICS, status: DOC_STATUS.SUBMITTED })
    expect(lastMail()).toMatchObject({ event: 'Topic Proposal submitted' })
    expect(lastMail().userIds.sort()).toEqual(['f_alpha', 'f_bravo'])
    expect(snap().auditLogs.find(a => a.action === 'DOCUMENT_SUBMITTED')).toMatchObject({
      actorId: 's_kilo', hat: G.STUDENT, before: { version: 1 }, after: { version: 2, docType: T.TOPIC_PROPOSAL },
    })
    expect(snap().workflowHistory.some(h => h.action === 'DOCUMENT_SUBMITTED' && h.note === 'Topic Proposal v2 submitted')).toBe(true)
  })

  it('S3.3–S3.6 — approve one topic, register it, then the concept paper; its approval opens Proposal Development', async () => {
    const me = as('s_kilo')
    await expect(submitDocument(me, null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf() })).rejects.toThrow(/approve one of your proposed topics/)
    const v2 = await submitDocument(me, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf() })

    // Instructor 1 must pick one of the five.
    await expect(submitReview(as('f_bravo'), null, 'p_g1', v2.id, { decision: DECISIONS.APPROVE }))
      .rejects.toThrow(/Choose which/)
    await submitReview(as('f_bravo'), null, 'p_g1', v2.id, { decision: DECISIONS.APPROVE, approvedTopic: TOPICS[1] })
    expect(snap().outbox.filter(m => m.userIds.includes('s_kilo') && m.event === 'Approved')[0].body).toContain(TOPICS[1])

    // Topics close; the concept paper waits for the registered title (S3.4).
    await expect(submitDocument(as('s_lima'), null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf() }))
      .rejects.toThrow(/already approved/)
    await expect(submitDocument(as('s_lima'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf() })).rejects.toThrow(/register/)
    await runGate(as('f_bravo'), null, 'p_g1', { action: 'REGISTER_TOPIC' })
    expect(b('p_g1').project).toMatchObject({ title: TOPICS[1], currentStage: 'TOPIC_PROPOSAL' })
    const cp = await submitDocument(as('s_lima'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf('cp.pdf') })
    expect(lastMail().userIds.sort()).toEqual(['f_alpha', 'f_bravo'])

    await submitReview(as('f_bravo'), null, 'p_g1', cp.id, { decision: DECISIONS.APPROVE })
    expect(b('p_g1').project.currentStage).toBe('PROPOSAL_DEVELOPMENT')
    await expect(submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf() })).rejects.toThrow(/not accepted/)
  })

  it('S3.2 — a returned version shows the reviewer’s remarks and asks the group for a new version', async () => {
    await submitReview(as('f_bravo'), null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.MAJOR, comment: 'Topics 2 and 4 overlap.' })
    const view = viewBundle(user('s_kilo'), b('p_g1'))
    expect(view.reviews.find(r => r.documentId === 'd_g1_topic')).toMatchObject({ decision: DECISIONS.MAJOR, comment: 'Topics 2 and 4 overlap.' })
    expect(groupDue(b('p_g1'), resolveContext(user('s_kilo'), b('p_g1'))).map(t => t.label))
      .toContain('Topic Proposal v1 was returned — upload a revised version')
    expect(mailTo('Revision requested')).toEqual(snap().projectMembers.filter(m => m.projectId === 'p_g1').map(m => m.userId).sort())
  })
})

describe('S4–S9 — uploads at each stage', () => {
  it('S4.1 — proposal drafts go to Instructor 1 and the Adviser', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, title: 'Chapters 1–3', ...pdf() })
    expect(lastMail().userIds.sort()).toEqual(['f_alpha', 'f_bravo'])
    const w = worklist(snap(), user('f_alpha')).find(r => r.project.id === 'p_g1')
    expect(w.tasks.map(t => t.label)).toContain('1 submission(s) awaiting your decision')
  })

  it('S5.3 — once scheduled: complete manuscript + a valid video link; the panel is notified and sees the latest version only', async () => {
    const me = as('s_november') // G2 is at Proposal Defense in the seed
    await expect(submitDocument(me, null, 'p_g2', { docType: T.PRESENTATION_VIDEO, link: 'youtube.com/watch?v=1' })).rejects.toThrow(/full link/)
    await expect(submitDocument(me, null, 'p_g2', { docType: T.PRESENTATION_VIDEO, link: 'https://x' })).rejects.toThrow(/full link/)
    await expect(submitDocument(me, null, 'p_g2', { docType: T.PRESENTATION_VIDEO, link: 'javascript:alert(1)' })).rejects.toThrow(/full link/)
    const video = await submitDocument(me, null, 'p_g2', { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/abc123' })
    expect(video).toMatchObject({ link: 'https://youtu.be/abc123', fileName: null })
    expect(lastMail().userIds.sort()).toEqual(['f_alpha', 'f_echo']) // Panel Chair + Panel Member, not the Adviser
    const m = await submitDocument(me, null, 'p_g2', { docType: T.PROPOSAL_MANUSCRIPT, title: 'Complete proposal', ...pdf() })
    expect(lastMail().userIds.sort()).toEqual(['f_alpha', 'f_echo'])
    const panel = viewBundle(user('f_echo'), b('p_g2')).documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT)
    expect(panel.map(d => d.id)).toEqual([m.id])
    expect(viewBundle(user('s_november'), b('p_g2')).documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT).length).toBe(3)
    expect(groupDue(b('p_g2'), resolveContext(user('s_oscar'), b('p_g2'))).filter(t => t.tab === 'documents')).toEqual([])
  })

  it('S5.3 — nothing can be uploaded while the defense is still being scheduled', async () => {
    await at('p_g2', 'PROPOSAL_DEFENSE_SCHEDULING')
    expect(canDo(as('s_november'), 'submitDocument', b('p_g2')).ok).toBe(false)
    await expect(submitDocument(user('s_november'), null, 'p_g2', { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/a' })).rejects.toThrow()
  })

  it('S5.7 / S8.1 — revised manuscripts go to the Adviser only', async () => {
    await at('p_g2', 'PROPOSAL_REVISION')
    await submitDocument(as('s_november'), null, 'p_g2', { docType: T.REVISED_MANUSCRIPT, ...pdf() })
    expect(lastMail()).toMatchObject({ event: 'Revised Manuscript submitted', userIds: ['f_charlie'] })

    await load(buildSeed()) // G3 is at Final Revision
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.REVISED_MANUSCRIPT, ...pdf() })
    expect(lastMail()).toMatchObject({ event: 'Revised Manuscript submitted', userIds: ['f_delta'] })
    expect(worklist(snap(), user('f_delta')).find(r => r.project.id === 'p_g3').tasks.map(t => t.label))
      .toContain('Revised manuscript to verify against the panel’s required revisions')
  })

  it('S6.1 / S6.3 / S6.6 / S6.8 — Implementation: log, drafts, deployment information, export', async () => {
    await at('p_g1', 'IMPLEMENTATION')
    const me = as('s_kilo')
    expect(groupDue(b('p_g1'), resolveContext(user('s_kilo'), b('p_g1'))).map(t => t.label))
      .toEqual(['Upload your manuscript draft', 'Submit the deployment information']) // week 1 log is recent
    await expect(submitWeeklyLog(me, null, 'p_g1', { activities: '  ' })).rejects.toThrow(/Describe/)
    const log = await submitWeeklyLog(me, null, 'p_g1', { activities: 'Built the ordering module.' })
    expect(log).toMatchObject({ weekNo: 2, status: 'Submitted' })
    expect(lastMail()).toMatchObject({ event: 'Weekly log submitted', userIds: ['f_alpha'] })
    await expect(submitWeeklyLog(as('s_lima'), null, 'p_g1', { activities: 'Again' })).rejects.toThrow(/still waiting/)

    as('s_kilo')
    await submitDocument(me, null, 'p_g1', { docType: T.FINAL_MANUSCRIPT, ...pdf() })
    expect(lastMail().userIds).toEqual(['f_alpha']) // Adviser; Instructor 2 does not annotate or decide
    await submitDocument(me, null, 'p_g1', { docType: T.DEPLOYMENT_INFO, ...pdf('deployment.pdf') })
    expect(canDo(user('s_kilo'), 'exportWeeklyLogs', b('p_g1')).ok).toBe(true)
    // The video link is not an Implementation item any more (S7.4 needs a schedule).
    await expect(submitDocument(me, null, 'p_g1', { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/a' })).rejects.toThrow(/not accepted/)
  })

  it('NEW-9 — the weekly log is a Capstone 2 feature: rejected before Implementation', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    await expect(submitWeeklyLog(as('s_kilo'), null, 'p_g1', { activities: 'Consultation' })).rejects.toThrow()
    expect(canDo(user('s_kilo'), 'exportWeeklyLogs', b('p_g1')).ok).toBe(false)
  })

  it('S7.4 — final manuscript + link once the final defense is scheduled; the panel is notified', async () => {
    await at('p_g3', 'FINAL_DEFENSE')
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.PRESENTATION_VIDEO, link: 'https://drive.google.com/file/d/xyz/view' })
    expect(lastMail().userIds.sort()).toEqual(['f_bravo', 'f_foxtrot'])
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, ...pdf() })
    expect(lastMail().userIds.sort()).toEqual(['f_bravo', 'f_foxtrot'])
    await at('p_g3', 'FINAL_DEFENSE_SCHEDULING')
    await expect(submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/a' })).rejects.toThrow()
  })

  it('S9.1 / S9.2 — certificates at clearance, PDF only; no email in §3', async () => {
    await at('p_g3', 'CLEARANCE')
    const before = snap().outbox.length
    await expect(submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.EDITORS_CERTIFICATE, fileName: 'cert.jpg' })).rejects.toThrow(/Only PDF/)
    await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.EDITORS_CERTIFICATE, ...pdf('editor.pdf') })
    await submitDocument(as('s_romeo'), null, 'p_g3', { docType: T.PLAGIARISM_CERTIFICATE, ...pdf('plagiarism.pdf') })
    expect(snap().outbox.length).toBe(before)
    expect(groupDue(b('p_g3'), resolveContext(user('s_quebec'), b('p_g3')))).toEqual([])
  })
})

describe('what the student sees', () => {
  it('the dashboard derives what the group owes at each stage', async () => {
    const due = (pid, uid) => groupDue(b(pid), resolveContext(user(uid), b(pid))).map(t => t.label)
    expect(due('p_g1', 's_kilo')).toEqual([]) // topics are with Instructor 1
    expect(due('p_g4', 's_tango')).toEqual([]) // Group Formation: nothing to submit
    expect(due('p_g2', 's_november')).toEqual([
      'Submit the complete proposal manuscript for the panel', 'Submit the presentation video link',
    ])
    expect(due('p_g3', 's_quebec')).toEqual(['Upload the revised manuscript for the Adviser', 'Revisions due in 3 day(s)'])
    await at('p_g3', 'CLEARANCE')
    expect(due('p_g3', 's_quebec')).toEqual(['Upload the Editor’s Certificate', 'Upload the Plagiarism Clearance Certificate'])
  })

  it('the Adviser is shown to the group after approval (S2.2), the panel after confirmation (S5.1)', async () => {
    await at('p_g1', 'ADVISER_APPROVAL')
    const roles = (uid) => viewBundle(user(uid), b('p_g1')).assignments.map(a => a.roleType)
    expect(roles('s_kilo')).not.toContain(P.ADVISER)
    expect(roles('f_delta')).toContain(P.ADVISER) // the Dean approving sees it
    await at('p_g1', 'PANEL_ASSIGNMENT', { preassign: [P.PANEL_CHAIR, P.PANEL_MEMBER] })
    expect(roles('s_kilo')).toContain(P.ADVISER)
    expect(roles('s_kilo')).not.toContain(P.PANEL_CHAIR)
    await at('p_g1', 'PROPOSAL_DEFENSE_SCHEDULING')
    expect(roles('s_kilo')).toEqual(expect.arrayContaining([P.PANEL_CHAIR, P.PANEL_MEMBER]))
  })

  it('S2.2 — the group gets an "Adviser appointed" email naming the Adviser', async () => {
    await load(scenarioStore('T9'))
    await runGate(as('f_echo'), null, 'p_g1', { action: 'APPROVE_ADVISER' })
    await runGate(as('f_delta'), null, 'p_g1', { action: 'APPROVE_ADVISER' })
    const mail = snap().outbox.find(m => m.event === 'Adviser appointed')
    expect(mail.subject).toContain('Prof. Alpha')
    expect(mail.userIds).toEqual(expect.arrayContaining(['s_kilo', 's_lima', 's_mike', 'f_alpha']))
  })

  it('R12 guard — reviewer annotations yes; panel notes only once released; no AI summary (OQ#2)', async () => {
    await load(scenarioStore('T4'))
    const kilo = user('s_kilo')
    expect(canDo(kilo, 'viewAnnotations', b('p_g1')).ok).toBe(true)
    expect(canDo(kilo, 'viewAiSummary', b('p_g1')).ok).toBe(false)
    expect(viewBundle(kilo, b('p_g1')).aiSummaries).toEqual([])
    const note = b('p_g1').annotations.find(a => a.visibility === 'private')
    expect(canViewAnnotation(kilo, resolveContext(kilo, b('p_g1')), note)).toBe(false)
    expect(canDo(kilo, 'annotate', b('p_g1'), { doc: b('p_g1').documents[0] }).ok).toBe(false)
  })

  it('T4 (student side) — a new private note leaves no trace in the group’s history', async () => {
    await load(scenarioStore('T4'))
    const doc = viewBundle(user('f_charlie'), b('p_g1')).documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT)
    await addAnnotation(as('f_charlie'), null, 'p_g1', doc.id, { text: 'Ask about sampling.' })
    const traced = (uid) => viewBundle(user(uid), b('p_g1')).history.some(h => h.action === 'ANNOTATION_ADDED')
    expect(traced('f_charlie')).toBe(true)
    expect(traced('s_kilo')).toBe(false)
    expect(traced('f_alpha')).toBe(false) // the Adviser
    expect(traced('f_foxtrot')).toBe(false) // the other panelist
  })

  it('T18 — the countdown expires: Overdue flag, task and email for the students', async () => {
    await load(scenarioStore('T18'))
    await flagOverdueRevisions()
    expect(b('p_g3').project.revisionStatus).toBe('Overdue')
    expect(groupDue(b('p_g3'), resolveContext(user('s_quebec'), b('p_g3')))
      .find(t => t.label.startsWith('Revisions overdue'))).toMatchObject({ urgent: true })
    expect(mailTo('Overdue Revision')).toEqual(expect.arrayContaining(['s_quebec', 's_romeo']))
  })

  it('a verdict shows the group the verdict, the remarks and a deadline', async () => {
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: 'Passed with Major Revisions', remarks: 'Redo chapter 3.' })
    const view = viewBundle(user('s_november'), b('p_g2'))
    expect(view.defenses.at(-1)).toMatchObject({ verdict: 'Passed with Major Revisions', remarks: 'Redo chapter 3.', revisionStatus: 'Pending' })
    expect(view.project.revisionDeadline).toBeTruthy()
    expect(mailTo('Revision requested')).toEqual(expect.arrayContaining(['s_november', 's_oscar']))
  })
})

describe('Must NOT (§4 Student "Never")', () => {
  it('T13 — no other group, at any stage, even by pasted id', async () => {
    for (const stage of STAGES.map(s => s.key)) {
      const s = applyStage(buildSeed(), 'p_g2', stage, { roles: SEED_ROLES.p_g2 })
      const snapOf = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Object.values(v)]))
      const kilo = snapOf.users.find(u => u.id === 's_kilo')
      expect(canView(kilo, bundle(snapOf, 'p_g2')), stage).toBe(false)
      expect(viewBundle(kilo, bundle(snapOf, 'p_g2')), stage).toBeNull()
    }
    expect(worklist(snap(), user('s_kilo')).map(r => r.project.id)).toEqual(['p_g1'])
  })

  it('T13 — no approve, sign, verdict, assign or schedule action at any stage', () => {
    const forbidden = [
      'reviewDocument', 'annotate', 'recordVerdict', 'scheduleDefense', 'signWeeklyLog', 'confirmMilestones',
      'manageRoster', 'assignAdviser', 'assignPanel', 'assignInstructor2',
      ...STAGES.flatMap(s => s.gates.map(g => g.action)),
    ]
    for (const s of STAGES) {
      const mine = allowedActions(G.STUDENT, s.key)
      for (const a of forbidden) expect(mine, `${s.key} ${a}`).not.toContain(a)
    }
  })

  it('forced calls are rejected: review, gate, verdict, log signing, group creation', async () => {
    const me = as('s_kilo')
    await expect(submitReview(me, null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'x' })).rejects.toThrow()
    await expect(runGate(me, null, 'p_g1', { action: 'REGISTER_TOPIC' })).rejects.toThrow()
    await expect(recordVerdict(as('s_november'), null, 'p_g2', { verdict: 'Re-defense' })).rejects.toThrow()
    await expect(createProject(as('s_whiskey'), null, { title: 'Our own group', sectionId: 'sec_wd401' })).rejects.toThrow()
  })

  it('there is no edit or delete path for a submitted file', () => {
    const names = Object.keys(actions)
    expect(names.filter(n => /^(delete|remove|edit|update|replace)Document/i.test(n))).toEqual([])
  })

  it('uploads to a stage that is not active are rejected', async () => {
    const tango = as('s_tango') // G4, Group Formation
    await expect(submitDocument(tango, null, 'p_g4', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf() })).rejects.toThrow()
    const kilo = as('s_kilo') // G1, Topic Proposal
    await expect(submitDocument(kilo, null, 'p_g1', { docType: T.REVISED_MANUSCRIPT, ...pdf() })).rejects.toThrow(/not accepted/)
    await expect(submitDocument(kilo, null, 'p_g1', { docType: T.EDITORS_CERTIFICATE, ...pdf() })).rejects.toThrow(/not accepted/)
    await expect(submitWeeklyLog(kilo, null, 'p_g1', { activities: 'x' })).rejects.toThrow()
  })

  it('T14 — the student with no group sees no project anywhere', () => {
    const whiskey = user('s_whiskey')
    expect(worklist(snap(), whiskey)).toEqual([])
    for (const p of snap().projects) expect(canView(whiskey, b(p.id))).toBe(false)
  })
})

describe('two members at once (item 8)', () => {
  it('concurrent uploads land as consecutive versions; a double-click records once', async () => {
    const kilo = as('s_kilo')
    const one = submitDocument(kilo, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf('kilo.pdf') })
    const twice = submitDocument(kilo, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf('kilo.pdf') })
    const lima = as('s_lima')
    const other = submitDocument(lima, null, 'p_g1', { docType: T.TOPIC_PROPOSAL, topics: [...TOPICS].reverse(), ...pdf('lima.pdf') })
    const results = await Promise.allSettled([one, twice, other])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    const versions = b('p_g1').documents.filter(d => d.docType === T.TOPIC_PROPOSAL)
      .sort((x, y) => x.versionNumber - y.versionNumber)
    expect(versions.map(d => [d.versionNumber, d.status])).toEqual([
      [1, DOC_STATUS.SUPERSEDED], [2, DOC_STATUS.SUPERSEDED], [3, DOC_STATUS.SUBMITTED],
    ])
    expect(versions[2].supersedes).toBe(versions[1].id)
    // Every member sees the same versions.
    const ids = (uid) => viewBundle(user(uid), b('p_g1')).documents.map(d => d.id).sort()
    expect(ids('s_kilo')).toEqual(ids('s_mike'))
  })
})
