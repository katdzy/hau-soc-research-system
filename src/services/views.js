// Read-side helpers for the role-context pages. Nothing here writes; every
// list is filtered through CAAC for the user in their current "acting as"
// context, so what a page shows and what the service layer permits agree.

import { bundle } from './core.js'
import { resolveContext, can, projectAccess, allowedDocTypes } from '../domain/caac.js'
import { STAGES, stageIndex, stageLabel, stageByKey } from '../domain/stages.js'
import { canSign, formOf } from '../domain/forms.js'
import { inCapstone1 } from '../domain/contexts.js'
import {
  DOC_STATUS, DOC_TYPES, REVIEWABLE_TYPES, ANNOTATION_STATUS, FORMS, PROJECT_ROLES as P,
} from '../domain/constants.js'

const DAY = 864e5
export const daysUntil = (iso) => Math.ceil((new Date(iso) - Date.now()) / DAY)
export const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / DAY))

/** Projects visible to `me` in the current context, with their resolution. */
export function visibleProjects(snap, me) {
  return (snap.projects ?? [])
    .map(p => bundle(snap, p.id))
    .map(b => ({ b, ctx: resolveContext(me, b), access: projectAccess(me, b) }))
    .filter(r => r.access.visible)
}

/** The student's own group. */
export function myGroup(snap, me) {
  const m = (snap.projectMembers ?? []).find(x => x.userId === me.id)
  return m ? bundle(snap, m.projectId) : null
}

export const latestOf = (b, docType) =>
  b.documents.filter(d => d.docType === docType).sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null

/** The version the group is working on now — the newest reviewable upload. */
export function currentVersion(b) {
  return b.documents
    .filter(d => REVIEWABLE_TYPES.includes(d.docType) && d.status !== DOC_STATUS.SUPERSEDED)
    .sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt))[0] ?? null
}

// --- Progress trail ------------------------------------------------------------

// The nine checkpoints on wireframe S-02, each mapped to the stage that
// completes it. A checkpoint is done once the project has moved past that stage.
const CHECKPOINTS = [
  { label: 'Adviser Assigned', stage: 'ADVISER_APPROVAL' },
  // Ideation is done once a topic is approved; Topic Approved once it is registered.
  {
    label: 'Ideation', stage: 'TOPIC_PROPOSAL',
    done: (b) => b.documents.some(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED),
    approvedAt: (b) => {
      const topics = new Set(b.documents.filter(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL).map(d => d.id))
      return b.reviews.filter(r => topics.has(r.documentId)).at(-1)?.createdAt ?? null
    },
  },
  { label: 'Topic Approved', stage: 'TOPIC_PROPOSAL' },
  { label: 'Proposal Dev', stage: 'PROPOSAL_DEVELOPMENT' },
  { label: 'Proposal Defense', stage: 'PROPOSAL_REVISION' },
  { label: 'Implementation', stage: 'FINAL_DEFENSE_ENDORSEMENT' },
  { label: 'Final Defense', stage: 'FINAL_REVISION' },
  { label: 'URO Clearance', stage: 'URO_VERIFICATION' },
  { label: 'Final Approval', stage: 'FINAL_APPROVAL' },
]

/**
 * The progress trail: every checkpoint with its state and, once reached, the
 * date and the person whose action completed it — taken from WORKFLOW_HISTORY.
 */
export function progressTrail(b, snap) {
  const at = stageIndex(b.project.currentStage)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  let currentMarked = false
  return CHECKPOINTS.map(cp => {
    const idx = stageIndex(cp.stage)
    const done = at > idx || Boolean(cp.done?.(b))
    const leaving = b.history.find(h => h.fromStage === cp.stage)
    let state = done ? 'done' : 'todo'
    if (!done && !currentMarked) { state = 'current'; currentMarked = true }
    // A checkpoint completed by an approval (Ideation) is dated by that approval.
    const approvedAt = cp.done && done ? cp.approvedAt?.(b) : null
    return {
      ...cp, state,
      at: approvedAt ?? (done && at > idx ? leaving?.at ?? null : null),
      by: done && at > idx && leaving ? nameOf(leaving.actorId) : null,
    }
  })
}

/** The checkpoint after the one in progress, e.g. "Proposal Defense" (S-02 chip). */
export function nextGate(b) {
  const trail = progressTrail(b, {})
  const i = trail.findIndex(t => t.state === 'current')
  return i === -1 ? 'Archived' : trail[i + 1]?.label ?? 'Archive'
}

// --- Deadline -------------------------------------------------------------------

