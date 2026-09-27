// Every state-changing operation in the prototype. Each one:
//   1. authorizes the actor through CAAC (`authorizeOn`) — the same check a
//      Cloud Function runs before committing a write;
//   2. writes the change;
//   3. appends an audit entry;
//   4. notifies whoever the change concerns (email through Resend in the
//      Firebase build, the in-app Notifications list here).

import { db } from '../backend/index.js'
import {
  bundle, authorizeOn, logAudit, notify, assigneeIds, memberIds, latestOf, holdersOf,
} from './core.js'
import {
  DOC_STATUS, DECISIONS, REVISION_WINDOW_DAYS, FORMS, AI_MILESTONES, AI_DISCLOSURE, VERDICTS,
  GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, ACCOUNT_STATUS, LINK_TYPES, accountType,
} from '../domain/constants.js'
import { stageByKey, stageLabel, resolveNext } from '../domain/stages.js'
import {
  resolveContext, resolveInstitution, authorize, allowedDocTypes, can, why,
} from '../domain/caac.js'
import { formOf, canSign } from '../domain/forms.js'

const now = () => new Date().toISOString()
const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString()

/** Active users who hold `cap` on this project in the given state. */
function usersWith(snap, b, cap) {
  return (snap.users ?? [])
    .filter(u => u.status === ACCOUNT_STATUS.ACTIVE && can(resolveContext(u, b), cap))
    .map(u => u.id)
}

async function transition(actor, snap, b, to, action, note) {
  const from = b.project.currentStage
  await db.update('projects', b.project.id, { currentStage: to })
  await db.add('workflowHistory', {
    projectId: b.project.id, fromStage: from, toStage: to,
    actorId: actor.id, action, note, at: now(),
  })
  await logAudit(actor.id, `STAGE_${action}`, 'projects', b.project.id, b.project.id, { from, to })

  // Whoever the new stage involves learns about it — resolved through CAAC
  // against the project as it will be, not from a fixed role list.
  const next = { ...b, project: { ...b.project, currentStage: to } }
  const involved = (stageByKey(to)?.gates ?? []).flatMap(gate => usersWith(snap, next, gate.capability))
  await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER), ...involved].filter(id => id !== actor.id), {
    projectId: b.project.id, type: 'Workflow',
    title: `${b.project.title} moved to ${stageLabel(to)}`,
    body: `${actor.name} completed: ${note}.`,
  })
  return to
}

// --- Group and roster --------------------------------------------------------

export async function createProject(actor, snap, { title, sectionId, researchArea }) {
  const inst = resolveInstitution(actor, snap)
  authorize(inst, 'group.create')
  const section = inst.sections.find(s => s.id === sectionId && s.course === 'Capstone 1')
  if (!section) throw new Error('You can only create groups for a Capstone 1 block you teach.')

  const project = await db.add('projects', {
    title: title || `Untitled — ${section.block}`,
    previousTitles: [], category: 'Capstone', researchArea: researchArea || 'Not yet set',
    program: section.program, term: section.term, block: section.block, sectionId: section.id,
    currentStage: 'GROUP_FORMATION', status: 'Active', archiveResult: null,
    revisionClass: null, revisionDeadline: null, milestonesConfirmedAt: null, milestonesConfirmedBy: null,
  })
  // The section instructor becomes Instructor 1 on the new project.
  await db.add('projectAssignments', {
    projectId: project.id, userId: actor.id, roleType: P.INSTRUCTOR_1,
    status: 'Accepted', assignedAt: now(),
  })
  await db.add('workflowHistory', {
    projectId: project.id, fromStage: null, toStage: 'GROUP_FORMATION',
    actorId: actor.id, action: 'GROUP_CREATED', note: 'Group created', at: now(),
  })
  await logAudit(actor.id, 'PROJECT_CREATED', 'projects', project.id, project.id, { title, block: section.block })
  return project
}

