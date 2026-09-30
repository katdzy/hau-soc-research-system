// Prompt 11 — end-to-end handoff. A fresh group G5 (three newly registered
// students) goes from S0 to S10 through the write path only — no stage
// builder, no scenario loader. After every step the walk records whose turn it
// is (from each persona's worklist), who can open G5 at all, and the emails
// and audit entries the step wrote, then checks them against WORKFLOWS.md §5.
// Set HANDOFF_TRACE=<file> to write the full timeline as JSON.

import { describe, it, expect, beforeAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import {
  registerAccount, verifyEmail, setAccountStatus, createProject, addMember, runGate, assignRole,
  submitDocument, submitReview, addAnnotation, scheduleDefense, recordVerdict, signForm,
  submitWeeklyLog, decideWeeklyLog, confirmMilestones, confirmReadiness, confirmPostDefenseRequirements,
  flagOverdueRevisions, returnToGroup,
} from '../services/actions.js'
import { worklist } from '../services/worklist.js'
import { canDo, viewBundle } from '../domain/guard.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, VERDICTS, FORMS, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const pdf = (name) => ({ fileName: name, fileSize: 120000, fileType: 'application/pdf' })
const ago = (min) => new Date(Date.now() - min * 6e4).toISOString()
const TOPICS = ['Barangay Health Queue', 'Tricycle Fare Estimator', 'Campus Lost-and-Found', 'Thesis Archive Search', 'Org Budget Tracker']

// G5's cast. Prof. Alpha is only the Program Chair/Coordinator here, so the
// NEW-11 visibility rule is tested cleanly; Instructor 2 holds no reviewer hat.
const FACULTY = {
  f_alpha: 'PC', f_bravo: 'I1', f_charlie: 'Adviser', f_delta: 'Dean', f_echo: 'AD',
  f_foxtrot: 'Panel Chair', f_npc_cs3: 'Panel Member (Sy)', f_npc_cs2: 'Panel Member (Enriquez)',
  f_npc_cs0: 'I2 (Uy)', o_uniform: 'URO', a_sierra: 'Admin',
}
const STUDENTS = [
  { name: 'Golf Five', email: 'golf.five@student.hau.edu.ph', idNumber: '2022-0501' },
  { name: 'Hotel Five', email: 'hotel.five@student.hau.edu.ph', idNumber: '2022-0502' },
  { name: 'India Five', email: 'india.five@student.hau.edu.ph', idNumber: '2022-0503' },
]
const PANEL = ['f_foxtrot', 'f_npc_cs3', 'f_npc_cs2']

let pid = null
let S = [] // student ids
const trace = []

const label = (id) => FACULTY[id] ?? snap().users.find(u => u.id === id)?.name ?? id
const personas = () => [...Object.keys(FACULTY), ...S]

/** One persona's view of G5 right now: can they open it, and what do they owe. */
function standing(id) {
  if (!pid) return { visible: false, acts: [], blocked: [], tasks: [] }
  const row = worklist(snap(), user(id)).find(r => r.project.id === pid)
  if (!row) return { visible: false, acts: [], blocked: [], tasks: [] }
  return {
    visible: true,
    acts: row.gates.filter(g => !g.blocker).map(g => g.gate.action),
    blocked: row.gates.filter(g => g.blocker).map(g => `${g.gate.action}: ${g.blocker}`),
    tasks: row.tasks.map(t => t.label),
  }
}

/** Whose turn it is: everyone with an open gate or a task on G5 (the group counts once). */
function turn() {
  const who = new Set()
  for (const id of personas()) {
    const s = standing(id)
    if (s.acts.length || s.tasks.length) who.add(S.includes(id) ? 'Students' : label(id))
  }
  return [...who].sort()
}
/** Gate holders whose gate is still blocked, with the reason the UI shows them. */
const waiting = () => personas().filter(id => !S.includes(id)).flatMap(id => standing(id).blocked.map(b => `${label(id)} — ${b}`))
const visibleTo = () => personas().filter(id => standing(id).visible).map(label)
  .map(n => (STUDENTS.some(s => s.name === n) ? 'Students' : n))
  .filter((n, i, all) => all.indexOf(n) === i).sort()

async function step(id, actorId, what, fn) {
  const outBefore = new Set(snap().outbox.map(m => m.id))
  const auditBefore = new Set(snap().auditLogs.map(a => a.id))
  const stageBefore = pid ? bundle(snap(), pid).project.currentStage : null
  if (actorId) as(actorId)
  const result = await fn(actorId ? user(actorId) : null)
  const stage = pid ? bundle(snap(), pid).project.currentStage : null
  const emails = snap().outbox.filter(m => !outBefore.has(m.id) && (!pid || m.projectId === pid))
    .map(m => ({ event: m.event, to: m.userIds.length ? m.userIds.map(label).map(n => (STUDENTS.some(s => s.name === n) ? 'Students' : n)).filter((n, i, all) => all.indexOf(n) === i) : m.to }))
  const audit = snap().auditLogs.filter(a => !auditBefore.has(a.id) && (!pid || !a.projectId || a.projectId === pid)).map(a => ({ action: a.action, hat: a.hat, actor: label(a.actorId) }))
  const entry = {
    id, actor: actorId ? label(actorId) : 'System', what,
    stage: stageBefore === stage ? stage : `${stageBefore} → ${stage}`,
    emails, audit, nextTurn: turn(), waiting: waiting(), visibleTo: visibleTo(),
    tasks: Object.fromEntries(personas().map(p => [label(p), standing(p).tasks]).filter(([, t]) => t.length)),
  }
  trace.push(entry)
  return result
}

const latest = (docType) => bundle(snap(), pid).documents.filter(d => d.docType === docType)
  .sort((x, y) => y.versionNumber - x.versionNumber)[0]
const studentSees = (docId) => viewBundle(user(S[0]), bundle(snap(), pid)).annotations.filter(a => a.documentId === docId)
const cannotMark = (ids) => ids.filter(id => {
  const b = bundle(snap(), pid)
  const doc = b.documents.find(d => d.status !== DOC_STATUS.SUPERSEDED && d.fileName)
  return canDo(user(id), 'annotate', b, { doc }).ok
})
const OFFICES = ['f_npc_cs0', 'o_uniform', 'f_delta', 'f_echo', 'a_sierra']
const f2004 = () => bundle(snap(), pid).forms.filter(f => f.formType === FORMS.F2004.code).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0]
const approvalSheet = () => bundle(snap(), pid).forms.find(f => f.formType === FORMS.APPROVAL.code && f.status !== 'Void')