/** The next date the group is working toward, with what it is for. */
export function nextDeadline(b) {
  if (b.project.revisionDeadline) {
    return { date: b.project.revisionDeadline, label: `${b.project.revisionClass ?? ''} revisions due`.trim() }
  }
  const upcoming = b.defenses.filter(d => !d.verdict && d.scheduledAt && new Date(d.scheduledAt) > Date.now())
    .sort((x, y) => new Date(x.scheduledAt) - new Date(y.scheduledAt))[0]
  if (upcoming) return { date: upcoming.scheduledAt, label: `${upcoming.type} defense` }
  return null
}

// --- Student checklist ------------------------------------------------------------

/**
 * What the group must do at the current stage, as a checklist. Each item is
 * either the group's own (`yours`) or something they are waiting on, so the
 * list reads as the whole picture rather than a count.
 */
export function studentChecklist(b) {
  const stage = b.project.currentStage
  const items = []
  const add = (label, done, extra = {}) => items.push({ label, done, yours: true, ...extra })
  const wait = (label, done, who) => items.push({ label, done, yours: false, who })
  const has = (t) => Boolean(latestOf(b, t))
  const approved = (t) => latestOf(b, t)?.status === DOC_STATUS.APPROVED

  // Feedback that came back on the current version — always first.
  const returned = b.documents.filter(d => [DOC_STATUS.FOR_REVISION, DOC_STATUS.REJECTED].includes(d.status))
  for (const d of returned) {
    const open = b.annotations.some(a => a.documentId === d.id && a.status === ANNOTATION_STATUS.OPEN && a.visibility === 'shared')
    add(`Address the feedback on ${d.docType} v${d.versionNumber}`, false, {
      detail: open ? 'Add a resolution note to each annotation' : 'Submit the next version', to: `/feedback?v=${d.id}`,
    })
    add(`Submit ${d.docType} v${d.versionNumber + 1}`, false, { to: '/submit' })
  }
  // Approved with minor revisions: the annotations carry into the next version.
  const approvedWithNotes = b.documents.filter(d => d.status === DOC_STATUS.APPROVED &&
    b.annotations.some(a => a.documentId === d.id && a.status === ANNOTATION_STATUS.OPEN && a.visibility === 'shared'))
  for (const d of approvedWithNotes) {
    add(`Address the annotations on ${d.docType} v${d.versionNumber}`, false, {
      detail: 'Approved with minor revisions — add a resolution note to each', to: `/feedback?v=${d.id}`,
    })
  }

  switch (stage) {
    case 'GROUP_FORMATION':
      wait('Instructor 1 forwards your block roster', false, 'Instructor 1'); break
    case 'ADVISER_ASSIGNMENT':
    case 'ADVISER_APPROVAL':
      wait('Adviser assigned and approved', false, 'Program Coordinator, Dean'); break
    case 'TOPIC_PROPOSAL':
      add('Submit your proposed topics (up to five)', has(DOC_TYPES.TOPIC_PROPOSAL), { to: '/submit' })
      wait('One topic approved by Instructor 1', b.documents.some(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED), 'Instructor 1')
      add('Submit the concept paper', has(DOC_TYPES.CONCEPT_PAPER), { to: '/submit' })
      wait('Concept paper approved', approved(DOC_TYPES.CONCEPT_PAPER), 'Instructor 1')
      break
    case 'PROPOSAL_DEVELOPMENT':
      add('Submit the complete proposal manuscript', b.documents.some(d => d.docType === DOC_TYPES.PROPOSAL_MANUSCRIPT && d.scope === 'Complete manuscript'), { to: '/submit' })
      wait('Adviser approves the latest version', approved(DOC_TYPES.PROPOSAL_MANUSCRIPT), 'Adviser')
      wait('Instructor 1 approves you for the proposal defense', false, 'Instructor 1')
      break
    case 'PANEL_ASSIGNMENT':
    case 'PROPOSAL_DEFENSE_SCHEDULING':
      wait('Panel assigned and defense scheduled', false, 'Program Coordinator'); break
    case 'PROPOSAL_DEFENSE':
    case 'FINAL_DEFENSE':
      add('Prepare for your defense', false, { to: '/defense' }); break
    case 'PROPOSAL_REVISION':
    case 'FINAL_REVISION': {
      add('Upload the revised manuscript', has(DOC_TYPES.REVISED_MANUSCRIPT), { to: '/submit' })
      wait('Adviser verifies the revisions', approved(DOC_TYPES.REVISED_MANUSCRIPT), 'Adviser')
      const f = formOf(b, FORMS.F2004.code)
      wait(`Panel signs ${FORMS.F2004.code}`, f?.status === 'Signed', 'Panel')
      break
    }
    case 'IMPLEMENTATION': {
      const lastLog = b.weeklyLogs.at(-1)
      const thisWeek = lastLog && (Date.now() - new Date(lastLog.submittedAt)) < 7 * DAY && lastLog.status !== 'Returned'
      add('Submit this week’s accomplishment log', Boolean(thisWeek), { to: '/logs' })
      add('Upload the final manuscript', has(DOC_TYPES.FINAL_MANUSCRIPT), { to: '/submit' })
      add('Submit the presentation video link', has(DOC_TYPES.PRESENTATION_VIDEO), { to: '/submit' })
      wait(`Adviser submits ${FORMS.F2005.code}`, Boolean(formOf(b, FORMS.F2005.code)), 'Adviser')
      break
    }
    case 'FINAL_DEFENSE_ENDORSEMENT':
    case 'FINAL_DEFENSE_SCHEDULING':
      wait('Final defense endorsed and scheduled', false, 'Program Coordinator, Instructor 2'); break
    case 'CLEARANCE':
      add('Upload the Editor’s Certificate', has(DOC_TYPES.EDITORS_CERTIFICATE), { to: '/final' })
      add('Upload the Plagiarism Clearance Certificate', has(DOC_TYPES.PLAGIARISM_CERTIFICATE), { to: '/final' })
      wait('Approval Sheet signed by the Adviser and panel', false, 'Adviser, Panel')
      break
    case 'URO_VERIFICATION':
      wait('University Research Office verifies your certificates', false, 'URO'); break
    case 'FINAL_APPROVAL':
      wait('Dean and Associate Dean sign the Approval Sheet', false, 'Dean, Associate Dean'); break
    default: break
  }
  return items
}