export async function addMember(actor, snap, projectId, userId) {
  const { b } = authorizeOn(actor, snap, projectId, 'roster.manage')
  const student = (snap.users ?? []).find(u => u.id === userId)
  if (!student || !(student.globalRoles ?? []).includes(G.STUDENT)) throw new Error('Only student accounts can join a group.')
  if (student.block !== b.project.block) throw new Error(`That student is not in block ${b.project.block}.`)
  if ((snap.projectMembers ?? []).some(m => m.userId === userId)) throw new Error('That student is already in a group.')

  const row = await db.add('projectMembers', { projectId, userId, joinedAt: now() })
  await logAudit(actor.id, 'MEMBER_ADDED', 'projectMembers', row.id, projectId, { userId })
  await notify([userId], {
    projectId, type: 'Group membership',
    title: 'You were added to a project group',
    body: `${actor.name} added you to ${b.project.title}.`,
  })
  return row
}

export async function removeMember(actor, snap, projectId, memberRowId, userId) {
  authorizeOn(actor, snap, projectId, 'roster.manage')
  await db.remove('projectMembers', memberRowId)
  await logAudit(actor.id, 'MEMBER_REMOVED', 'projectMembers', memberRowId, projectId, { userId })
}

// Which capability lets someone hand out each Project-Based Role.
export const ASSIGNING_CAPABILITY = {
  [P.ADVISER]: 'adviser.assign',
  [P.PANEL_CHAIR]: 'panel.assign',
  [P.PANEL_MEMBER]: 'panel.assign',
  [P.INSTRUCTOR_2]: 'instructor2.assign',
}

/** Returns a reason the assignment would break a rule, or null. */
export function assignmentConflict(b, userId, roleType) {
  const holds = (role) => b.assignments.some(a => a.userId === userId && a.roleType === role)
  if (PANEL_ROLES.includes(roleType) && holds(P.ADVISER)) return 'Adviser on this project — cannot sit on its panel'
  if (roleType === P.ADVISER && PANEL_ROLES.some(holds)) return 'On this project’s panel — cannot also advise it'
  if (PANEL_ROLES.includes(roleType) && PANEL_ROLES.some(holds)) return 'Already on this panel'
  if (holds(roleType)) return `Already ${roleType}`
  return null
}

export async function assignRole(actor, snap, projectId, userId, roleType) {
  const cap = ASSIGNING_CAPABILITY[roleType]
  if (!cap) throw new Error(`${roleType} is not assigned from here.`)
  const { b } = authorizeOn(actor, snap, projectId, cap)

  const target = (snap.users ?? []).find(u => u.id === userId)
  if (!target || accountType(target.email) !== 'Faculty') throw new Error('Project roles go to faculty accounts only.')
  const conflict = assignmentConflict(b, userId, roleType)
  if (conflict) throw new Error(conflict + '.')
  const single = [P.ADVISER, P.PANEL_CHAIR, P.INSTRUCTOR_2]
  if (single.includes(roleType) && b.assignments.some(a => a.roleType === roleType)) {
    throw new Error(`This project already has a ${roleType}. Unassign them first.`)
  }

  const row = await db.add('projectAssignments', {
    projectId, userId, roleType, status: 'Accepted', assignedAt: now(), assignedBy: actor.id,
  })
  await logAudit(actor.id, 'ROLE_ASSIGNED', 'projectAssignments', row.id, projectId, { userId, roleType })
  await notify([userId], {
    projectId, type: 'New assignment',
    title: `You were assigned as ${roleType}`,
    body: `${b.project.title}. What you can do on it now depends on this role and on the stage the project is in.`,
  })
  return row
}

export async function unassignRole(actor, snap, projectId, assignment) {
  const cap = ASSIGNING_CAPABILITY[assignment.roleType]
  if (!cap) throw new Error(`${assignment.roleType} is not unassigned from here.`)
  authorizeOn(actor, snap, projectId, cap)
  await db.remove('projectAssignments', assignment.id)
  await logAudit(actor.id, 'ROLE_UNASSIGNED', 'projectAssignments', assignment.id, projectId, {
    userId: assignment.userId, roleType: assignment.roleType,
  })
}