/** S3.6 / S4.2 / S6.4 — three annotations on one version: selected words, a marked area, a general note. */
async function annotateThree(reviewer, doc) {
  const me = as(reviewer)
  await addAnnotation(me, null, pid, doc.id, {
    text: 'Cite a source for this claim.', category: 'Documentation Issue',
    position: { kind: 'text', page: 1, rects: [{ x: 0.12, y: 0.3, w: 0.5, h: 0.02 }], quote: 'long queues at the barangay health center' },
  })
  await addAnnotation(me, null, pid, doc.id, {
    text: 'This figure is unreadable — redraw it.', category: 'Technical Concern',
    position: { kind: 'area', page: 2, rects: [{ x: 0.1, y: 0.4, w: 0.6, h: 0.25 }] },
  })
  await addAnnotation(me, null, pid, doc.id, { text: 'Overall: tighten the scope section.', category: 'General Comment' })
}

beforeAll(async () => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
  await db.replaceAll(buildSeed())
  setSessionUserId(null)
})

describe('Prompt 11 — G5 from S0 to S10', () => {
  it('walks every handoff and checks §5 at each step', async () => {
    // --- S0 Accounts -----------------------------------------------------------
    const regs = []
    await step('S0.1', null, 'Three students register (WD-401)', async () => {
      for (const s of STUDENTS) regs.push(await registerAccount(null, { ...s, block: 'WD-401' }))
    })
    S = regs.map(u => u.id)
    expect.soft(trace.at(-1).emails.filter(e => e.event === 'Account verification')).toHaveLength(3)
    expect.soft(regs.every(u => user(u.id).status === 'Inactive')).toBe(true)

    await step('S0.2', null, 'Each student clicks the verification button', async () => {
      for (const u of regs) await verifyEmail(u.verifyToken)
    })
    expect.soft(S.every(id => user(id).emailVerified && user(id).status === 'Inactive')).toBe(true)
    expect.soft(S.every(id => user(id).globalRoles.includes('Student'))).toBe(true)

    await step('S0.3', 'a_sierra', 'Admin Sierra activates the three accounts', async (me) => {
      for (const id of S) await setAccountStatus(me, null, id, 'Active')
    })
    expect.soft(trace.at(-1).audit.map(a => a.action)).toEqual(['ACCOUNT_STATUS_CHANGED', 'ACCOUNT_STATUS_CHANGED', 'ACCOUNT_STATUS_CHANGED'])
    expect.soft(trace.at(-1).emails).toEqual([]) // §3 lists no email for activation

    // --- S1 Group Formation ----------------------------------------------------
    await step('S1.1', 'f_bravo', 'Prof. Bravo creates G5 in WD-401 and adds the three students', async (me) => {
      const p = await createProject(me, null, { title: 'Untitled — Group 5 (WD-401)', sectionId: 'sec_wd401' })
      pid = p.id
      for (const id of S) await addMember(me, null, pid, id)
    })
    expect.soft(trace.at(-1).emails.map(e => e.event)).toEqual(['Added to a group', 'Added to a group', 'Added to a group'])
    expect.soft(trace.at(-1).nextTurn).toEqual(['I1'])
    expect.soft(trace.at(-1).visibleTo).toEqual(['Admin', 'I1', 'Students'])

    await step('S1.2', 'f_bravo', 'Forward the roster to the PC', (me) => runGate(me, null, pid, { action: 'ENDORSE_ROSTER' }))
    // The PC's gate is open to them but waits on their own first move (assign an Adviser).
    expect.soft(trace.at(-1).waiting).toEqual(['PC — ROUTE_ADVISER: Assign an Adviser before routing.'])
    expect.soft(trace.at(-1).visibleTo).toContain('PC')

    // --- S2 Adviser Assignment -------------------------------------------------
    await step('S2.1a', 'f_alpha', 'Assign Prof. Charlie as Adviser', (me) => assignRole(me, null, pid, 'f_charlie', P.ADVISER))
    expect.soft(trace.at(-1).emails).toEqual([]) // the Adviser hears on approval (S2.2)
    expect.soft(standing('f_charlie').visible).toBe(false)
    await step('S2.1b', 'f_alpha', 'Route to the Dean and AD', (me) => runGate(me, null, pid, { action: 'ROUTE_ADVISER' }))
    expect.soft(trace.at(-1).nextTurn).toEqual(['AD', 'Dean'])
    await step('S2.2a', 'f_delta', 'Dean approves', (me) => runGate(me, null, pid, { action: 'APPROVE_ADVISER' }))
    expect.soft(trace.at(-1).nextTurn).toEqual(['AD'])
    expect.soft(cannotMark(OFFICES)).toEqual([])
    await step('S2.2b', 'f_echo', 'AD approves', (me) => runGate(me, null, pid, { action: 'APPROVE_ADVISER' }))
    expect.soft(trace.at(-1).emails.find(e => e.event === 'Adviser appointed').to).toEqual(expect.arrayContaining(['Students', 'Adviser']))
    expect.soft(trace.at(-1).visibleTo).not.toContain('Dean')
    expect.soft(trace.at(-1).visibleTo).not.toContain('PC')

    // --- S3 Conceptualization --------------------------------------------------
    await step('S3.1', S[0], 'Submit five topics (v1)', (me) => submitDocument(me, null, pid, { docType: T.TOPIC_PROPOSAL, topics: TOPICS, ...pdf('topics-v1.pdf') }))
    expect.soft(trace.at(-1).emails[0]).toMatchObject({ event: 'Topic Proposal submitted' })
    expect.soft(trace.at(-1).emails[0].to.sort()).toEqual(['Adviser', 'I1'])
    await step('S3.2', 'f_charlie', 'Adviser requests a revision of the topics', (me) =>
      submitReview(me, null, pid, latest(T.TOPIC_PROPOSAL).id, { decision: DECISIONS.MAJOR, comment: 'Two topics overlap; replace one.' }))
    expect.soft(trace.at(-1).nextTurn).toEqual(['Students'])
    await step('S3.1b', S[1], 'Resubmit topics (v2)', (me) => submitDocument(me, null, pid, { docType: T.TOPIC_PROPOSAL, topics: [...TOPICS.slice(0, 4), 'Clinic Inventory Alerts'], ...pdf('topics-v2.pdf') }))
    await step('S3.3', 'f_bravo', 'I1 approves one topic', (me) =>
      submitReview(me, null, pid, latest(T.TOPIC_PROPOSAL).id, { decision: DECISIONS.APPROVE, approvedTopic: TOPICS[0], comment: '' }))
    expect.soft(trace.at(-1).nextTurn).toEqual(['I1'])
    await step('S3.4', 'f_bravo', 'I1 registers the title', (me) => runGate(me, null, pid, { action: 'REGISTER_TOPIC' }))
    expect.soft(bundle(snap(), pid).project.title).toBe(TOPICS[0])
    expect.soft(trace.at(-1).nextTurn).toEqual(['Students'])

    await step('S3.5', S[2], 'Upload concept paper v1', (me) => submitDocument(me, null, pid, { docType: T.CONCEPT_PAPER, ...pdf('concept-v1.pdf') }))
    const cp1 = latest(T.CONCEPT_PAPER)
    await step('S3.6a', 'f_charlie', 'Adviser annotates concept paper v1 (words, area, general)', () => annotateThree('f_charlie', cp1))
    await step('S3.6b', 'f_bravo', 'I1 annotates too, then returns v1', async (me) => {
      await addAnnotation(me, null, pid, cp1.id, { text: 'Objectives must be measurable.', category: 'Methodology Concern' })
      as('f_bravo')
      await submitReview(user('f_bravo'), null, pid, cp1.id, { decision: DECISIONS.MAJOR, comment: 'Address the annotations.' })
    })
    expect.soft(studentSees(cp1.id)).toHaveLength(4)
    expect.soft(studentSees(cp1.id).map(a => a.position?.kind ?? 'general').sort()).toEqual(['area', 'general', 'general', 'text'])
    await step('S3.6c', S[0], 'Upload concept paper v2', (me) => submitDocument(me, null, pid, { docType: T.CONCEPT_PAPER, ...pdf('concept-v2.pdf') }))
    const cp2 = latest(T.CONCEPT_PAPER)
    expect.soft(bundle(snap(), pid).documents.find(d => d.id === cp1.id).status).toBe(DOC_STATUS.SUPERSEDED)
    expect.soft(studentSees(cp1.id)).toHaveLength(4) // notes stay on the superseded version
    expect.soft(studentSees(cp2.id)).toHaveLength(0) // v2 starts clean
    await step('S3.6d', 'f_bravo', 'I1 approves concept paper v2', (me) => submitReview(me, null, pid, cp2.id, { decision: DECISIONS.APPROVE, comment: '' }))
    expect.soft(trace.at(-1).stage).toBe('TOPIC_PROPOSAL → PROPOSAL_DEVELOPMENT')

    // --- S4 Proposal Development -----------------------------------------------
    await step('S4.1', S[0], 'Upload proposal manuscript v1', (me) => submitDocument(me, null, pid, { docType: T.PROPOSAL_MANUSCRIPT, ...pdf('proposal-v1.pdf') }))
    const pm1 = latest(T.PROPOSAL_MANUSCRIPT)
    await step('S4.2a', 'f_charlie', 'Adviser annotates v1 and returns it', async (me) => {
      await annotateThree('f_charlie', pm1)
      as('f_charlie')
      await submitReview(me, null, pid, pm1.id, { decision: DECISIONS.MAJOR, comment: 'Chapter 3 needs the sampling design.' })
    })
    expect.soft(studentSees(pm1.id)).toHaveLength(3)
    await step('S4.2b', S[1], 'Upload proposal manuscript v2', (me) => submitDocument(me, null, pid, { docType: T.PROPOSAL_MANUSCRIPT, ...pdf('proposal-v2.pdf') }))
    const pm2 = latest(T.PROPOSAL_MANUSCRIPT)
    expect.soft(studentSees(pm1.id)).toHaveLength(3)
    expect.soft(studentSees(pm2.id)).toHaveLength(0)
    await step('S4.2c', 'f_charlie', 'Adviser approves v2', (me) => submitReview(me, null, pid, pm2.id, { decision: DECISIONS.APPROVE, comment: '' }))
    await step('S4.3', 'f_bravo', 'I1 approves the group for the proposal defense', (me) => runGate(me, null, pid, { action: 'APPROVE_FOR_DEFENSE' }))
    expect.soft(trace.at(-1).waiting).toEqual(['PC — CONFIRM_PANEL: A Panel Chair must be assigned.'])
    expect.soft(standing('f_foxtrot').visible).toBe(false) // the panel sees G5 only from S5.1

    // --- S5 Proposal Defense ---------------------------------------------------
    await step('S5.1', 'f_alpha', 'Assign the panel and confirm it', async (me) => {
      await assignRole(me, null, pid, 'f_foxtrot', P.PANEL_CHAIR)
      await assignRole(me, null, pid, 'f_npc_cs3', P.PANEL_MEMBER)
      await assignRole(me, null, pid, 'f_npc_cs2', P.PANEL_MEMBER)
      await runGate(me, null, pid, { action: 'CONFIRM_PANEL' })
    })
    await step('S5.2', 'f_alpha', 'PC publishes the proposal defense schedule (AI summary stub runs here — R12)', (me) =>
      scheduleDefense(me, null, pid, { scheduledAt: ago(60), venue: 'SOC Room 401', instructions: '' }))
    expect.soft(trace.at(-1).emails.find(e => e.event === 'Defense scheduled').to.sort()).toEqual(['Adviser', 'Panel Chair', 'Panel Member (Enriquez)', 'Panel Member (Sy)', 'Students'])
    await step('S5.3', S[2], 'Submit the complete proposal manuscript (v3) and the video link', async (me) => {
      await submitDocument(me, null, pid, { docType: T.PROPOSAL_MANUSCRIPT, ...pdf('proposal-complete.pdf') })
      as(S[2])
      await submitDocument(me, null, pid, { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/g5proposal' })
    })
    const pm3 = latest(T.PROPOSAL_MANUSCRIPT)
    // Before any note, every panelist has the reminder.
    for (const id of PANEL) expect.soft(standing(id).tasks).toContain('No pre-defense notes recorded yet')
    const notes = {}
    for (const id of PANEL) {
      await step('S5.5', id, `${label(id)} adds a private note`, async (me) => {
        notes[id] = await addAnnotation(me, null, pid, pm3.id, { text: `Private question from ${label(id)}`, category: 'Methodology Concern' })
      })
      // The reminder clears only for the author.
      expect.soft(standing(id).tasks).not.toContain('No pre-defense notes recorded yet')
      for (const other of PANEL.filter(o => o !== id && !notes[o])) expect.soft(standing(other).tasks).toContain('No pre-defense notes recorded yet')
    }
    const seesNote = (viewer, note) => viewBundle(user(viewer), bundle(snap(), pid)).annotations.some(a => a.id === note.id)
    for (const author of PANEL) {
      for (const viewer of [...PANEL.filter(v => v !== author), 'f_charlie', ...S]) expect.soft(seesNote(viewer, notes[author])).toBe(false)
      expect.soft(seesNote(author, notes[author])).toBe(true)
    }
    // Panelists see the latest version only.
    expect.soft(viewBundle(user('f_npc_cs3'), bundle(snap(), pid)).documents.filter(d => d.docType === T.PROPOSAL_MANUSCRIPT).map(d => d.versionNumber)).toEqual([3])
    // Only the Chair can record the verdict.
    expect.soft(canDo(user('f_npc_cs3'), 'recordVerdict', bundle(snap(), pid)).ok).toBe(false)
    await step('S5.6', 'f_foxtrot', 'Panel Chair records Minor revisions', (me) =>
      recordVerdict(me, null, pid, { verdict: VERDICTS.MINOR, remarks: 'Clarify the evaluation instrument.' }))
    for (const author of PANEL) {
      for (const s of S) expect.soft(seesNote(s, notes[author])).toBe(true) // released to the students
      for (const v of PANEL.filter(x => x !== author)) expect.soft(seesNote(v, notes[author])).toBe(false)
      expect.soft(seesNote('f_charlie', notes[author])).toBe(false)
    }
    expect.soft(bundle(snap(), pid).annotations.filter(a => a.visibility === 'private').every(a => a.releasedAt)).toBe(true)

    await step('S5.7a', S[0], 'Upload the revised manuscript', (me) => submitDocument(me, null, pid, { docType: T.REVISED_MANUSCRIPT, ...pdf('proposal-revised.pdf') }))
    await step('S5.7b', 'f_charlie', 'Adviser approves the revised manuscript', (me) => submitReview(me, null, pid, latest(T.REVISED_MANUSCRIPT).id, { decision: DECISIONS.APPROVE, comment: '' }))
    await step('S5.7c', 'f_charlie', 'Adviser signs FM-2004', (me) => signForm(me, null, pid, f2004().id))
    for (const id of ['f_npc_cs3', 'f_npc_cs2']) {
      await step('S5.7d', id, `${label(id)} signs FM-2004`, (me) => signForm(me, null, pid, f2004().id))
    }
    // The panel has verified: the countdown stops now (not when I1 routes the group).
    expect.soft(bundle(snap(), pid).project).toMatchObject({ revisionDeadline: null, revisionStatus: null })
    expect.soft(standing(S[0]).tasks.filter(t => t.startsWith('Revisions'))).toEqual([])
    expect.soft(await flagOverdueRevisions(Date.now() + 30 * 864e5).then(() => bundle(snap(), pid).defenses.find(d => d.type === 'Proposal').revisionStatus)).toBe('Completed')
    await step('S5.8a', 'f_alpha', 'PC assigns Prof. Uy as Instructor 2', (me) => assignRole(me, null, pid, 'f_npc_cs0', P.INSTRUCTOR_2))
    await step('S5.8b', 'f_bravo', 'I1 routes the group to Capstone 2', (me) => runGate(me, null, pid, { action: 'CLOSE_PROPOSAL_REVISION' }))
    expect.soft(trace.at(-1).visibleTo).not.toContain('I1') // NEW-6: I1_ACCESS_AFTER_ROUTING = none

    // --- S6 Implementation -----------------------------------------------------
    await step('S6.1', S[0], 'Submit week 1 log', (me) => submitWeeklyLog(me, null, pid, { activities: 'Set up the repository and database schema.' }))
    const log1 = () => bundle(snap(), pid).weeklyLogs.at(-1)
    await step('S6.2a', 'f_charlie', 'Adviser returns week 1', (me) => decideWeeklyLog(me, null, pid, log1().id, { approve: false, remarks: 'List who did what.' }))
    await step('S6.1b', S[1], 'Resubmit week 1', (me) => submitWeeklyLog(me, null, pid, { activities: 'Golf: repo; Hotel: schema; India: wireframes.' }))
    await step('S6.2b', 'f_charlie', 'Adviser approves and signs week 1', (me) => decideWeeklyLog(me, null, pid, log1().id, { approve: true, remarks: '' }))
    await step('S6.1c', S[2], 'Submit week 2', (me) => submitWeeklyLog(me, null, pid, { activities: 'Login and queue screens.' }))
    await step('S6.2c', 'f_charlie', 'Adviser approves and signs week 2', (me) => decideWeeklyLog(me, null, pid, log1().id, { approve: true, remarks: '' }))
    await step('S6.3', S[0], 'Upload manuscript draft (Final Manuscript v1)', (me) => submitDocument(me, null, pid, { docType: T.FINAL_MANUSCRIPT, ...pdf('final-v1.pdf') }))
    const fm1 = latest(T.FINAL_MANUSCRIPT)
    await step('S6.4a', 'f_charlie', 'Adviser annotates v1 and returns it', async (me) => {
      await annotateThree('f_charlie', fm1)
      as('f_charlie')
      await submitReview(me, null, pid, fm1.id, { decision: DECISIONS.MAJOR, comment: 'Add the test results chapter.' })
    })
    expect.soft(canDo(user('f_npc_cs0'), 'annotate', bundle(snap(), pid), { doc: latest(T.FINAL_MANUSCRIPT) }).ok).toBe(false)
    expect.soft(cannotMark(OFFICES)).toEqual([])
    await step('S6.4b', S[1], 'Upload Final Manuscript v2', (me) => submitDocument(me, null, pid, { docType: T.FINAL_MANUSCRIPT, ...pdf('final-v2.pdf') }))
    const fm2 = latest(T.FINAL_MANUSCRIPT)
    expect.soft(studentSees(fm1.id)).toHaveLength(3)
    expect.soft(studentSees(fm2.id)).toHaveLength(0)
    await step('S6.4c', 'f_charlie', 'Adviser approves v2', (me) => submitReview(me, null, pid, fm2.id, { decision: DECISIONS.APPROVE, comment: '' }))
    await step('S6.5', 'f_npc_cs0', 'I2 confirms both milestones and readiness', async (me) => {
      await confirmMilestones(me, null, pid, 'revisedManuscript', '')
      as('f_npc_cs0')
      await confirmMilestones(me, null, pid, 'systemComponents', '')
      as('f_npc_cs0')
      await confirmReadiness(me, null, pid, 'Demo run passed.')
    })
    await step('S6.6', S[2], 'Submit deployment information', (me) => submitDocument(me, null, pid, { docType: T.DEPLOYMENT_INFO, ...pdf('deployment.pdf') }))
    await step('S6.7', 'f_charlie', 'Adviser submits FM-2005', (me) => runGate(me, null, pid, { action: 'RECOMMEND_FINAL_DEFENSE' }))
    expect.soft(trace.at(-1).nextTurn).toContain('PC')

    // --- S7 Final Defense ------------------------------------------------------
    expect.soft(canDo(user('f_npc_cs0'), 'scheduleDefense', bundle(snap(), pid)).ok).toBe(false) // T7
    await step('S7.1', 'f_alpha', 'PC endorses for final defense scheduling (panel kept — SAME_PANEL_BOTH_DEFENSES)', (me) => runGate(me, null, pid, { action: 'ENDORSE_FINAL_DEFENSE' }))
    expect.soft(trace.at(-1).nextTurn).toEqual(['I2 (Uy)'])
    await step('S7.3', 'f_npc_cs0', 'I2 publishes the final defense schedule (AI summary stub — R12)', (me) =>
      scheduleDefense(me, null, pid, { scheduledAt: ago(30), venue: 'SOC AVR', instructions: '' }))
    await step('S7.4', S[0], 'Upload the final manuscript (v3) and video link', async (me) => {
      await submitDocument(me, null, pid, { docType: T.FINAL_MANUSCRIPT, ...pdf('final-complete.pdf') })
      as(S[0])
      await submitDocument(me, null, pid, { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/g5final' })
    })
    const fm3 = latest(T.FINAL_MANUSCRIPT)
    const fnotes = {}
    // The proposal-defense notes do not count for this defense.
    for (const id of PANEL) expect.soft(standing(id).tasks).toContain('No pre-defense notes recorded yet')
    for (const id of PANEL) {
      await step('S7.5', id, `${label(id)} adds a private note`, async (me) => {
        fnotes[id] = await addAnnotation(me, null, pid, fm3.id, { text: `Final-defense note from ${label(id)}`, category: 'Technical Concern' })
      })
      expect.soft(standing(id).tasks).not.toContain('No pre-defense notes recorded yet')
      for (const other of PANEL.filter(o => o !== id && !fnotes[o])) expect.soft(standing(other).tasks).toContain('No pre-defense notes recorded yet')
    }
    expect.soft(cannotMark(OFFICES)).toEqual([])
    for (const author of PANEL) {
      for (const viewer of [...PANEL.filter(v => v !== author), 'f_charlie', ...S]) expect.soft(seesNote(viewer, fnotes[author])).toBe(false)
    }
    await step('S7.6', 'f_foxtrot', 'Panel Chair records Re-defense', (me) =>
      recordVerdict(me, null, pid, { verdict: VERDICTS.REDEFENSE, remarks: 'The queue module does not work end to end.' }))
    for (const author of PANEL) {
      for (const s of S) expect.soft(seesNote(s, fnotes[author])).toBe(true)
      for (const v of PANEL.filter(x => x !== author)) expect.soft(seesNote(v, fnotes[author])).toBe(false)
    }
    // Not post-defense yet: the group must defend again.
    expect.soft(standing('f_npc_cs0').tasks).not.toContain('Confirm the post-defense course requirements')
    expect.soft(canDo(user('f_npc_cs0'), 'confirmPostDefenseRequirements', bundle(snap(), pid)).ok).toBe(false)
    await step('S7.7a', S[1], 'Upload the revised manuscript for the re-defense', (me) => submitDocument(me, null, pid, { docType: T.REVISED_MANUSCRIPT, ...pdf('redefense-revised.pdf') }))
    await step('S7.7b', 'f_charlie', 'Adviser approves it — back to scheduling', (me) => submitReview(me, null, pid, latest(T.REVISED_MANUSCRIPT).id, { decision: DECISIONS.APPROVE, comment: '' }))
    expect.soft(trace.at(-1).stage).toBe('FINAL_REVISION → FINAL_DEFENSE_SCHEDULING')
    await step('S7.7c', 'f_npc_cs0', 'I2 schedules the re-defense', (me) => scheduleDefense(me, null, pid, { scheduledAt: ago(10), venue: 'SOC AVR', instructions: 'Re-defense' }))
    await step('S7.7d', S[2], 'Upload the final manuscript (v4) and a new video link', async (me) => {
      await submitDocument(me, null, pid, { docType: T.FINAL_MANUSCRIPT, ...pdf('final-redefense.pdf') })
      as(S[2])
      await submitDocument(me, null, pid, { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/g5redefense' })
    })
    for (const id of PANEL) expect.soft(standing(id).tasks).toContain('No pre-defense notes recorded yet')
    await step('S7.7e', 'f_foxtrot', 'Panel Chair records Major revisions', (me) =>
      recordVerdict(me, null, pid, { verdict: VERDICTS.MAJOR, remarks: 'Add load-test results; fix the report module.' }))

    // --- S8 Final Revision -----------------------------------------------------
    await step('S8.2', null, 'Countdown expires (overdue job run 15 days ahead)', () => flagOverdueRevisions(Date.now() + 15 * 864e5))
    expect.soft(trace.at(-1).emails.find(e => e.event === 'Overdue Revision').to.sort()).toEqual(['Adviser', 'Students'])
    expect.soft(bundle(snap(), pid).project.revisionStatus).toBe('Overdue')
    await step('S8.1', S[0], 'Upload the (late) revised manuscript', (me) => submitDocument(me, null, pid, { docType: T.REVISED_MANUSCRIPT, ...pdf('final-revised.pdf') }))
    await step('S8.3a', 'f_charlie', 'Adviser approves the revised manuscript', (me) => submitReview(me, null, pid, latest(T.REVISED_MANUSCRIPT).id, { decision: DECISIONS.APPROVE, comment: '' }))
    await step('S8.3b', 'f_charlie', 'Adviser signs FM-2004', (me) => signForm(me, null, pid, f2004().id))
    for (const id of ['f_npc_cs3', 'f_npc_cs2']) {
      await step('S8.4', id, `${label(id)} signs FM-2004`, (me) => signForm(me, null, pid, f2004().id))
    }
    expect.soft(bundle(snap(), pid).project.currentStage).toBe('CLEARANCE')
    await step('S8.5', 'f_npc_cs0', 'I2 confirms the post-defense requirements', (me) => confirmPostDefenseRequirements(me, null, pid, ''))

    // --- S9 Clearance ----------------------------------------------------------
    await step('S9.1', S[0], "Upload the Editor's Certificate", (me) => submitDocument(me, null, pid, { docType: T.EDITORS_CERTIFICATE, ...pdf('editor.pdf') }))
    await step('S9.2', S[1], 'Upload the Plagiarism Clearance Certificate', (me) => submitDocument(me, null, pid, { docType: T.PLAGIARISM_CERTIFICATE, ...pdf('plagiarism.pdf') }))
    await step('S9.3a', 'f_charlie', 'Adviser signs the Approval Sheet', (me) => signForm(me, null, pid, approvalSheet().id))
    for (const id of PANEL) {
      await step('S9.3b', id, `${label(id)} signs the Approval Sheet`, (me) => signForm(me, null, pid, approvalSheet().id))
    }
    await step('S9.3c', 'f_alpha', 'PC endorses and signs', (me) => runGate(me, null, pid, { action: 'ENDORSE_TO_URO' }))
    expect.soft(trace.at(-1).visibleTo).not.toContain('Dean')
    await step('S9.4a', 'o_uniform', 'URO returns the Plagiarism Clearance Certificate', (me) =>
      returnToGroup(me, null, pid, { docTypes: [T.PLAGIARISM_CERTIFICATE], remarks: 'The certificate is for a different title.' }))
    expect.soft(cannotMark(OFFICES)).toEqual([])
    await step('S9.4b', S[2], 'Upload Plagiarism Clearance Certificate v2', (me) => submitDocument(me, null, pid, { docType: T.PLAGIARISM_CERTIFICATE, ...pdf('plagiarism-v2.pdf') }))
    await step('S9.4c', 'o_uniform', 'URO verifies and signs', (me) => runGate(me, null, pid, { action: 'URO_VERIFY' }))
    expect.soft(trace.at(-1).visibleTo).toEqual(expect.arrayContaining(['Dean', 'AD']))
    expect.soft(cannotMark(OFFICES)).toEqual([])
    await step('S9.5a', 'f_delta', 'Dean signs (final approval)', (me) => runGate(me, null, pid, { action: 'FINAL_APPROVE' }))
    await step('S9.5b', 'f_echo', 'AD signs — archived', (me) => runGate(me, null, pid, { action: 'FINAL_APPROVE' }))
    expect.soft(bundle(snap(), pid).project).toMatchObject({ currentStage: 'ARCHIVED', status: 'Archived', archiveResult: 'Pass' })

    // Every state change on G5 wrote an audit entry with a hat.
    const g5Audit = snap().auditLogs.filter(a => a.projectId === pid)
    expect.soft(g5Audit.filter(a => !a.hat)).toEqual([])

    if (process.env.HANDOFF_TRACE) writeFileSync(process.env.HANDOFF_TRACE, JSON.stringify(trace, null, 2))
  })
})
