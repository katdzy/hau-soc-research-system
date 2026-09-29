// What each signed-in user owes the system right now. Gate actions come from
// the stage machine; the softer tasks (unsigned logs, returned drafts, forms at
// your turn) come from the same project bundle. Nothing here checks a role
// name — every row is the result of CAAC resolution for this user, on this
// project, at this stage.

import { bundle } from './core.js'
import {
  resolveContext, can, why, projectAccess, allowedDocTypes, uploadBlocker, PROJECT_POLICIES,
} from '../domain/caac.js'
import {
  STAGES, stageByKey, stageIndex, openGates, milestoneStatus, readinessBlocker, postDefenseBlocker,
} from '../domain/stages.js'
import { canSign } from '../domain/forms.js'
import {
  DOC_STATUS, DOC_TYPES as T, REVIEWABLE_TYPES, FORMS, TOPIC_COUNT, PROJECT_ROLES as P, CAPSTONE2_MILESTONES,
} from '../domain/constants.js'

const latest = (b, docType) =>
  b.documents.filter(d => d.docType === docType).sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null
const RETURNED = [DOC_STATUS.FOR_REVISION, DOC_STATUS.REJECTED]

// What the group is expected to submit at each stage (§3 student steps) and
// the moment after which a submission counts: a defense's complete manuscript
// and video link must come after the schedule is published (S5.3, S7.4), a
// revised manuscript after the verdict (S5.7, S8.1).
const EXPECTED = {
  TOPIC_PROPOSAL: [
    [T.TOPIC_PROPOSAL, `Submit your ${TOPIC_COUNT} proposed topics`],
    [T.CONCEPT_PAPER, 'Upload the concept paper for your approved topic'],
  ],
  PROPOSAL_DEVELOPMENT: [[T.PROPOSAL_MANUSCRIPT, 'Upload your chapter drafts or proposal manuscript']],
  PROPOSAL_DEFENSE: [
    [T.PROPOSAL_MANUSCRIPT, 'Submit the complete proposal manuscript for the panel', 'defense'],
    [T.PRESENTATION_VIDEO, 'Submit the presentation video link', 'defense'],
  ],
  PROPOSAL_REVISION: [[T.REVISED_MANUSCRIPT, 'Upload the revised manuscript for the Adviser', 'verdict']],
  IMPLEMENTATION: [
    [T.FINAL_MANUSCRIPT, 'Upload your manuscript draft'],
    [T.DEPLOYMENT_INFO, 'Submit the deployment information'],
  ],
  FINAL_DEFENSE: [
    [T.FINAL_MANUSCRIPT, 'Submit the final manuscript for the panel', 'defense'],
    [T.PRESENTATION_VIDEO, 'Submit the presentation video link', 'defense'],
  ],
  FINAL_REVISION: [[T.REVISED_MANUSCRIPT, 'Upload the revised manuscript for the Adviser', 'verdict']],
  CLEARANCE: [
    // Only ever due here after the URO returns the manuscript (NEW-46).
    [T.FINAL_MANUSCRIPT, 'Upload the Final Manuscript'],
    [T.EDITORS_CERTIFICATE, 'Upload the Editor’s Certificate'],
    [T.PLAGIARISM_CERTIFICATE, 'Upload the Plagiarism Clearance Certificate'],
  ],
  // S9.4 return path: only the certificates the URO returned are accepted here.
  URO_VERIFICATION: [
    [T.EDITORS_CERTIFICATE, 'Upload a new Editor’s Certificate'],
    [T.PLAGIARISM_CERTIFICATE, 'Upload a new Plagiarism Clearance Certificate'],
  ],
}

/**
 * What the group owes right now — the student's "what's waiting on you"
 * (§4 Student). Derived from the stage, the documents and the logs; empty when
 * the next move belongs to someone else.
 */