// --- Documents ---------------------------------------------------------------

/**
 * Submissions are immutable. A new upload never overwrites the previous file;
 * it creates a new version and marks its predecessor Superseded.
 */
export async function submitDocument(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'document.submit')
  if (!allowedDocTypes(b.project.currentStage).includes(input.docType)) {
    throw new Error(`${input.docType} is not accepted at ${stageLabel(b.project.currentStage)}.`)
  }
  const isLink = LINK_TYPES.includes(input.docType)
  if (isLink && !/^https?:\/\/\S+$/i.test(input.link ?? '')) throw new Error('Enter the full link to the hosted video.')
  if (!isLink && input.fileName && !/\.pdf$/i.test(input.fileName)) throw new Error('Only PDF files can be submitted.')

  const previous = latestOf(b, input.docType)
  const version = previous ? previous.versionNumber + 1 : 1
  const doc = await db.add('documents', {
    projectId, docType: input.docType, versionNumber: version,
    title: input.title || `${input.docType} v${version}`,
    fileName: isLink ? null : (input.fileName || `${input.docType.toLowerCase().replace(/\W+/g, '-')}-v${version}.pdf`),
    fileSize: isLink ? null : (input.fileSize ?? 0),
    link: isLink ? input.link : null,
    abstract: input.abstract ?? '',
    submittedBy: actor.id, submittedAt: now(),
    status: DOC_STATUS.SUBMITTED,
    workflowStage: b.project.currentStage,
    milestone: null,
    supersedes: previous?.id ?? null,
  })
  if (previous && previous.status !== DOC_STATUS.ARCHIVED) {
    await db.update('documents', previous.id, { status: DOC_STATUS.SUPERSEDED })
  }
  await logAudit(actor.id, 'DOCUMENT_SUBMITTED', 'documents', doc.id, projectId, { docType: input.docType, version })

  const reviewers = [
    ...usersWith(snap, b, 'review.decide'),
    ...usersWith(snap, b, 'document.annotate'),
  ].filter(id => id !== actor.id)
  await notify(reviewers, {
    projectId, type: 'Submission',
    title: `${input.docType} v${version} submitted`,
    body: `${actor.name} submitted a new version for ${b.project.title}.`,
  })
  return doc
}

export async function addAnnotation(actor, snap, projectId, documentId, input) {
  const { ctx } = authorizeOn(actor, snap, projectId, 'document.annotate')
  const isPrivate = can(ctx, 'annotation.private')
  const row = await db.add('annotations', {
    projectId, documentId, authorId: actor.id, authorRole: why(ctx, 'document.annotate').role,
    anchor: input.anchor || 'General', category: input.category, text: input.text,
    visibility: isPrivate ? 'private' : 'shared',
    // Private panel notes are released when the Panel Chair records the verdict.
    releasedAt: null,
    createdAt: now(),
  })
  await logAudit(actor.id, 'ANNOTATION_ADDED', 'annotations', row.id, projectId, {
    documentId, visibility: row.visibility,
  })
  return row
}

/** A review decision changes the version's status only — never the file. */
export async function submitReview(actor, snap, projectId, documentId, input) {
  const { b, ctx } = authorizeOn(actor, snap, projectId, 'review.decide')
  const doc = b.documents.find(d => d.id === documentId)
  if (!doc || [DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)) {
    throw new Error('Only the current version can be reviewed.')
  }
  const row = await db.add('reviews', {
    projectId, documentId, reviewerId: actor.id, reviewerRole: why(ctx, 'review.decide').role,
    decision: input.decision, comment: input.comment ?? '', createdAt: now(),
  })
  const statusFor = {
    [DECISIONS.APPROVE]: DOC_STATUS.APPROVED,
    [DECISIONS.MINOR]: DOC_STATUS.APPROVED,
    [DECISIONS.ENDORSE]: DOC_STATUS.APPROVED,
    [DECISIONS.MAJOR]: DOC_STATUS.FOR_REVISION,
    [DECISIONS.REJECT]: DOC_STATUS.REJECTED,
  }
  await db.update('documents', documentId, { status: statusFor[input.decision] })
  await logAudit(actor.id, 'REVIEW_DECISION', 'reviews', row.id, projectId, { documentId, decision: input.decision })
  await notify(memberIds(b), {
    projectId, type: 'Review completed',
    title: `${doc.docType} v${doc.versionNumber}: ${input.decision}`,
    body: `${actor.name} reviewed your submission. ${input.comment ?? ''}`.trim(),
  })
  return row
}

