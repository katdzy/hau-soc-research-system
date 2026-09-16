// Every state-changing operation in the prototype. Each one writes an audit
// entry and fans out the notifications the manuscript's trigger matrix
// specifies, so the workflow can be walked end to end and inspected afterwards.

import { db } from '../backend/index.js'
import { bundle, logAudit, notify, assigneeIds, memberIds, latestOf } from './core.js'
import {
  DOC_STATUS, DECISIONS, REVISION_WINDOW_DAYS, FORMS, AI_MILESTONES,
} from '../domain/constants.js'
import { stageByKey, resolveNext } from '../domain/stages.js'

const now = () => new Date().toISOString()
const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString()

// --- Group and roster --------------------------------------------------------

export async function createProject(actor, { title, program, term, researchArea }) {
  const project = await db.add('projects', {
    title: title || 'Untitled project group',
    previousTitles: [], category: 'Capstone', researchArea: researchArea || 'Information Systems',
    program, term, currentStage: 'GROUP_FORMATION', status: 'Active',
    archiveResult: null, revisionClass: null, revisionDeadline: null,
    uroClearedAt: null, publicGallery: false,
  })
  await db.add('projectAssignments', {
    projectId: project.id, userId: actor.id, roleType: 'Instructor 1',
    status: 'Accepted', assignedAt: now(),
  })
  await db.add('workflowHistory', {
    projectId: project.id, fromStage: null, toStage: 'GROUP_FORMATION',
    actorId: actor.id, action: 'Group created', note: '', at: now(),
  })
  await logAudit(actor.id, 'PROJECT_CREATED', 'projects', project.id, project.id, { title })
  return project
}

export async function addMember(actor, projectId, userId) {
  const row = await db.add('projectMembers', { projectId, userId, joinedAt: now() })
  await logAudit(actor.id, 'MEMBER_ADDED', 'projectMembers', row.id, projectId, { userId })
  await notify([userId], {
    projectId, type: 'Group membership',
    title: 'You were added to a project group',
    body: 'Your instructor added you to a capstone project group. Open the workspace to see your project.',
  })
  return row
}

export async function removeMember(actor, projectId, memberRowId, userId) {
  await db.remove('projectMembers', memberRowId)
  await logAudit(actor.id, 'MEMBER_REMOVED', 'projectMembers', memberRowId, projectId, { userId })
}

export async function assignRole(actor, projectId, userId, roleType) {
  const row = await db.add('projectAssignments', {
    projectId, userId, roleType, status: 'Accepted', assignedAt: now(),
  })
  await logAudit(actor.id, 'ROLE_ASSIGNED', 'projectAssignments', row.id, projectId, { userId, roleType })
  await notify([userId], {
    projectId, type: 'Assignment',
    title: `You were assigned as ${roleType}`,
    body: `You now hold the project role of ${roleType}. Your permissions on this project changed accordingly.`,
  })
  return row
}

export async function unassignRole(actor, projectId, assignmentId, meta) {
  await db.remove('projectAssignments', assignmentId)
  await logAudit(actor.id, 'ROLE_UNASSIGNED', 'projectAssignments', assignmentId, projectId, meta)
}

// --- Documents ---------------------------------------------------------------

/**
 * Submissions are immutable (BR-05/06). A new upload never overwrites the
 * previous file; it creates a new version and marks its predecessor Superseded.
 */
export async function submitDocument(actor, snap, projectId, input) {
  const b = bundle(snap, projectId)
  const previous = latestOf(b, input.docType)
  const version = previous ? previous.versionNumber + 1 : 1

  const doc = await db.add('documents', {
    projectId, docType: input.docType, versionNumber: version,
    title: input.title || `${input.docType} v${version}`,
    fileName: input.fileName || `${input.docType.toLowerCase().replace(/\W+/g, '-')}-v${version}.pdf`,
    fileSize: input.fileSize ?? 0,
    abstract: input.abstract ?? '',
    submittedBy: actor.id, submittedAt: now(),
    status: DOC_STATUS.SUBMITTED,
    milestone: input.milestone ?? null,
    supersedes: previous?.id ?? null,
  })
  if (previous && previous.status !== DOC_STATUS.ARCHIVED) {
    await db.update('documents', previous.id, { status: DOC_STATUS.SUPERSEDED })
  }
  await logAudit(actor.id, 'DOCUMENT_SUBMITTED', 'documents', doc.id, projectId, {
    docType: input.docType, version,
  })

  const reviewers = [
    ...assigneeIds(b, 'Adviser'),
    ...assigneeIds(b, 'Instructor 1'),
    ...(b.project.currentStage.includes('DEFENSE') || b.project.currentStage.includes('REVISION')
      ? [...assigneeIds(b, 'Panel Chair'), ...assigneeIds(b, 'Panel Member')] : []),
  ]
  await notify(reviewers, {
    projectId, type: 'Submission',
    title: `${input.docType} v${version} uploaded`,
    body: `${actor.name} uploaded a new version for ${b.project.title}.`,
  })
  return doc
}