export function groupDue(b, ctx) {
  const stage = b.project.currentStage
  const uploads = can(ctx, 'document.submit')
  const lastDefense = [...b.defenses].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0]
  const since = {
    defense: b.defenses.find(d => !d.verdict)?.createdAt,
    verdict: lastDefense?.recordedAt,
  }
  const due = []
  for (const [docType, label, after] of EXPECTED[stage] ?? []) {
    if (!uploads || !allowedDocTypes(stage, b).includes(docType) || uploadBlocker(b, docType)) continue
    const last = latest(b, docType)
    const fresh = last && (!after || !since[after] || new Date(last.submittedAt) > new Date(since[after]))
    if (fresh && RETURNED.includes(last.status)) {
      due.push({ label: `${docType} v${last.versionNumber} was returned — upload a revised version`, tab: 'documents', urgent: true })
    } else if (!fresh) {
      due.push({ label, tab: 'documents' })
    }
  }
  if (can(ctx, 'weeklylog.submit')) {
    const lastLog = b.weeklyLogs.at(-1)
    if (lastLog?.status === 'Returned') {
      due.push({ label: `Week ${lastLog.weekNo} log was returned — resubmit it`, tab: 'logs', urgent: true })
    } else if (lastLog?.status !== 'Submitted' &&
      (!lastLog || Date.now() - new Date(lastLog.submittedAt) > 6 * 864e5)) {
      due.push({ label: `Submit this week’s log (${FORMS.F2003.code})`, tab: 'logs' })
    }
  }
  if (b.project.revisionDeadline) {
    const left = Math.ceil((new Date(b.project.revisionDeadline) - Date.now()) / 864e5)
    due.push({
      label: left < 0 ? `Revisions overdue by ${Math.abs(left)} day(s)` : `Revisions due in ${left} day(s)`,
      tab: 'defense', urgent: left <= 2,
    })
  }
  return due
}

// Every task carries the role hat it belongs to (`hat`), so a dashboard can
// file it under that hat; office tasks also name their queue.
function pendingTasks(b, ctx, me) {
  const tasks = []
  const hatOf = (cap) => why(ctx, cap)?.role ?? null

  if (can(ctx, 'weeklylog.sign')) {
    const waiting = b.weeklyLogs.filter(l => l.status === 'Submitted')
    if (waiting.length) tasks.push({ label: `${waiting.length} weekly log(s) to approve and sign`, tab: 'logs', hat: hatOf('weeklylog.sign'), kind: 'log', n: waiting.length })
  }
  // Instructor 2: S6.5 milestones, S6.7 readiness (NEW-43), S8.5 post-defense requirements (NEW-44).
  if (can(ctx, 'milestone.confirm')) {
    const open = CAPSTONE2_MILESTONES.filter(m => !milestoneStatus(b.project)[m.key])
    if (open.length) {
      tasks.push({ label: `Confirm the ${open.map(m => m.label.toLowerCase()).join(' and ')} milestone${open.length > 1 ? 's' : ''}`, tab: 'overview', hat: hatOf('milestone.confirm'), kind: 'milestone', n: open.length })
    }
  }
  if (can(ctx, 'readiness.confirm') && !readinessBlocker(b)) {
    tasks.push({ label: 'Confirm, with the Adviser, that the group is ready for final defense', tab: 'overview', hat: hatOf('readiness.confirm'), kind: 'readiness', n: 1 })
  }
  if (can(ctx, 'requirements.confirm') && !postDefenseBlocker(b)) {
    tasks.push({ label: 'Confirm the post-defense course requirements', tab: 'overview', hat: hatOf('requirements.confirm'), kind: 'requirements', n: 1 })
  }
  const relevant = new Set(allowedDocTypes(b.project.currentStage).filter(t => REVIEWABLE_TYPES.includes(t)))
  const waiting = b.documents.filter(d => d.status === DOC_STATUS.SUBMITTED && relevant.has(d.docType))
  if (can(ctx, 'review.decide') && waiting.length) {
    // Revised manuscripts are checked against the panel's required revisions (S5.7, S8.3).
    const revisions = waiting.filter(d => d.docType === T.REVISED_MANUSCRIPT).length
    const drafts = waiting.length - revisions
    if (drafts) tasks.push({ label: `${drafts} submission(s) awaiting your decision`, tab: 'documents', hat: hatOf('review.decide'), kind: 'review', n: drafts })
    if (revisions) tasks.push({ label: 'Revised manuscript to verify against the panel’s required revisions', tab: 'documents', hat: hatOf('review.decide'), kind: 'revision', n: revisions })
  } else if (can(ctx, 'review.return') && waiting.length) {
    tasks.push({ label: `${waiting.length} draft(s) to read — you may return them`, tab: 'documents', hat: hatOf('review.return') })
  }
  if (ctx.isMember && can(ctx, 'document.read')) tasks.push(...groupDue(b, ctx).map(t => ({ ...t, hat: 'Student' })))
  for (const f of b.forms) {
    const sign = canSign(f, me, b)
    if (sign.ok) {
      const label = f.formType === FORMS.F2004.code ? `Verify the revisions and sign ${f.formType}` : `${f.formType} to sign`
      tasks.push({ label, tab: 'forms', hat: sign.line.role, kind: f.formType === FORMS.F2004.code ? 'revision' : 'form', n: 1 })
    }
  }
  // S5.8 / S7.3 need an Instructor 2; assigning one is the Program Chair/Coordinator's (OQ#5).
  if (can(ctx, 'instructor2.assign') && !b.assignments.some(a => a.roleType === P.INSTRUCTOR_2)) {
    tasks.push({ label: 'Assign an Instructor 2', tab: 'overview', hat: hatOf('instructor2.assign'), queue: 'Needs Instructor 2' })
  }

  // Only notes for this defense count: the previous round's notes all predate its verdict.
  if (can(ctx, 'annotation.private') && b.project.currentStage.endsWith('DEFENSE')) {
    const lastVerdictAt = b.defenses.map(d => d.recordedAt).filter(Boolean).sort().at(-1)
    if (!b.annotations.some(a => a.authorId === me.id && (!lastVerdictAt || a.createdAt > lastVerdictAt))) {
      tasks.push({ label: 'No pre-defense notes recorded yet', tab: 'documents', hat: hatOf('annotation.private') })
    }
  }
  return tasks
}