/**
 * Gemini Flash summary of the complete manuscript, generated by the system at
 * the proposal and final defense milestones only — never on request, never per
 * draft. The external call is stubbed; the audit entry records the transmission.
 */
async function summarizeForMilestone(actor, b, defenseType) {
  const { milestone, docType } = AI_MILESTONES[defenseType]
  const doc = latestOf(b, docType)
  if (!doc || b.aiSummaries.some(s => s.documentId === doc.id)) return null
  await db.update('documents', doc.id, { milestone })
  const row = await db.add('aiSummaries', {
    projectId: b.project.id, documentId: doc.id, documentVersion: doc.versionNumber,
    milestone, generatedAt: now(),
    model: 'Gemini Flash (paid tier) — stubbed in the prototype',
    label: AI_DISCLOSURE,
    structured: {
      background: doc.abstract || 'Not extracted — the prototype does not parse PDF content.',
      problemStatement: 'Stub output. The Cloud Function sends only the uploaded PDF text and forbids outside information.',
      objectives: 'Stub output.', methodology: 'Stub output.', expectedOutput: 'Stub output.',
      scope: 'Stub output.', limitations: 'Stub output.', contributions: 'Stub output.',
    },
  })
  await logAudit(actor.id, 'AI_SUMMARY_GENERATED', 'aiSummaries', row.id, b.project.id, {
    documentId: doc.id, milestone, transmittedTo: 'Gemini Flash API (paid tier)',
  })
  return row
}

// --- Weekly logs (FM-AAC-SOC-2003) ---------------------------------------------

export async function submitWeeklyLog(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'weeklylog.submit')
  const last = b.weeklyLogs.at(-1)
  // A returned log is resubmitted under the same week number.
  const weekNo = last?.status === 'Returned' ? last.weekNo : (last?.weekNo ?? 0) + 1
  const row = await db.add('weeklyLogs', {
    projectId, weekNo, periodStart: addDays(-7), periodEnd: now(),
    submittedBy: actor.id, submittedAt: now(), activities: input.activities,
    status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
  })
  await logAudit(actor.id, 'WEEKLY_LOG_SUBMITTED', 'weeklyLogs', row.id, projectId, { weekNo })
  await notify(assigneeIds(b, P.ADVISER), {
    projectId, type: 'Weekly log',
    title: `Week ${weekNo} log awaiting your review`,
    body: `${actor.name} submitted the week ${weekNo} log for ${b.project.title}.`,
  })
  return row
}

export async function decideWeeklyLog(actor, snap, projectId, logId, { approve, remarks }) {
  const { b } = authorizeOn(actor, snap, projectId, 'weeklylog.sign')
  const row = await db.update('weeklyLogs', logId, approve
    ? { status: 'Approved', signedBy: actor.id, signedAt: now(), adviserRemarks: remarks ?? '' }
    : { status: 'Returned', adviserRemarks: remarks ?? '' })
  await logAudit(actor.id, approve ? 'WEEKLY_LOG_SIGNED' : 'WEEKLY_LOG_RETURNED', 'weeklyLogs', logId, projectId, {
    form: FORMS.F2003.code,
  })
  await notify(memberIds(b), {
    projectId, type: 'Weekly log',
    title: approve ? 'Your weekly log was approved and signed' : 'Your weekly log was returned',
    body: approve
      ? `${actor.name} signed your ${FORMS.F2003.code} entry.`
      : `${actor.name} returned your log. ${remarks ?? ''}`.trim(),
  })
  return row
}