// --- Review queue (Adviser, Panel, Instructor 1) ----------------------------------

/**
 * Wireframe S-07: everything waiting on this user in the current context —
 * submissions to decide or annotate, weekly logs to sign, revision forms to
 * verify — oldest first.
 */
export function reviewQueue(snap, me) {
  const items = []
  for (const { b, ctx } of visibleProjects(snap, me)) {
    const role = ctx.projectRoles.find(r => r === me.actingAs) ?? ctx.projectRoles[0]
    const base = { b, role, program: b.project.program }
    const reviewable = new Set(allowedDocTypes(b.project.currentStage).filter(t => REVIEWABLE_TYPES.includes(t)))

    if (can(ctx, 'review.decide')) {
      for (const d of b.documents.filter(x => x.status === DOC_STATUS.SUBMITTED && reviewable.has(x.docType))) {
        items.push({ ...base, kind: d.docType === DOC_TYPES.REVISED_MANUSCRIPT ? 'Revision check' : d.docType,
          version: d.versionNumber, at: d.submittedAt, to: `/review/${d.id}`, doc: d })
      }
    } else if (can(ctx, 'document.annotate')) {
      // Panel: the manuscript under evaluation, until they have left notes.
      const d = currentVersion(b)
      if (d && !b.annotations.some(a => a.documentId === d.id && a.authorId === me.id)) {
        items.push({ ...base, kind: `${d.docType} (defense)`, version: d.versionNumber, at: d.submittedAt, to: `/review/${d.id}`, doc: d })
      }
    }
    if (can(ctx, 'weeklylog.sign')) {
      for (const l of b.weeklyLogs.filter(x => x.status === 'Submitted')) {
        items.push({ ...base, kind: 'Weekly log', version: `Week ${l.weekNo}`, at: l.submittedAt, to: `/logs?log=${l.id}` })
      }
    }
    for (const f of b.forms.filter(x => canSign(x, me, b).ok)) {
      items.push({ ...base, kind: `${f.formType} signature`, version: null, at: f.createdAt, to: '/revisions' })
    }
  }
  return items.sort((x, y) => new Date(x.at) - new Date(y.at))
}

/** The gates this user can open now, across their visible projects. */
export function gateRows(snap, me, capabilities) {
  return visibleProjects(snap, me)
    .flatMap(({ b, ctx }) => (stageByKey(b.project.currentStage)?.gates ?? [])
      .filter(g => capabilities.includes(g.capability) && can(ctx, g.capability))
      .map(gate => ({ b, ctx, gate, blocker: gate.requires(b, me) })))
}

export const phaseLabel = (b) => (inCapstone1(b.project) ? 'Capstone 1' : stageIndex(b.project.currentStage) >= stageIndex('CLEARANCE') ? 'Clearance' : 'Capstone 2')
export { stageLabel, STAGES }
export const isAdviserOf = (b, userId) => b.assignments.some(a => a.userId === userId && a.roleType === P.ADVISER)