export async function addAnnotation(actor, projectId, documentId, input) {
  const row = await db.add('annotations', {
    projectId, documentId, authorId: actor.id, authorRole: input.authorRole,
    anchor: input.anchor || 'General', text: input.text,
    visibility: input.visibility ?? 'shared',
    // Private annotations are released to the group once the project moves past
    // the stage they were written in — i.e. after the defense concludes.
    stageAtCreation: input.stageAtCreation ?? null,
    createdAt: now(),
  })
  await logAudit(actor.id, 'ANNOTATION_ADDED', 'annotations', row.id, projectId, {
    documentId, visibility: row.visibility,
  })
  return row
}

/** A review decision changes document *status* only — never the file itself. */
export async function submitReview(actor, snap, projectId, documentId, input) {
  const b = bundle(snap, projectId)
  const row = await db.add('reviews', {
    projectId, documentId, reviewerId: actor.id, reviewerRole: input.reviewerRole,
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
  await logAudit(actor.id, 'REVIEW_DECISION', 'reviews', row.id, projectId, {
    documentId, decision: input.decision,
  })
  await notify(memberIds(b), {
    projectId, type: 'Review decision',
    title: `Review decision: ${input.decision}`,
    body: `${actor.name} reviewed your submission. ${input.comment ?? ''}`.trim(),
  })
  return row
}

/**
 * AI summarisation is deliberately restricted (FR-20/22): complete manuscripts
 * at defense milestones only, once per milestone, always labelled, never an
 * approval. The call is stubbed — swap `generate` for the vendor request when
 * the data-handling agreement is in place.
 */
export async function generateAiSummary(actor, snap, projectId, documentId) {
  const b = bundle(snap, projectId)
  const doc = b.documents.find(d => d.id === documentId)
  if (!doc) throw new Error('Document not found')
  if (!AI_MILESTONES.includes(doc.milestone)) {
    throw new Error('Summaries are generated only for manuscripts tagged to a defense milestone.')
  }
  const existing = b.aiSummaries.find(s => s.documentId === documentId)
  if (existing) return existing

  const row = await db.add('aiSummaries', {
    projectId, documentId, milestone: doc.milestone, generatedAt: now(),
    model: 'Gemini Flash (external service) — stubbed in prototype',
    label: 'AI-generated summary. Not an official academic evaluation — verify against the manuscript before relying on it.',
    structured: {
      background: doc.abstract || 'Not extracted — the prototype does not parse PDF content.',
      problemStatement: 'Stub output. The production build sends the manuscript to the approved summarisation service.',
      objectives: 'Stub output.', methodology: 'Stub output.', expectedOutput: 'Stub output.',
      scope: 'Stub output.', limitations: 'Stub output.', contributions: 'Stub output.',
    },
  })
  // FR-22: every transmission to the external service is recorded.
  await logAudit(actor.id, 'AI_SUMMARY_GENERATED', 'aiSummaries', row.id, projectId, {
    documentId, milestone: doc.milestone, transmittedTo: 'external summarisation service',
  })
  return row
}

// --- Weekly logs -------------------------------------------------------------

export async function submitWeeklyLog(actor, snap, projectId, input) {
  const b = bundle(snap, projectId)
  const weekNo = input.weekNo ?? (b.weeklyLogs.at(-1)?.weekNo ?? 0) + 1
  const row = await db.add('weeklyLogs', {
    projectId, weekNo, periodStart: input.periodStart ?? addDays(-7), periodEnd: input.periodEnd ?? now(),
    submittedBy: actor.id, submittedAt: now(), activities: input.activities,
    status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
  })
  await logAudit(actor.id, 'WEEKLY_LOG_SUBMITTED', 'weeklyLogs', row.id, projectId, { weekNo })
  await notify(assigneeIds(b, 'Adviser'), {
    projectId, type: 'Weekly log',
    title: `Week ${weekNo} accomplishment log awaiting your signature`,
    body: `${actor.name} submitted the week ${weekNo} log for ${b.project.title}.`,
  })
  return row
}

export async function signWeeklyLog(actor, snap, projectId, logId, remarks) {
  const b = bundle(snap, projectId)
  const row = await db.update('weeklyLogs', logId, {
    status: 'Signed', signedBy: actor.id, signedAt: now(), adviserRemarks: remarks ?? '',
  })
  await logAudit(actor.id, 'WEEKLY_LOG_SIGNED', 'weeklyLogs', logId, projectId, { form: FORMS.F2003.code })
  await notify(memberIds(b), {
    projectId, type: 'Weekly log',
    title: 'Your weekly log was signed',
    body: `${actor.name} signed your accomplishment log (${FORMS.F2003.code}).`,
  })
  return row
}

// --- Defense, verdict, revision ----------------------------------------------

export async function scheduleDefense(actor, snap, projectId, input) {
  const b = bundle(snap, projectId)
  const row = await db.add('defenses', {
    projectId, type: input.type, scheduledAt: input.scheduledAt, venue: input.venue,
    createdBy: actor.id, createdAt: now(),
    verdict: null, revisionClass: null, revisionDeadline: null,
    recordedBy: null, recordedAt: null, remarks: '',
  })
  await logAudit(actor.id, 'DEFENSE_SCHEDULED', 'defenses', row.id, projectId, { type: input.type })
  await notify([
    ...memberIds(b), ...assigneeIds(b, 'Adviser'),
    ...assigneeIds(b, 'Panel Chair'), ...assigneeIds(b, 'Panel Member'),
  ], {
    projectId, type: 'Defense schedule',
    title: `${input.type} defense scheduled`,
    body: `${new Date(input.scheduledAt).toLocaleString()} — ${input.venue}.`,
  })
  return row
}

/** Panel Chair only (FR-45 / BR-08). Recording the verdict starts the countdown. */
export async function recordVerdict(actor, snap, projectId, defenseId, input) {
  const b = bundle(snap, projectId)
  const revisionClass = input.verdict.includes('Major') ? 'Major'
    : input.verdict.includes('Minor') ? 'Minor' : null
  const deadline = revisionClass ? addDays(REVISION_WINDOW_DAYS[revisionClass]) : null

  await db.update('defenses', defenseId, {
    verdict: input.verdict, revisionClass, revisionDeadline: deadline,
    recordedBy: actor.id, recordedAt: now(), remarks: input.remarks ?? '',
  })
  await db.update('projects', projectId, { revisionClass, revisionDeadline: deadline })

  const defense = b.defenses.find(d => d.id === defenseId)
  const form = await db.add('forms', {
    projectId, formType: FORMS.F2004.code, name: FORMS.F2004.name,
    status: 'Circulating', createdAt: now(),
    payload: { verdict: input.verdict, revisionClass, remarks: input.remarks ?? '', defenseType: defense?.type },
    signatories: [
      ...assigneeIds(b, 'Panel Chair').map(id => ({ role: 'Panel Chair', userId: id, name: null, signedAt: null })),
      ...assigneeIds(b, 'Panel Member').map(id => ({ role: 'Panel Member', userId: id, name: null, signedAt: null })),
    ],
  })

  await logAudit(actor.id, 'VERDICT_RECORDED', 'defenses', defenseId, projectId, {
    verdict: input.verdict, revisionClass, form: form.id,
  })
  await notify([...memberIds(b), ...assigneeIds(b, 'Adviser')], {
    projectId, type: 'Verdict',
    title: `Defense verdict: ${input.verdict}`,
    body: deadline
      ? `Revisions are due ${new Date(deadline).toLocaleDateString()}. ${input.remarks ?? ''}`.trim()
      : (input.remarks ?? 'No revisions required.'),
  })
}

// --- Forms and signatures -----------------------------------------------------

export async function generateApprovalSheet(actor, snap, projectId) {
  const b = bundle(snap, projectId)
  const existing = b.forms.find(f => f.formType === FORMS.APPROVAL.code)
  if (existing) return existing

  const roleOrder = ['Adviser', 'Panel Member', 'Panel Chair']
  const signatories = []
  for (const role of roleOrder) {
    for (const id of assigneeIds(b, role)) signatories.push({ role, userId: id, name: null, signedAt: null })
  }
  const coordinator = (snap.users ?? []).find(u => u.globalRole === 'Program Chair/Coordinator')
  const uro = (snap.users ?? []).find(u => u.globalRole === 'University Research Office')
  const dean = (snap.users ?? []).find(u => u.globalRole === 'Dean')
  signatories.push(
    { role: 'Program Chair/Coordinator', userId: coordinator?.id, name: null, signedAt: null },
    { role: 'University Research Office', userId: uro?.id, name: null, signedAt: null },
    { role: 'Dean', userId: dean?.id, name: null, signedAt: null },
  )

  const form = await db.add('forms', {
    projectId, formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
    status: 'Circulating', createdAt: now(), payload: {}, signatories,
  })
  await logAudit(actor.id, 'FORM_GENERATED', 'forms', form.id, projectId, { formType: FORMS.APPROVAL.code })
  await notify(signatories.map(s => s.userId), {
    projectId, type: 'Signature request',
    title: 'Approval Sheet circulating for signature',
    body: `${b.project.title} is awaiting your digital signature.`,
  })
  return form
}

export async function submitRecommendationForm(actor, snap, projectId) {
  const b = bundle(snap, projectId)
  const form = await db.add('forms', {
    projectId, formType: FORMS.F2005.code, name: FORMS.F2005.name,
    status: 'Submitted', createdAt: now(), payload: {},
    signatories: [{ role: 'Adviser', userId: actor.id, name: actor.name, signedAt: now() }],
  })
  await logAudit(actor.id, 'FORM_SUBMITTED', 'forms', form.id, projectId, { formType: FORMS.F2005.code })
  const coordinators = (snap.users ?? []).filter(u => u.globalRole === 'Program Chair/Coordinator').map(u => u.id)
  await notify([...coordinators, ...assigneeIds(b, 'Instructor 2')], {
    projectId, type: 'Final defense clearance',
    title: `${FORMS.F2005.code} submitted`,
    body: `${actor.name} recommends ${b.project.title} for final defense.`,
  })
  return form
}

/** Digital signature: traceable to signatory, role, timestamp and form (FR-52/53). */
export async function signForm(actor, snap, projectId, formId) {
  // Read fresh: a signature may have been written since this render's snapshot.
  const form = await db.get('forms', formId)
  if (!form) throw new Error('Form not found')

  const signatories = form.signatories.map(s =>
    s.userId === actor.id && !s.signedAt
      ? { ...s, name: actor.name, signedAt: now() }
      : s)
  const complete = signatories.every(s => s.signedAt)
  await db.update('forms', formId, { signatories, status: complete ? 'Completed' : 'Circulating' })
  await logAudit(actor.id, 'FORM_SIGNED', 'forms', formId, projectId, {
    formType: form.formType, role: form.signatories.find(s => s.userId === actor.id)?.role,
  })
  return signatories
}

// --- Stage transition ---------------------------------------------------------

export async function runGate(actor, snap, projectId, gate) {
  const b = bundle(snap, projectId)
  const blocked = gate.requires(b)
  if (blocked) throw new Error(blocked)

  const from = b.project.currentStage
  const to = resolveNext(gate, b)
  const patch = { currentStage: to }

  if (gate.action === 'REGISTER_TOPIC') {
    const topic = b.documents.find(d => d.docType === 'Topic Proposal' && d.status === DOC_STATUS.APPROVED)
    if (topic) {
      patch.title = topic.title.replace(/^Proposed Topic:\s*/i, '')
      patch.previousTitles = [...(b.project.previousTitles ?? []), b.project.title]
    }
  }
  if (gate.action === 'GRANT_URO_CLEARANCE') {
    patch.uroClearedAt = now()
    // Granting clearance *is* the URO's signature on the Approval Sheet — the
    // office verifies the certificates and signs in one act, then the sheet
    // carries on to the Dean.
    const sheet = await generateApprovalSheet(actor, snap, projectId)
    await signForm(actor, snap, projectId, sheet.id)
  }
  if (gate.action === 'DEAN_SIGN') {
    patch.archiveResult = 'Pass'
    patch.status = 'Completed'
    const sheet = b.forms.find(f => f.formType === FORMS.APPROVAL.code)
    if (sheet) await signForm(actor, snap, projectId, sheet.id)
    for (const d of b.documents) {
      if (d.status !== DOC_STATUS.SUPERSEDED) await db.update('documents', d.id, { status: DOC_STATUS.ARCHIVED })
    }
  }

  await db.update('projects', projectId, patch)
  await db.add('workflowHistory', {
    projectId, fromStage: from, toStage: to, actorId: actor.id,
    action: gate.action, note: gate.label, at: now(),
  })
  await logAudit(actor.id, `STAGE_${gate.action}`, 'projects', projectId, projectId, { from, to })

  const audience = [
    ...memberIds(b), ...assigneeIds(b, 'Adviser'), ...assigneeIds(b, 'Instructor 1'),
  ]
  await notify(audience, {
    projectId, type: 'Workflow',
    title: `Moved to ${stageByKey(to)?.label ?? to}`,
    body: `${actor.name} completed: ${gate.label}.`,
  })
  return to
}

// --- Administration -----------------------------------------------------------

export async function setGlobalRole(actor, userId, globalRole) {
  await db.update('users', userId, { globalRole })
  await logAudit(actor.id, 'GLOBAL_ROLE_CHANGED', 'users', userId, null, { globalRole })
}

export async function setAccountStatus(actor, userId, status) {
  await db.update('users', userId, { status })
  await logAudit(actor.id, 'ACCOUNT_STATUS_CHANGED', 'users', userId, null, { status })
}

export async function setPublicGallery(actor, projectId, publicGallery) {
  await db.update('projects', projectId, { publicGallery })
  await logAudit(actor.id, 'GALLERY_VISIBILITY_CHANGED', 'projects', projectId, projectId, { publicGallery })
}

export async function markNotificationRead(id) {
  await db.update('notifications', id, { read: true })
}