export async function confirmMilestones(actor, snap, projectId, note) {
  const { b } = authorizeOn(actor, snap, projectId, 'milestone.confirm')
  await db.update('projects', projectId, {
    milestonesConfirmedAt: now(), milestonesConfirmedBy: actor.id, milestonesNote: note ?? '',
  })
  await logAudit(actor.id, 'MILESTONES_CONFIRMED', 'projects', projectId, projectId, {})
  await notify([...assigneeIds(b, P.ADVISER), ...memberIds(b)], {
    projectId, type: 'Milestones',
    title: 'Capstone 2 milestones confirmed',
    body: `${actor.name} confirmed the implementation milestones for ${b.project.title}.`,
  })
}

// --- Defense, verdict, revision ----------------------------------------------

const DEFENSE_TYPE_AT = {
  PROPOSAL_DEFENSE_SCHEDULING: 'Proposal', PROPOSAL_DEFENSE: 'Proposal',
  FINAL_DEFENSE_SCHEDULING: 'Final', FINAL_DEFENSE: 'Final',
}
export const defenseTypeAt = (stage) => DEFENSE_TYPE_AT[stage] ?? null

/** Publishing the schedule is the gate out of a *_DEFENSE_SCHEDULING stage. */
export async function scheduleDefense(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'defense.schedule')
  const type = defenseTypeAt(b.project.currentStage)
  const gate = stageByKey(b.project.currentStage).gates[0]
  const blocked = gate.requires(b, actor)
  if (blocked) throw new Error(blocked)

  const row = await db.add('defenses', {
    projectId, type, scheduledAt: input.scheduledAt, venue: input.venue, instructions: input.instructions ?? '',
    createdBy: actor.id, createdAt: now(),
    verdict: null, revisionClass: null, revisionDeadline: null, revisionStatus: null,
    recordedBy: null, recordedAt: null, remarks: '',
  })
  await logAudit(actor.id, 'DEFENSE_SCHEDULED', 'defenses', row.id, projectId, { type })
  await summarizeForMilestone(actor, b, type)
  await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER), ...PANEL_ROLES.flatMap(r => assigneeIds(b, r))], {
    projectId, type: 'Defense scheduled',
    title: `${type} defense scheduled — ${b.project.title}`,
    body: `${new Date(input.scheduledAt).toLocaleString()} · ${input.venue}. ${input.instructions ?? ''}`.trim(),
  })
  await transition(actor, snap, b, resolveNext(gate, b), gate.action, gate.label)
  return row
}