/** One project's worklist row for `me`, or null when the project is not visible to them. */
export function worklistRow(snap, me, p, b = bundle(snap, p.id)) {
  const access = projectAccess(me, b)
  if (!access.visible) return null
  const ctx = resolveContext(me, b)
  const stage = stageByKey(p.currentStage)
  const gates = openGates(stage, b)
    .filter(g => can(ctx, g.capability))
    .map(g => ({ gate: g, blocker: g.requires(b, me), hat: why(ctx, g.capability)?.role ?? null }))
  const tasks = pendingTasks(b, ctx, me)
  return { project: p, bundle: b, ctx, access, gates, tasks, stage }
}

export function worklist(snap, me) {
  if (!me) return []
  return (snap.projects ?? [])
    .map(p => worklistRow(snap, me, p))
    .filter(Boolean)
    .sort((a, b2) => {
      const score = (r) => (r.gates.some(g => !g.blocker) ? 0 : r.tasks.length ? 1 : r.gates.length ? 2 : 3)
      return score(a) - score(b2)
    })
}

export const isActionable = (r) => r.gates.length > 0 || r.tasks.length > 0
export const actionableCount = (rows) => rows.filter(isActionable).length

/**
 * The dashboard queues a user's offices run (§4), in workflow order: one per
 * gate `queue` that a Global Role policy lets them act on, plus "Needs
 * Instructor 2" for whoever assigns Instructor 2. Derived from the policies,
 * so a queue shows (with its empty state) even when nothing is in it.
 */
export function officeQueues(user) {
  const roles = user?.globalRoles ?? []
  const env = (stage) => ({
    stage, isMember: false, projectRoles: [], sections: [],
    user: { programScope: ['*'] }, project: { program: '*' },
  })
  const office = (cap, stage) => PROJECT_POLICIES.find(p =>
    p.dimension === 'Global Role' && roles.includes(p.role) && p.cap === cap && (!stage || p.when.test(env(stage))))
  const queues = []
  for (const s of STAGES) {
    for (const g of s.gates) {
      const pol = g.queue && office(g.capability, s.key)
      if (!pol) continue
      const q = queues.find(x => x.name === g.queue)
      if (q) q.actions.push(g.action)
      else queues.push({ name: g.queue, role: pol.role, actions: [g.action], at: stageIndex(s.key) })
    }
  }
  const i2 = office('instructor2.assign')
  if (i2) queues.push({ name: 'Needs Instructor 2', role: i2.role, actions: [], at: stageIndex('PROPOSAL_REVISION') })
  return queues.sort((a, b) => a.at - b.at)
}