/** Panel Chair only. Recording the verdict sets the next stage and starts the countdown. */
export async function recordVerdict(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'verdict.record')
  const type = defenseTypeAt(b.project.currentStage)
  const defense = b.defenses.find(d => d.type === type && !d.verdict)
  if (!defense) throw new Error('There is no open defense to record a verdict for.')

  const revisionClass = input.verdict === VERDICTS.MAJOR ? 'Major' : input.verdict === VERDICTS.MINOR ? 'Minor' : null
  const deadline = revisionClass ? addDays(REVISION_WINDOW_DAYS[revisionClass]) : null

  await db.update('defenses', defense.id, {
    verdict: input.verdict, revisionClass, revisionDeadline: deadline,
    revisionStatus: revisionClass ? 'Pending' : null,
    recordedBy: actor.id, recordedAt: now(), remarks: input.remarks ?? '',
  })
  await db.update('projects', projectId, { revisionClass, revisionDeadline: deadline })

  // The defense is over: private panel annotations are released to the group.
  for (const a of b.annotations.filter(x => x.visibility === 'private' && !x.releasedAt)) {
    await db.update('annotations', a.id, { releasedAt: now() })
  }

  let form = null
  if (revisionClass) {
    const panel = (role, order) => assigneeIds(b, role).map(id => ({
      order, role, userId: id, name: null, signedAt: null,
    }))
    form = await db.add('forms', {
      projectId, formType: FORMS.F2004.code, name: FORMS.F2004.name,
      status: 'Circulating', createdAt: now(),
      stage: type === 'Proposal' ? 'PROPOSAL_REVISION' : 'FINAL_REVISION',
      payload: { verdict: input.verdict, revisionClass, remarks: input.remarks ?? '', defenseType: type, defenseId: defense.id },
      // Panel Chair submits; the Adviser verifies revisions first; then the Panel Members.
      signatories: [
        { order: 1, role: P.PANEL_CHAIR, userId: actor.id, name: actor.name, signedAt: now() },
        ...panel(P.ADVISER, 2),
        ...panel(P.PANEL_MEMBER, 3),
      ],
    })
  }

  await logAudit(actor.id, 'VERDICT_RECORDED', 'defenses', defense.id, projectId, {
    verdict: input.verdict, revisionClass, form: form?.id ?? null,
  })
  await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER)], {
    projectId, type: revisionClass ? 'Revision request' : 'Re-defense',
    title: `${type} defense verdict: ${input.verdict}`,
    body: deadline
      ? `Revisions are due ${new Date(deadline).toLocaleDateString()}. ${input.remarks ?? ''}`.trim()
      : `A re-defense will be scheduled. ${input.remarks ?? ''}`.trim(),
  })

  const gate = stageByKey(b.project.currentStage).gates[0]
  const fresh = bundle({ ...snap, defenses: (snap.defenses ?? []).map(d => d.id === defense.id ? { ...d, verdict: input.verdict } : d) }, projectId)
  await transition(actor, snap, b, resolveNext(gate, fresh), gate.action, `Recorded verdict: ${input.verdict}`)
}

// --- Forms and signatures -----------------------------------------------------

function approvalSheetSignatories(b, snap) {
  const line = (order, role, userId, viaGate = false) => ({ order, role, userId, name: null, signedAt: null, viaGate })
  const coordinator = holdersOf(snap, G.COORDINATOR).find(u => (u.programScope ?? []).includes(b.project.program))
  return [
    ...assigneeIds(b, P.ADVISER).map(id => line(1, P.ADVISER, id)),
    ...assigneeIds(b, P.PANEL_CHAIR).map(id => line(2, P.PANEL_CHAIR, id)),
    ...assigneeIds(b, P.PANEL_MEMBER).map(id => line(2, P.PANEL_MEMBER, id)),
    line(3, G.COORDINATOR, coordinator?.id ?? null, true),
    line(4, G.URO, holdersOf(snap, G.URO)[0]?.id ?? null, true),
    line(5, G.DEAN, holdersOf(snap, G.DEAN)[0]?.id ?? null, true),
    line(5, G.ASSOCIATE_DEAN, holdersOf(snap, G.ASSOCIATE_DEAN)[0]?.id ?? null, true),
  ]
}

async function issueApprovalSheet(actor, snap, b) {
  const signatories = approvalSheetSignatories(b, snap)
  const form = await db.add('forms', {
    projectId: b.project.id, formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
    status: 'Circulating', createdAt: now(), stage: 'CLEARANCE', payload: {}, signatories,
  })
  await logAudit(actor.id, 'FORM_ISSUED', 'forms', form.id, b.project.id, { formType: FORMS.APPROVAL.code })
  await notify(signatories.filter(s => s.order === 1).map(s => s.userId), {
    projectId: b.project.id, type: 'Signature request',
    title: 'Approval Sheet ready for your signature',
    body: `${b.project.title} has cleared post-defense revisions.`,
  })
  return form
}

async function writeSignature(actor, form, lineMatch) {
  let signedRole = null
  const signatories = form.signatories.map(s => {
    if (signedRole || s.signedAt || !lineMatch(s)) return s
    signedRole = s.role
    return { ...s, userId: actor.id, name: actor.name, signedAt: now() }
  })
  if (!signedRole) throw new Error('You have no pending line on this form.')
  const complete = signatories.every(s => s.signedAt)
  await db.update('forms', form.id, { signatories, status: complete ? 'Signed' : 'Circulating' })
  await logAudit(actor.id, 'SIGNATURE_APPLIED', 'forms', form.id, form.projectId, { formType: form.formType, role: signedRole })

  const open = signatories.filter(s => !s.signedAt)
  const nextOrder = open.length ? Math.min(...open.map(s => s.order)) : null
  const nextSigners = open.filter(s => s.order === nextOrder && !s.viaGate).map(s => s.userId)
  if (nextSigners.length) {
    await notify(nextSigners, {
      projectId: form.projectId, type: 'Signature request',
      title: `${form.formType} is ready for your signature`,
      body: `${actor.name} signed as ${signedRole}.`,
    })
  }
  return { signatories, complete }
}

/** Traceable digital signature: signatory, role, timestamp and form. */
export async function signForm(actor, snap, projectId, formId) {
  const form = await db.get('forms', formId) // read fresh — another signature may have landed
  if (!form) throw new Error('Form not found')
  const b = bundle(snap, projectId)
  const check = canSign(form, actor, b)
  if (!check.ok) throw new Error(check.reason ?? 'You have no pending line on this form.')
  return writeSignature(actor, form, s => s.userId === actor.id && s.order === check.line.order)
}

// --- Stage gates ---------------------------------------------------------------

export async function runGate(actor, snap, projectId, gate) {
  const { b, ctx } = authorizeOn(actor, snap, projectId, gate.capability)
  if (gate.handledIn) throw new Error('This step is completed from the Defense tab.')
  const blocked = gate.requires(b, actor)
  if (blocked) throw new Error(blocked)

  const patch = {}
  const role = why(ctx, gate.capability).role

  if (gate.action === 'REGISTER_TOPIC') {
    const topic = b.documents.find(d => d.docType === 'Topic Proposal' && d.status === DOC_STATUS.APPROVED)
    patch.title = topic.title.replace(/^Proposed Topic:\s*/i, '')
    patch.previousTitles = [...(b.project.previousTitles ?? []), b.project.title]
  }

  if (gate.action === 'CLOSE_PROPOSAL_REVISION' || gate.action === 'CLOSE_FINAL_REVISION') {
    const type = gate.action === 'CLOSE_PROPOSAL_REVISION' ? 'Proposal' : 'Final'
    for (const d of b.defenses.filter(x => x.type === type && x.revisionStatus === 'Pending')) {
      await db.update('defenses', d.id, { revisionStatus: 'Completed' })
    }
    patch.revisionClass = null
    patch.revisionDeadline = null
    if (type === 'Final') await issueApprovalSheet(actor, snap, b)
  }

  if (gate.action === 'RECOMMEND_FINAL_DEFENSE') {
    const form = await db.add('forms', {
      projectId, formType: FORMS.F2005.code, name: FORMS.F2005.name,
      status: 'Signed', createdAt: now(), stage: null, payload: {},
      signatories: [{ order: 1, role: P.ADVISER, userId: actor.id, name: actor.name, signedAt: now() }],
    })
    await logAudit(actor.id, 'FORM_SUBMITTED', 'forms', form.id, projectId, { formType: FORMS.F2005.code })
  }

  // Gates that carry a signature sign the actor's office line on the form.
  if (gate.signs) {
    const form = await db.get('forms', formOf(b, gate.signs)?.id)
    if (!form) throw new Error(`The ${gate.signs} has not been issued.`)
    const { complete } = await writeSignature(actor, form, s => s.viaGate && s.role === role)

    if (gate.action === 'FINAL_APPROVE' && !complete) {
      // The other executive still has to sign; the project stays here.
      await logAudit(actor.id, 'FINAL_APPROVAL_SIGNED', 'projects', projectId, projectId, { role })
      const other = form.signatories.filter(s => s.order === 5 && s.role !== role).map(s => s.userId)
      await notify(other, {
        projectId, type: 'Signature request',
        title: `${b.project.title} awaits your final approval`,
        body: `${actor.name} signed the Approval Sheet as ${role}.`,
      })
      return b.project.currentStage
    }
  }

  if (gate.action === 'FINAL_APPROVE') {
    patch.archiveResult = 'Pass'
    patch.status = 'Archived'
    patch.archivedAt = now()
    for (const d of b.documents) {
      if (d.status !== DOC_STATUS.SUPERSEDED) await db.update('documents', d.id, { status: DOC_STATUS.ARCHIVED })
    }
  }

  if (Object.keys(patch).length) await db.update('projects', projectId, patch)
  return transition(actor, snap, b, resolveNext(gate, b), gate.action, gate.label)
}

// --- Accounts ------------------------------------------------------------------

/**
 * Domain-restricted registration (Firebase Authentication in production).
 * The account stays Inactive until the owner clicks the approval button in the
 * verification email. No OTP.
 */
export async function registerAccount(snap, input) {
  const email = input.email.trim().toLowerCase()
  const type = accountType(email)
  if (!type) throw new Error('Registration is restricted to @hau.edu.ph and @student.hau.edu.ph addresses.')
  if ((snap.users ?? []).some(u => u.email.toLowerCase() === email)) {
    throw new Error('That address already has an account. Sign in instead.')
  }
  const user = await db.add('users', {
    name: input.name.trim(), email, idNumber: input.idNumber?.trim() ?? '',
    program: input.program ?? '', yearLevel: type === 'Student' ? input.yearLevel ?? '' : '',
    block: type === 'Student' ? input.block ?? '' : '',
    status: ACCOUNT_STATUS.INACTIVE, emailVerified: false, globalRoles: [], programScope: [],
  })
  await logAudit(user.id, 'ACCOUNT_REGISTERED', 'users', user.id, null, { email })
  return user
}

/** The approval button in the verification email. authTriggers.js assigns the initial role. */
export async function verifyEmail(userId) {
  const user = await db.get('users', userId)
  if (!user) throw new Error('Account not found')
  const globalRoles = accountType(user.email) === 'Student' ? [G.STUDENT] : []
  await db.update('users', userId, { emailVerified: true, status: ACCOUNT_STATUS.ACTIVE, globalRoles })
  await logAudit(userId, 'EMAIL_VERIFIED', 'users', userId, null, { globalRoles })
}

export async function setGlobalRoles(actor, snap, userId, globalRoles) {
  authorize(resolveInstitution(actor, snap), 'admin.accounts')
  const user = (snap.users ?? []).find(u => u.id === userId)
  const type = accountType(user.email)
  if (globalRoles.includes(G.STUDENT) && type !== 'Student') throw new Error('Only student accounts can hold the Student role.')
  if (type === 'Student' && globalRoles.some(r => r !== G.STUDENT)) throw new Error('Student accounts cannot hold faculty or office roles.')
  if (userId === actor.id && !globalRoles.includes(G.ADMIN)) throw new Error('You cannot remove your own System Administrator role.')
  await db.update('users', userId, { globalRoles })
  await logAudit(actor.id, 'GLOBAL_ROLES_CHANGED', 'users', userId, null, { before: user.globalRoles, after: globalRoles })
}

export async function setAccountStatus(actor, snap, userId, status) {
  authorize(resolveInstitution(actor, snap), 'admin.accounts')
  if (userId === actor.id) throw new Error('You cannot change your own account status.')
  await db.update('users', userId, { status })
  await logAudit(actor.id, 'ACCOUNT_STATUS_CHANGED', 'users', userId, null, { status })
}

export async function markNotificationRead(id) {
  await db.update('notifications', id, { read: true })
}
