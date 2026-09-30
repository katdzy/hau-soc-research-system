// Every state-changing operation in the prototype. Each one:
//   1. authorizes the actor through the one CAAC guard (`authorizeOn`), which
//      reads the signed-in account and the store fresh — the same check a
//      Cloud Function runs before committing a write;
//   2. writes the change as one all-or-nothing unit (`perform`), refusing a
//      duplicate of a request that is still running;
//   3. appends an audit entry (actor, role hat, before → after) and a
//      workflow-history entry;
//   4. notifies whoever the change concerns — in-app plus a mock email in the
//      dev outbox (email through Resend in the Firebase build).
//
// The `_snap` argument the components pass is ignored: authorization never
// trusts a snapshot handed in by the caller.

import { db, files } from '../backend/index.js'
import { filePath } from '../backend/files.js'
import { normalizePosition, anchorOf } from '../domain/annotations.js'
import {
  bundle, current, authorizeOn, authorizeInstitution, perform, logAudit, logHistory, notify, sendMail,
  assigneeIds, memberIds, latestOf, holdersOf, resolveActor,
} from './core.js'
import {
  DOC_STATUS, DOC_TYPES, DECISIONS, FORMS, AI_MILESTONES, AI_DISCLOSURE, VERDICTS, PROGRAMS,
  GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, ACCOUNT_STATUS, LINK_TYPES, accountType, normalizeEmail,
  isPdfFile, isVideoLink, topicsProblem, MAX_PDF_MB, COURSES, CAPSTONE2_MILESTONES, normalizeSection, parseSection, sectionProblem, yearLevelOf,
} from '../domain/constants.js'
import {
  stageByKey, stageLabel, stageIndex, resolveNext, staysAtStage, openGates, defenseNotHeld, ADVISER_APPROVERS,
  adviserApprovalComplete, requiredAdviserApprovers, milestoneStatus, uroReturnOf, uroReturnOutstanding, returnResetsSigning,
} from '../domain/stages.js'
import { resolveContext, allowedDocTypes, uploadBlocker, can, CAPABILITIES, PROJECT_POLICIES } from '../domain/caac.js'
import { SETTINGS_ID, revisionDaysOf, REVISION_DAYS_LIMITS } from '../domain/settings.js'
import { canDo } from '../domain/guard.js'
import { formOf } from '../domain/forms.js'
import { FLAGS } from '../domain/flags.js'
import { nowIso } from '../backend/clock.js'

const now = nowIso
const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString()

/** Active users who hold `cap` on this project in the given state. */
function usersWith(snap, b, cap) {
  return (snap.users ?? [])
    .filter(u => u.status === ACCOUNT_STATUS.ACTIVE && can(resolveContext(u, b), cap))
    .map(u => u.id)
}

/** Workflow-history + audit for an action that does not move the stage. */
async function record({ actor, hat, b, action, entityType, entityId, before, after, note, meta, privateTo }) {
  await logAudit({ actorId: actor.id, hat, action, entityType, entityId, projectId: b?.project.id ?? null, before, after, meta })
  if (b) {
    const stage = b.project.currentStage
    await logHistory({ projectId: b.project.id, fromStage: stage, toStage: stage, actorId: actor.id, hat, action, note: note ?? action, privateTo })
  }
}

async function transition(actor, hat, snap, b, to, action, note, announce = null) {
  const from = b.project.currentStage
  await db.update('projects', b.project.id, { currentStage: to })
  await logHistory({ projectId: b.project.id, fromStage: from, toStage: to, actorId: actor.id, hat, action, note })
  await logAudit({
    actorId: actor.id, hat, action: `STAGE_${action}`, entityType: 'projects', entityId: b.project.id,
    projectId: b.project.id, before: { stage: from }, after: { stage: to },
  })

  // Whoever the new stage involves learns about it — resolved through CAAC
  // against the project as it will be, not from a fixed role list.
  const next = { ...b, project: { ...b.project, currentStage: to } }
  const involved = (stageByKey(to)?.gates ?? []).flatMap(gate => usersWith(snap, next, gate.capability))
  // …and whoever the new stage opens the project to (S5.8: "I2: project appears").
  const hadView = new Set(usersWith(snap, b, 'document.read'))
  const gainsView = usersWith(snap, next, 'document.read').filter(id => !hadView.has(id))
  // A proposed Adviser is not told anything before the appointment is approved (S2.2).
  const advisers = stageIndex(to) > stageIndex('ADVISER_APPROVAL') ? assigneeIds(b, P.ADVISER) : []
  // Flag URO_EMAILS (not stated in the manuscript): whether the URO hears of an endorsement.
  const muted = to === 'URO_VERIFICATION' && !FLAGS.URO_EMAILS.endorsedToUro ? usersWith(snap, next, 'uro.verify') : []
  await notify([...memberIds(b), ...advisers, ...involved, ...gainsView].filter(id => id !== actor.id && !muted.includes(id)), {
    projectId: b.project.id, type: 'Workflow', event: `Stage: ${stageLabel(to)}`,
    title: `${b.project.title} moved to ${stageLabel(to)}`,
    body: `${actor.name} completed: ${note}.`,
    // A step with an email of its own in §3 (e.g. "adviser appointed") says so.
    ...(announce ?? {}),
  })
  return to
}

// --- Group and roster --------------------------------------------------------

export async function createProject(actor, _snap, { title, sectionId, researchArea }) {
  const { inst, actor: me, hat } = authorizeInstitution(actor, 'group.create')
  const section = inst.sections.find(s => s.id === sectionId && s.course === COURSES.C1)
  if (!section) throw new Error('You can only create groups for a Capstone 1 section you teach.')

  return perform(`createProject:${me.id}:${sectionId}:${title}`, async () => {
    const project = await db.add('projects', {
      title: title || `Untitled — ${section.block}`,
      previousTitles: [], category: 'Capstone', researchArea: researchArea || 'Not yet set',
      program: section.program, term: section.term, block: section.block, sectionId: section.id,
      currentStage: 'GROUP_FORMATION', status: 'Active', archiveResult: null,
      revisionClass: null, revisionDeadline: null, revisionStatus: null,
      milestonesConfirmedAt: null, milestonesConfirmedBy: null, milestones: {}, adviserApprovals: {},
      readinessConfirmedAt: null, readinessConfirmedBy: null, postDefenseConfirmedAt: null, postDefenseConfirmedBy: null, uroReturns: [],
    })
    // The section instructor becomes Instructor 1 on the new group.
    await db.add('projectAssignments', {
      projectId: project.id, userId: me.id, roleType: P.INSTRUCTOR_1,
      status: 'Accepted', assignedAt: now(), assignedBy: me.id,
    })
    await logHistory({
      projectId: project.id, fromStage: null, toStage: 'GROUP_FORMATION', actorId: me.id,
      hat, action: 'GROUP_CREATED', note: 'Group created',
    })
    await logAudit({
      actorId: me.id, hat, action: 'PROJECT_CREATED', entityType: 'projects', entityId: project.id,
      projectId: project.id, before: null, after: { title: project.title, block: section.block },
    })
    return project
  })
}

export async function addMember(actor, _snap, projectId, userId) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'manageRoster')
  const student = (snap.users ?? []).find(u => u.id === userId)
  if (!student || !(student.globalRoles ?? []).includes(G.STUDENT)) throw new Error('Only student accounts can join a group.')
  if (student.block !== b.project.block) throw new Error(`That student is not in section ${b.project.block}.`)
  const inGroup = (rows) => (rows ?? []).some(m => m.userId === userId)
  if (inGroup(snap.projectMembers)) throw new Error('That student is already in a group.')

  // Keyed per student, so two groups cannot claim the same student at once;
  // re-checked inside the transaction against the store as it is then.
  const full = (rows) => (rows ?? []).filter(m => m.projectId === projectId).length >= FLAGS.GROUP_SIZE
  if (full(snap.projectMembers)) throw new Error(`This group already has ${FLAGS.GROUP_SIZE} members.`)
  return perform(`addMember:${userId}`, async () => {
    if (inGroup(current().projectMembers)) throw new Error('That student is already in a group.')
    if (full(current().projectMembers)) throw new Error(`This group already has ${FLAGS.GROUP_SIZE} members.`)
    const row = await db.add('projectMembers', { projectId, userId, joinedAt: now() })
    await record({
      actor: me, hat, b, action: 'MEMBER_ADDED', entityType: 'projectMembers', entityId: row.id,
      before: null, after: { userId }, note: `Added ${student.name}`,
    })
    await notify([userId], {
      projectId, type: 'Group membership', event: 'Added to a group',
      title: 'You were added to a project group',
      body: `${me.name} added you to ${b.project.title}.`,
    })
    return row
  })
}

export async function removeMember(actor, _snap, projectId, memberRowId, userId) {
  const { b, hat, actor: me } = authorizeOn(actor, projectId, 'manageRoster')
  const row = b.members.find(m => m.id === memberRowId && m.userId === userId)
  if (!row) throw new Error('That student is not in this group.')
  return perform(`removeMember:${memberRowId}`, async () => {
    await db.remove('projectMembers', memberRowId)
    await record({
      actor: me, hat, b, action: 'MEMBER_REMOVED', entityType: 'projectMembers', entityId: memberRowId,
      before: { userId }, after: null,
    })
  })
}

// Which guard action hands out each Project-Based Role.
export const ASSIGNING_ACTION = {
  [P.ADVISER]: 'assignAdviser',
  [P.PANEL_CHAIR]: 'assignPanel',
  [P.PANEL_MEMBER]: 'assignPanel',
  [P.INSTRUCTOR_2]: 'assignInstructor2',
}
// Kept for components that check capabilities directly.
export const ASSIGNING_CAPABILITY = {
  [P.ADVISER]: 'adviser.assign',
  [P.PANEL_CHAIR]: 'panel.assign',
  [P.PANEL_MEMBER]: 'panel.assign',
  [P.INSTRUCTOR_2]: 'instructor2.assign',
}

/** Returns a reason the assignment would break a rule, or null. */
export function assignmentConflict(b, userId, roleType) {
  const holds = (role) => b.assignments.some(a => a.userId === userId && a.roleType === role)
  if (FLAGS.BLOCK_ADVISER_ON_PANEL) {
    if (PANEL_ROLES.includes(roleType) && holds(P.ADVISER)) return 'Adviser on this project — cannot sit on its panel'
    if (roleType === P.ADVISER && PANEL_ROLES.some(holds)) return 'On this project’s panel — cannot also advise it'
  }
  if (PANEL_ROLES.includes(roleType) && PANEL_ROLES.some(holds)) return 'Already on this panel'
  if (holds(roleType)) return `Already ${roleType}`
  return null
}

export async function assignRole(actor, _snap, projectId, userId, roleType) {
  const action = ASSIGNING_ACTION[roleType]
  if (!action) throw new Error(`${roleType} is not assigned from here.`)
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, action)

  const target = (snap.users ?? []).find(u => u.id === userId)
  if (!target || accountType(target.email) !== 'Faculty') throw new Error('Project roles go to faculty accounts only.')
  if (target.status !== ACCOUNT_STATUS.ACTIVE) throw new Error('That account is not active.')
  const conflict = assignmentConflict(b, userId, roleType)
  if (conflict) throw new Error(conflict + '.')
  const single = [P.ADVISER, P.PANEL_CHAIR, P.INSTRUCTOR_2]
  if (single.includes(roleType) && b.assignments.some(a => a.roleType === roleType)) {
    throw new Error(`This project already has a ${roleType}. Unassign them first.`)
  }

  return perform(`assignRole:${projectId}:${userId}:${roleType}`, async () => {
    const row = await db.add('projectAssignments', {
      projectId, userId, roleType, status: 'Accepted', assignedAt: now(), assignedBy: me.id,
    })
    await record({
      actor: me, hat, b, action: 'ROLE_ASSIGNED', entityType: 'projectAssignments', entityId: row.id,
      before: null, after: { userId, roleType }, note: `Assigned ${target.name} as ${roleType}`,
    })
    // The Adviser hears about it on approval ("Adviser appointed", S2.2), not now:
    // until the Dean and AD approve, the assignment is a proposal. Nobody is
    // emailed about a project the role does not open yet: an Instructor 2
    // assigned during the proposal revision hears about it when Instructor 1
    // routes the group (S5.8), the transition that opens it to them.
    const opens = can(resolveContext(target, { ...b, assignments: [...b.assignments, row] }), 'project.view')
    if (roleType !== P.ADVISER && opens) await notify([userId], {
      projectId, type: 'New assignment',
      event: PANEL_ROLES.includes(roleType) ? 'Assigned to a panel' : 'New assignment',
      title: `You were assigned as ${roleType}`,
      body: `${b.project.title}. What you can do on it now depends on this role and on the stage the project is in.`,
    })
    return row
  })
}

export async function unassignRole(actor, _snap, projectId, assignment) {
  const action = ASSIGNING_ACTION[assignment.roleType]
  if (!action) throw new Error(`${assignment.roleType} is not unassigned from here.`)
  const { b, hat, actor: me } = authorizeOn(actor, projectId, action)
  const row = b.assignments.find(a => a.id === assignment.id)
  if (!row) throw new Error('That assignment no longer exists.')
  return perform(`unassignRole:${row.id}`, async () => {
    await db.remove('projectAssignments', row.id)
    await record({
      actor: me, hat, b, action: 'ROLE_UNASSIGNED', entityType: 'projectAssignments', entityId: row.id,
      before: { userId: row.userId, roleType: row.roleType }, after: null,
      note: `Removed ${row.roleType}`,
    })
  })
}

// --- Documents ---------------------------------------------------------------

/**
 * Submissions are immutable. A new upload never overwrites the previous file;
 * it creates a new version and marks its predecessor Superseded.
 */
export async function submitDocument(actor, _snap, projectId, input) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'submitDocument')
  if (!allowedDocTypes(b.project.currentStage, b).includes(input.docType)) {
    throw new Error(`${input.docType} is not accepted at ${stageLabel(b.project.currentStage)}.`)
  }
  const blocked = uploadBlocker(b, input.docType)
  if (blocked) throw new Error(blocked)
  const isLink = LINK_TYPES.includes(input.docType)
  if (isLink && !isVideoLink(input.link)) throw new Error('Enter the full link to the hosted video, starting with https://.')
  if (!isLink && !input.fileName) throw new Error('Attach the PDF file.')
  if (!isLink && !isPdfFile(input.fileName, input.fileType)) throw new Error('Only PDF files can be submitted.')
  if (!isLink && (input.file?.size ?? input.fileSize ?? 0) > MAX_PDF_MB * 1024 * 1024) {
    throw new Error(`The file is larger than ${MAX_PDF_MB} MB.`)
  }
  const isTopics = input.docType === DOC_TYPES.TOPIC_PROPOSAL
  if (isTopics) {
    const problem = topicsProblem(input.topics)
    if (problem) throw new Error(problem)
  }

  // The bytes go to the file store first, at a path no other version uses: if
  // the upload fails nothing is recorded, and nothing can overwrite a file.
  // (Service tests submit the name and size only.)
  const storagePath = !isLink && input.file
    ? await files.put(filePath(projectId, input.fileName), input.file)
    : null

  // Keyed per member: a double-click records once, while two members
  // uploading at the same moment both land, as consecutive versions.
  return perform(`submitDocument:${projectId}:${input.docType}:${me.id}`, async () => {
    // Number the version inside the transaction, from the store as it is now —
    // transactions queue, so concurrent uploads never share a version number.
    const previous = latestOf(bundle(current(), projectId), input.docType)
    const version = previous ? previous.versionNumber + 1 : 1
    const doc = await db.add('documents', {
      projectId, docType: input.docType, versionNumber: version,
      title: input.title?.trim() || `${input.docType} v${version}`,
      fileName: isLink ? null : input.fileName.trim(),
      fileSize: isLink ? null : (input.fileSize ?? 0),
      storagePath,
      link: isLink ? input.link.trim() : null,
      topics: isTopics ? input.topics.map(t => t.trim()) : null,
      abstract: input.abstract ?? '',
      submittedBy: me.id, submittedAt: now(),
      status: DOC_STATUS.SUBMITTED,
      workflowStage: b.project.currentStage,
      milestone: null,
      supersedes: previous?.id ?? null,
    })
    if (previous && previous.status !== DOC_STATUS.ARCHIVED) {
      await db.update('documents', previous.id, { status: DOC_STATUS.SUPERSEDED })
    }
    await record({
      actor: me, hat, b, action: 'DOCUMENT_SUBMITTED', entityType: 'documents', entityId: doc.id,
      before: previous ? { documentId: previous.id, version: previous.versionNumber, status: previous.status } : null,
      after: { documentId: doc.id, docType: input.docType, version, status: DOC_STATUS.SUBMITTED },
      note: `${input.docType} v${version} submitted`,
    })

    const reviewers = [
      ...usersWith(snap, b, 'review.decide'),
      ...usersWith(snap, b, 'document.annotate'),
    ].filter(id => id !== me.id)
    await notify(reviewers, {
      projectId, type: 'Submission', event: `${input.docType} submitted`,
      title: `${input.docType} v${version} submitted`,
      body: `${me.name} submitted a new version for ${b.project.title}.`,
    })
    // S9.4 return path — once every returned certificate is replaced, the
    // project is back in the URO's queue.
    const after = bundle(current(), projectId)
    const replaced = uroReturnOutstanding(b).length && !uroReturnOutstanding(after).length
    if (replaced && b.project.currentStage === 'URO_VERIFICATION' && FLAGS.URO_EMAILS.certificatesResubmitted) {
      await notify(usersWith(snap, after, 'uro.verify'), {
        projectId, type: 'Clearance', event: 'Certificates resubmitted',
        title: `${b.project.title}: new certificates to verify`,
        body: `${me.name} uploaded the certificate(s) you returned: ${uroReturnOf(b).docTypes.join(', ')}.`,
      })
    }
    // NEW-46 — after a manuscript return, the reissued Approval Sheet opens for the Adviser.
    if (replaced && b.project.currentStage === 'CLEARANCE') {
      const sheet = formOf(after, FORMS.APPROVAL.code)
      await notify((sheet?.signatories ?? []).filter(x => x.order === 1).map(x => x.userId), {
        projectId, type: 'Signature request', event: 'Approval Sheet to sign',
        title: 'Approval Sheet ready for your signature again',
        body: `${b.project.title}: the group uploaded what the URO returned (${uroReturnOf(b).docTypes.join(', ')}). Check it and sign the new Approval Sheet.`,
      })
    }
    return doc
  })
}

/**
 * S9.4 return path (NEW-7, flag URO_RETURN_PATH; NEW-45, flag URO_RETURNABLE):
 * the URO sends certificates back with remarks. The returned versions are
 * marked For Revision (never changed otherwise); the project stays at URO
 * Verification, where the group may upload new versions of exactly those
 * certificates. The Approval Sheet signatures stand.
 */
export async function returnToGroup(actor, _snap, projectId, { docTypes, remarks } = {}) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'uroReturn', { docTypes })
  if (!remarks?.trim()) throw new Error('Say what the group has to fix.')
  const resets = returnResetsSigning(docTypes)
  return perform(`uroReturn:${projectId}`, async () => {
    const docs = docTypes.map(t => latestOf(b, t))
    for (const d of docs) await db.update('documents', d.id, { status: DOC_STATUS.FOR_REVISION })
    const entry = {
      at: now(), by: me.id, remarks: remarks.trim(), docTypes: [...docTypes], documentIds: docs.map(d => d.id), resetsSigning: resets,
    }
    await db.update('projects', projectId, { uroReturns: [...(b.project.uroReturns ?? []), entry] })
    await record({
      actor: me, hat, b, action: 'URO_RETURNED', entityType: 'projects', entityId: projectId,
      before: { documents: docs.map(d => ({ docType: d.docType, version: d.versionNumber, status: d.status })) },
      after: { documents: docs.map(d => ({ docType: d.docType, version: d.versionNumber, status: DOC_STATUS.FOR_REVISION })), remarks: entry.remarks },
      note: `Returned to the group: ${docTypes.join(', ')}`,
    })
    const email = {
      type: 'Clearance', event: 'Returned by the URO',
      title: `${b.project.title}: the URO returned ${docTypes.join(' and ')}`,
      body: resets
        ? `${entry.remarks} Upload a new version. The project is back at Final Requirements: the Adviser, the panel and the Program Chair/Coordinator sign a new Approval Sheet before it returns to the URO.`
        : `${entry.remarks} Upload a new version; the project goes back to the URO once it is in.`,
    }
    if (!resets) {
      await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER)], { projectId, ...email })
      return entry
    }
    // NEW-46 (flag URO_MANUSCRIPT_RETURN) — the signatures certified the old manuscript.
    await issueApprovalSheet(me, hat, snap, b, { reissueOf: formOf(b, FORMS.APPROVAL.code) })
    await transition(me, hat, snap, b, 'CLEARANCE', 'URO_RETURN_MANUSCRIPT', `Returned to the group: ${docTypes.join(', ')}`, email)
    return entry
  })
}

/**
 * Non-destructive annotation (S3.6, S4.2, S5.5, S6.4, S7.5). The note is its own
 * record, pinned to one version and — when `input.position` is given — to a
 * passage or area of one page (domain/annotations.js). The PDF is never touched,
 * and annotations are append-only: none is edited or removed.
 */
export async function addAnnotation(actor, _snap, projectId, documentId, input) {
  const doc = bundle(current(), projectId)?.documents.find(d => d.id === documentId)
  const { b, ctx, hat, actor: me } = authorizeOn(actor, projectId, 'annotate', { doc })
  const text = String(input.text ?? '').trim()
  if (!text) throw new Error('Write the comment.')
  if (doc.link && input.position) throw new Error('A video link has no pages to mark.')
  const position = normalizePosition(input.position)
  const isPrivate = can(ctx, 'annotation.private')
  return perform(`annotate:${me.id}:${documentId}:${text}`, async () => {
    const row = await db.add('annotations', {
      projectId, documentId, documentVersion: doc.versionNumber, authorId: me.id, authorRole: hat,
      anchor: anchorOf(position, input.anchor?.trim()), position, category: input.category, text,
      visibility: isPrivate ? 'private' : 'shared',
      // Private panel notes are released when the Panel Chair records the verdict.
      releasedAt: null,
      createdAt: now(),
    })
    await record({
      actor: me, hat, b, action: 'ANNOTATION_ADDED', entityType: 'annotations', entityId: row.id,
      before: null, after: { documentId, visibility: row.visibility, page: position?.page ?? null },
      note: isPrivate ? 'Private panel note added' : 'Annotation added',
      // Even the fact that a private note exists stays with its author (T4).
      privateTo: isPrivate ? me.id : undefined,
    })
    return row
  })
}

const STATUS_FOR_DECISION = {
  [DECISIONS.APPROVE]: DOC_STATUS.APPROVED,
  [DECISIONS.MINOR]: DOC_STATUS.APPROVED,
  [DECISIONS.ENDORSE]: DOC_STATUS.APPROVED,
  [DECISIONS.MAJOR]: DOC_STATUS.FOR_REVISION,
  [DECISIONS.REJECT]: DOC_STATUS.REJECTED,
}

/** A review decision changes the version's status only — never the file. */
export async function submitReview(actor, _snap, projectId, documentId, input) {
  const doc = bundle(current(), projectId)?.documents.find(d => d.id === documentId)
  const status = STATUS_FOR_DECISION[input.decision]
  if (!status) throw new Error('Choose a decision.')
  // Returning a version needs only `review.return` (Instructor 1 on drafts,
  // S4.2); approving needs the full decision (`review.decide`).
  const returning = status !== DOC_STATUS.APPROVED
  if (returning && !input.comment?.trim()) throw new Error('Say what the group needs to change.')
  const action = returning && !check(actor, 'reviewDocument', projectId, { doc }).ok ? 'returnDocument' : 'reviewDocument'
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, action, { doc })

  // Approving is itself a gate in two places: the concept paper opens Proposal
  // Development (S3.6); after a re-defense verdict, the revised manuscript
  // returns the project to scheduling (NEW-41, S7.7).
  const gateFor = { [DOC_TYPES.CONCEPT_PAPER]: ['APPROVE_CONCEPT_PAPER'], [DOC_TYPES.REVISED_MANUSCRIPT]: ['RETURN_TO_PROPOSAL_DEFENSE', 'RETURN_TO_FINAL_DEFENSE'] }
  const gate = !returning
    ? openGates(stageByKey(b.project.currentStage), b).find(g => (gateFor[doc.docType] ?? []).includes(g.action)) ?? null
    : null
  if (gate) {
    authorizeOn(actor, projectId, gate.action)
    const blocked = gate.requires(b, me)
    if (blocked) throw new Error(blocked)
  }
  // S3.3 — approving a Topic Proposal approves ONE of its five topics.
  const approvedTopic = doc.topics && status === DOC_STATUS.APPROVED ? input.approvedTopic?.trim() : null
  if (doc.topics && status === DOC_STATUS.APPROVED && !doc.topics.includes(approvedTopic)) {
    throw new Error('Choose which of the proposed topics you approve.')
  }
  return perform(`review:${documentId}`, async () => {
    const row = await db.add('reviews', {
      projectId, documentId, reviewerId: me.id, reviewerRole: hat,
      decision: input.decision, comment: input.comment ?? '', createdAt: now(),
      ...(approvedTopic ? { approvedTopic } : {}),
    })
    await db.update('documents', documentId, { status })
    await record({
      actor: me, hat, b, action: 'REVIEW_DECISION', entityType: 'documents', entityId: documentId,
      before: { status: doc.status }, after: { status, decision: input.decision, ...(approvedTopic ? { approvedTopic } : {}) },
      note: `${doc.docType} v${doc.versionNumber}: ${input.decision}`,
    })
    await notify(memberIds(b), {
      projectId, type: status === DOC_STATUS.APPROVED ? 'Approved' : 'Revision requested',
      event: status === DOC_STATUS.APPROVED ? 'Approved' : 'Revision requested',
      title: `${doc.docType} v${doc.versionNumber}: ${input.decision}`,
      body: `${me.name} reviewed your submission.${approvedTopic ? ` Approved topic: “${approvedTopic}”.` : ''} ${input.comment ?? ''}`.trim(),
    })
    if (gate?.action.startsWith('RETURN_TO_')) {
      const type = gate.action === 'RETURN_TO_PROPOSAL_DEFENSE' ? 'Proposal' : 'Final'
      await db.update('projects', projectId, await completeRevisions(b, type))
    }
    if (gate) await transition(me, hat, snap, b, resolveNext(gate, b), gate.action, gate.label)
    return row
  })
}

/**
 * R12 — the Gemini summary is a stub that already existed; it is not extended.
 * It runs when the defense schedule is published (flag AI_SUMMARY_TRIGGER
 * records the intended trigger).
 */
async function summarizeForMilestone(actor, hat, b, defenseType) {
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
  await logAudit({
    actorId: actor.id, hat, action: 'AI_SUMMARY_GENERATED', entityType: 'aiSummaries', entityId: row.id,
    projectId: b.project.id, before: null, after: { documentId: doc.id, milestone },
    meta: { transmittedTo: 'Gemini Flash API (paid tier)' },
  })
  return row
}

// --- Weekly logs (FM-AAC-SOC-2003) ---------------------------------------------

export async function submitWeeklyLog(actor, _snap, projectId, input) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'submitWeeklyLog')
  if (!input.activities?.trim()) throw new Error('Describe the week’s accomplishments.')
  const last = b.weeklyLogs.at(-1)
  if (last?.status === 'Submitted') throw new Error(`Week ${last.weekNo} is still waiting for the Adviser.`)
  // A returned log is resubmitted under the same week number.
  const weekNo = last?.status === 'Returned' ? last.weekNo : (last?.weekNo ?? 0) + 1
  return perform(`weeklyLog:${projectId}:${weekNo}`, async () => {
    const row = await db.add('weeklyLogs', {
      projectId, weekNo, periodStart: addDays(-7), periodEnd: now(),
      submittedBy: me.id, submittedAt: now(), activities: input.activities,
      status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
    })
    await record({
      actor: me, hat, b, action: 'WEEKLY_LOG_SUBMITTED', entityType: 'weeklyLogs', entityId: row.id,
      before: null, after: { weekNo, status: 'Submitted' }, note: `Week ${weekNo} log submitted`,
    })
    await notify(usersWith(snap, b, 'weeklylog.sign'), {
      projectId, type: 'Weekly log', event: 'Weekly log submitted',
      title: `Week ${weekNo} log awaiting your review`,
      body: `${me.name} submitted the week ${weekNo} log for ${b.project.title}.`,
    })
    return row
  })
}

export async function decideWeeklyLog(actor, _snap, projectId, logId, { approve, remarks }) {
  const log = bundle(current(), projectId)?.weeklyLogs.find(l => l.id === logId)
  const { b, hat, actor: me } = authorizeOn(actor, projectId, 'signWeeklyLog', { log })
  if (!approve && !remarks?.trim()) throw new Error('Say why the log is returned.')
  return perform(`signWeeklyLog:${logId}`, async () => {
    const patch = approve
      ? { status: 'Approved', signedBy: me.id, signedAt: now(), adviserRemarks: remarks ?? '' }
      : { status: 'Returned', adviserRemarks: remarks ?? '' }
    const row = await db.update('weeklyLogs', logId, patch)
    await record({
      actor: me, hat, b, action: approve ? 'WEEKLY_LOG_SIGNED' : 'WEEKLY_LOG_RETURNED',
      entityType: 'weeklyLogs', entityId: logId,
      before: { status: log.status }, after: { status: patch.status }, meta: { form: FORMS.F2003.code },
      note: `Week ${log.weekNo} log ${approve ? 'approved and signed' : 'returned'}`,
    })
    await notify(memberIds(b), {
      projectId, type: 'Weekly log', event: approve ? 'Approved' : 'Revision requested',
      title: approve ? 'Your weekly log was approved and signed' : 'Your weekly log was returned',
      body: approve
        ? `${me.name} signed your ${FORMS.F2003.code} entry.`
        : `${me.name} returned your log. ${remarks ?? ''}`.trim(),
    })
    return row
  })
}

/** S6.5 — Instructor 2 confirms one Capstone 2 milestone (CAPSTONE2_MILESTONES key). */
export async function confirmMilestones(actor, _snap, projectId, milestone, note) {
  const { b, hat, actor: me } = authorizeOn(actor, projectId, 'confirmMilestones', { milestone })
  const { label } = CAPSTONE2_MILESTONES.find(m => m.key === milestone)
  return perform(`milestones:${projectId}:${milestone}`, async () => {
    const milestones = { ...milestoneStatus(b.project), [milestone]: { at: now(), by: me.id, note: note?.trim() ?? '' } }
    const complete = CAPSTONE2_MILESTONES.every(m => milestones[m.key])
    await db.update('projects', projectId, {
      milestones, ...(complete ? { milestonesConfirmedAt: now(), milestonesConfirmedBy: me.id } : {}),
    })
    await record({
      actor: me, hat, b, action: 'MILESTONE_CONFIRMED', entityType: 'projects', entityId: projectId,
      before: { milestone, confirmed: false }, after: { milestone, confirmed: true, allConfirmed: complete },
      note: `${label} milestone confirmed`,
    })
    if (complete) {
      await notify([...assigneeIds(b, P.ADVISER), ...memberIds(b)], {
        projectId, type: 'Milestones', event: 'Milestones confirmed',
        title: 'Capstone 2 milestones confirmed',
        body: `${me.name} confirmed the implementation milestones for ${b.project.title}: ${CAPSTONE2_MILESTONES.map(m => m.label.toLowerCase()).join(' and ')}.`,
      })
    }
  })
}

/**
 * S6.7 (NEW-43, flag I2_READINESS_CHECK) — Instructor 2 confirms, with the
 * Adviser, that the group is ready for final defense. FM-AAC-SOC-2005 waits on
 * it, so the Adviser is told.
 */
export async function confirmReadiness(actor, _snap, projectId, note) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'confirmReadiness')
  return perform(`readiness:${projectId}`, async () => {
    await db.update('projects', projectId, {
      readinessConfirmedAt: now(), readinessConfirmedBy: me.id, readinessNote: note?.trim() ?? '',
    })
    await record({
      actor: me, hat, b, action: 'READINESS_CONFIRMED', entityType: 'projects', entityId: projectId,
      before: { readyForFinalDefense: false }, after: { readyForFinalDefense: true },
      note: 'Confirmed readiness for final defense',
    })
    await notify(usersWith(snap, b, 'finaldefense.recommend').filter(id => id !== me.id), {
      projectId, type: 'Readiness', event: 'Ready for final defense',
      title: `${b.project.title} is ready for final defense`,
      body: `${me.name} confirmed the group’s readiness as ${hat}. You can submit ${FORMS.F2005.code} once its other requirements are met.`,
    })
  })
}

/**
 * S8.5 (NEW-44, flag POST_DEFENSE_REQUIREMENTS_STAGES) — Instructor 2 confirms
 * the post-defense course requirements. Record only: nothing waits on it, and
 * §3 lists no email; the group and the Adviser see it on the project.
 */
export async function confirmPostDefenseRequirements(actor, _snap, projectId, note) {
  const { b, hat, actor: me } = authorizeOn(actor, projectId, 'confirmPostDefenseRequirements')
  return perform(`postDefense:${projectId}`, async () => {
    await db.update('projects', projectId, {
      postDefenseConfirmedAt: now(), postDefenseConfirmedBy: me.id, postDefenseNote: note?.trim() ?? '',
    })
    await record({
      actor: me, hat, b, action: 'POST_DEFENSE_REQUIREMENTS_CONFIRMED', entityType: 'projects', entityId: projectId,
      before: { postDefenseRequirements: false }, after: { postDefenseRequirements: true },
      note: 'Post-defense course requirements confirmed',
    })
  })
}

// --- Defense, verdict, revision ----------------------------------------------

const DEFENSE_TYPE_AT = {
  PROPOSAL_DEFENSE_SCHEDULING: 'Proposal', PROPOSAL_DEFENSE: 'Proposal',
  FINAL_DEFENSE_SCHEDULING: 'Final', FINAL_DEFENSE: 'Final',
}
export const defenseTypeAt = (stage) => DEFENSE_TYPE_AT[stage] ?? null

/** Publishing the schedule is the gate out of a *_DEFENSE_SCHEDULING stage. */
export async function scheduleDefense(actor, _snap, projectId, input) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'scheduleDefense')
  const type = defenseTypeAt(b.project.currentStage)
  const gate = stageByKey(b.project.currentStage).gates[0]
  if (!gate?.handledIn) throw new Error('No defense is being scheduled at this stage.')
  const blocked = gate.requires(b, me)
  if (blocked) throw new Error(blocked)
  if (!input.scheduledAt || !input.venue) throw new Error('Set the date, time and venue.')

  return perform(`scheduleDefense:${projectId}:${b.project.currentStage}`, async () => {
    const row = await db.add('defenses', {
      projectId, type, scheduledAt: input.scheduledAt, venue: input.venue, instructions: input.instructions ?? '',
      createdBy: me.id, createdAt: now(),
      verdict: null, revisionClass: null, revisionDeadline: null, revisionStatus: null,
      recordedBy: null, recordedAt: null, remarks: '',
    })
    await logAudit({
      actorId: me.id, hat, action: 'DEFENSE_SCHEDULED', entityType: 'defenses', entityId: row.id, projectId,
      before: null, after: { type, scheduledAt: input.scheduledAt, venue: input.venue },
    })
    await summarizeForMilestone(me, hat, b, type)
    await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER), ...PANEL_ROLES.flatMap(r => assigneeIds(b, r))], {
      projectId, type: 'Defense scheduled', event: 'Defense scheduled',
      title: `${type} defense scheduled — ${b.project.title}`,
      body: `${new Date(input.scheduledAt).toLocaleString()} · ${input.venue}. ${input.instructions ?? ''}`.trim(),
    })
    await transition(me, hat, snap, b, resolveNext(gate, b), gate.action, gate.label)
    return row
  })
}

/**
 * What a verdict sets: the revision class and a countdown running from `from`
 * (the recording time). A Re-defense also carries required changes and a
 * countdown (NEW-41, flag REDEFENSE_REVISION_DAYS).
 */
function verdictTerms(verdict, snap, from = now()) {
  const revisionClass = verdict === VERDICTS.MAJOR ? 'Major' : verdict === VERDICTS.MINOR ? 'Minor' : 'Re-defense'
  const days = revisionDaysOf(snap)[revisionClass === 'Re-defense' ? FLAGS.REDEFENSE_REVISION_DAYS : revisionClass]
  return { revisionClass, revisionDeadline: new Date(new Date(from).getTime() + days * 864e5).toISOString() }
}

/**
 * FM-AAC-SOC-2004 lines: the Panel Chair signs on recording; for Minor/Major
 * the Adviser verifies next, then the Panel Members. A Re-defense is recorded
 * on the form by the Chair alone — its revisions go back to a defense, not to
 * the panel's signatures.
 */
function f2004Lines(b, chair, verdict) {
  const panel = (role, order) => assigneeIds(b, role).map(id => ({ order, role, userId: id, name: null, signedAt: null }))
  return [
    { order: 1, role: P.PANEL_CHAIR, userId: chair.id, name: chair.name, signedAt: now() },
    ...(verdict === VERDICTS.REDEFENSE ? [] : [...panel(P.ADVISER, 2), ...panel(P.PANEL_MEMBER, 3)]),
  ]
}

/** Panel Chair only. Recording the verdict opens the revision period and starts the countdown. */
export async function recordVerdict(actor, _snap, projectId, input) {
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'recordVerdict')
  const type = defenseTypeAt(b.project.currentStage)
  const defense = b.defenses.find(d => d.type === type && !d.verdict)
  if (!defense) throw new Error('There is no open defense to record a verdict for.')
  const notHeld = defenseNotHeld(defense)
  if (notHeld) throw new Error(notHeld)
  if (!Object.values(VERDICTS).includes(input.verdict)) throw new Error('Choose a verdict.')
  // FM-2004 records what the group must do: required text for every verdict.
  if (!input.remarks?.trim()) {
    throw new Error(input.verdict === VERDICTS.REDEFENSE ? 'Say why a re-defense is needed.' : 'Write the required revisions.')
  }
  // Countdown length as the System Administrator set it at the time of the verdict.
  const { revisionClass, revisionDeadline: deadline } = verdictTerms(input.verdict, snap)

  return perform(`verdict:${defense.id}`, async () => {
    await db.update('defenses', defense.id, {
      verdict: input.verdict, revisionClass, revisionDeadline: deadline, revisionStatus: 'Pending',
      recordedBy: me.id, recordedAt: now(), remarks: input.remarks.trim(),
    })
    await db.update('projects', projectId, { revisionClass, revisionDeadline: deadline, revisionStatus: 'Pending' })

    // The defense is over: private panel annotations are released (OQ#3 — who
    // may then read them is decided by the guard, canViewAnnotation).
    for (const a of b.annotations.filter(x => x.visibility === 'private' && !x.releasedAt)) {
      await db.update('annotations', a.id, { releasedAt: now() })
    }

    const signatories = f2004Lines(b, me, input.verdict)
    const form = await db.add('forms', {
      projectId, formType: FORMS.F2004.code, name: FORMS.F2004.name,
      status: signatories.every(x => x.signedAt) ? 'Signed' : 'Circulating', createdAt: now(),
      stage: type === 'Proposal' ? 'PROPOSAL_REVISION' : 'FINAL_REVISION',
      payload: { verdict: input.verdict, revisionClass, remarks: input.remarks.trim(), defenseType: type, defenseId: defense.id },
      signatories,
    })

    await logAudit({
      actorId: me.id, hat, action: 'VERDICT_RECORDED', entityType: 'defenses', entityId: defense.id, projectId,
      before: { verdict: null }, after: { verdict: input.verdict, revisionClass, revisionDeadline: deadline, form: form.id },
    })
    const redefense = input.verdict === VERDICTS.REDEFENSE
    await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER)], {
      projectId, type: redefense ? 'Re-defense' : 'Revision request',
      event: redefense ? 'Re-defense' : 'Revision requested',
      title: `${type} defense verdict: ${input.verdict}`,
      body: redefense
        ? `Make the required changes and upload the revised manuscript by ${new Date(deadline).toLocaleDateString()}. Once the Adviser approves it, the defense is scheduled again. ${input.remarks.trim()}`
        : `Revisions are due ${new Date(deadline).toLocaleDateString()}. ${input.remarks.trim()}`,
    })

    const gate = stageByKey(b.project.currentStage).gates[0]
    await transition(me, hat, snap, b, resolveNext(gate, bundle(current(), projectId)), gate.action, `Recorded verdict: ${input.verdict}`)
  })
}

/**
 * NEW-42 (flag VERDICT_CORRECTION_HOURS) — the Panel Chair corrects a recorded
 * verdict once, within the window, before anyone has acted on it. Every verdict
 * leads to the same revision stage, so only the terms change: class, countdown
 * (from the original recording time), FM-2004 and its lines. Audited before →
 * after with the reason; the group and the Adviser are emailed again.
 */
export async function correctVerdict(actor, _snap, projectId, input) {
  const defense = bundle(current(), projectId)?.defenses.find(d => d.id === input.defenseId)
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, 'correctVerdict', { defense })
  if (!Object.values(VERDICTS).includes(input.verdict)) throw new Error('Choose a verdict.')
  if (!input.remarks?.trim()) throw new Error(input.verdict === VERDICTS.REDEFENSE ? 'Say why a re-defense is needed.' : 'Write the required revisions.')
  if (!input.reason?.trim()) throw new Error('Say why the verdict is being corrected.')
  if (input.verdict === defense.verdict && input.remarks.trim() === defense.remarks) throw new Error('Nothing changed.')
  const terms = verdictTerms(input.verdict, snap, defense.recordedAt)

  return perform(`correctVerdict:${defense.id}`, async () => {
    const before = { verdict: defense.verdict, remarks: defense.remarks, revisionClass: defense.revisionClass, revisionDeadline: defense.revisionDeadline }
    await db.update('defenses', defense.id, {
      verdict: input.verdict, remarks: input.remarks.trim(), ...terms,
      correctedAt: now(), correctedBy: me.id, correctionReason: input.reason.trim(), previousVerdict: defense.verdict,
    })
    await db.update('projects', projectId, { revisionClass: terms.revisionClass, revisionDeadline: terms.revisionDeadline })
    const form = b.forms.find(f => f.formType === FORMS.F2004.code && f.payload?.defenseId === defense.id)
    if (form) {
      const signatories = f2004Lines(b, me, input.verdict)
      await db.update('forms', form.id, {
        signatories, status: signatories.every(x => x.signedAt) ? 'Signed' : 'Circulating',
        payload: { ...form.payload, verdict: input.verdict, revisionClass: terms.revisionClass, remarks: input.remarks.trim(), corrected: true },
      })
    }
    await record({
      actor: me, hat, b, action: 'VERDICT_CORRECTED', entityType: 'defenses', entityId: defense.id,
      before, after: { verdict: input.verdict, remarks: input.remarks.trim(), ...terms },
      meta: { reason: input.reason.trim() }, note: `Verdict corrected: ${defense.verdict} → ${input.verdict}`,
    })
    await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER)], {
      projectId, type: 'Verdict corrected', event: 'Verdict corrected',
      title: `${defense.type} defense verdict corrected: ${input.verdict}`,
      body: `${me.name} corrected the verdict (was ${defense.verdict}): ${input.reason.trim()}. Revisions are now due ${new Date(terms.revisionDeadline).toLocaleDateString()}. ${input.remarks.trim()}`,
    })
  })
}

/**
 * S8.2 — the system flags revisions whose countdown has run out. Run on load
 * and every minute by the app (a scheduled Cloud Function in the Firebase
 * build) and from the dev tools. Idempotent: only Pending revisions flip.
 */
export async function flagOverdueRevisions(at = Date.now()) {
  const snap = current()
  const due = (snap.defenses ?? []).filter(d =>
    d.revisionStatus === 'Pending' && d.revisionDeadline && new Date(d.revisionDeadline).getTime() < at)
  for (const d of due) {
    const b = bundle(snap, d.projectId)
    if (!b) continue
    await perform(`overdue:${d.id}`, async () => {
      await db.update('defenses', d.id, { revisionStatus: 'Overdue' })
      await db.update('projects', d.projectId, { revisionStatus: 'Overdue' })
      await logAudit({
        actorId: 'system', hat: 'System', action: 'REVISION_OVERDUE', entityType: 'defenses', entityId: d.id,
        projectId: d.projectId, before: { revisionStatus: 'Pending' }, after: { revisionStatus: 'Overdue' },
      })
      await logHistory({
        projectId: d.projectId, fromStage: b.project.currentStage, toStage: b.project.currentStage,
        actorId: 'system', hat: 'System', action: 'REVISION_OVERDUE', note: 'Revision deadline passed',
      })
      await notify([...memberIds(b), ...assigneeIds(b, P.ADVISER)], {
        projectId: d.projectId, type: 'Overdue revision', event: 'Overdue Revision',
        title: `Revisions overdue — ${b.project.title}`,
        body: `The ${d.type.toLowerCase()} defense revisions were due ${new Date(d.revisionDeadline).toLocaleDateString()}.`,
      })
    })
  }
  return due.length
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
    // Not explicit in the manuscript (flag URO_SIGNS_APPROVAL_SHEET).
    ...(FLAGS.URO_SIGNS_APPROVAL_SHEET ? [line(4, G.URO, holdersOf(snap, G.URO)[0]?.id ?? null, true)] : []),
    line(5, G.DEAN, holdersOf(snap, G.DEAN)[0]?.id ?? null, true),
    line(5, G.ASSOCIATE_DEAN, holdersOf(snap, G.ASSOCIATE_DEAN)[0]?.id ?? null, true),
  ]
}

/**
 * Issues a new Approval Sheet. `reissueOf` (NEW-46) voids the earlier sheet —
 * kept, with its signatures, as the record — and the Adviser is emailed only
 * once the group has uploaded what the URO returned (see submitDocument).
 */
async function issueApprovalSheet(actor, hat, snap, b, { reissueOf = null } = {}) {
  const signatories = approvalSheetSignatories(b, snap)
  if (reissueOf) await db.update('forms', reissueOf.id, { status: 'Void' })
  const form = await db.add('forms', {
    projectId: b.project.id, formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
    status: 'Circulating', createdAt: now(), stage: 'CLEARANCE',
    payload: reissueOf ? { reissueOf: reissueOf.id } : {}, signatories,
  })
  await logAudit({
    actorId: actor.id, hat, action: 'FORM_ISSUED', entityType: 'forms', entityId: form.id, projectId: b.project.id,
    before: reissueOf ? { formId: reissueOf.id, status: reissueOf.status } : null,
    after: { formType: FORMS.APPROVAL.code, ...(reissueOf ? { voided: reissueOf.id } : {}) },
  })
  if (reissueOf) return form
  await notify(signatories.filter(s => s.order === 1).map(s => s.userId), {
    projectId: b.project.id, type: 'Signature request', event: 'Approval Sheet to sign',
    title: 'Approval Sheet ready for your signature',
    body: `${b.project.title} has cleared post-defense revisions.`,
  })
  return form
}

async function writeSignature(actor, hat, form, lineMatch) {
  let signedRole = null
  const signatories = form.signatories.map(s => {
    if (signedRole || s.signedAt || !lineMatch(s)) return s
    signedRole = s.role
    return { ...s, userId: actor.id, name: actor.name, signedAt: now() }
  })
  if (!signedRole) throw new Error('You have no pending line on this form.')
  const complete = signatories.every(s => s.signedAt)
  await db.update('forms', form.id, { signatories, status: complete ? 'Signed' : 'Circulating' })
  await logAudit({
    actorId: actor.id, hat: hat ?? signedRole, action: 'SIGNATURE_APPLIED', entityType: 'forms', entityId: form.id,
    projectId: form.projectId, before: { line: signedRole, signed: false }, after: { line: signedRole, signed: true, formComplete: complete },
    meta: { formType: form.formType },
  })

  const open = signatories.filter(s => !s.signedAt)
  const nextOrder = open.length ? Math.min(...open.map(s => s.order)) : null
  const nextSigners = open.filter(s => s.order === nextOrder && !s.viaGate).map(s => s.userId)
  if (nextSigners.length) {
    await notify(nextSigners, {
      projectId: form.projectId, type: 'Signature request', event: `${form.formType} to sign`,
      title: `${form.formType} is ready for your signature`,
      body: `${actor.name} signed as ${signedRole}.`,
    })
  }
  return { signatories, complete, signedRole }
}

/** Traceable digital signature: signatory, role, timestamp and form. */
/** Revisions are verified: the defense's revision countdown is Completed and cleared from the project. */
async function completeRevisions(b, type) {
  for (const d of b.defenses.filter(x => x.type === type && ['Pending', 'Overdue'].includes(x.revisionStatus))) {
    await db.update('defenses', d.id, { revisionStatus: 'Completed' })
  }
  return { revisionClass: null, revisionDeadline: null, revisionStatus: null }
}

export async function signForm(actor, _snap, projectId, formId) {
  const form = await db.get('forms', formId) // read fresh — another signature may have landed
  if (!form || form.projectId !== projectId) throw new Error('Form not found')
  const { b, actor: me, snap } = authorizeOn(actor, projectId, 'signForm', { form })
  const line = form.signatories.find(s => s.userId === me.id && !s.signedAt)
  return perform(`signForm:${formId}:${me.id}`, async () => {
    const r = await writeSignature(me, line.role, form, s => s.userId === me.id && s.order === line.order)
    await logHistory({
      projectId, fromStage: b.project.currentStage, toStage: b.project.currentStage, actorId: me.id,
      hat: r.signedRole, action: 'SIGNATURE_APPLIED', note: `Signed ${form.formType} as ${r.signedRole}`,
    })
    // S9.3b — once the whole panel has signed, the next line is the Program
    // Chair/Coordinator's endorsement, signed through a workflow step: email them.
    const open = r.signatories.filter(x => !x.signedAt)
    const nextOrder = open.length ? Math.min(...open.map(x => x.order)) : null
    const nextViaGate = open.filter(x => x.order === nextOrder && x.viaGate).map(x => x.userId)
    if (nextViaGate.length && nextViaGate.length === open.filter(x => x.order === nextOrder).length) {
      await notify(nextViaGate, {
        projectId, type: 'Endorsement request', event: `${form.formType} to endorse`,
        title: `${b.project.title}: the ${form.formType} is ready for your endorsement`,
        body: `${me.name} signed as ${r.signedRole}. Every earlier signature is in.`,
      })
    }
    const f2004 = form.formType === FORMS.F2004.code && r.complete
    // S8.4 — the last FM-2004 signature after the final defense completes the
    // revisions and opens clearance; the Approval Sheet is issued to the Adviser.
    if (f2004 && form.payload?.defenseType === 'Final' && b.project.currentStage === 'FINAL_REVISION') {
      await db.update('projects', projectId, await completeRevisions(b, 'Final'))
      await issueApprovalSheet(me, r.signedRole, snap, b)
      const gate = stageByKey('FINAL_REVISION').gates[0]
      await transition(me, r.signedRole, snap, b, gate.next, gate.action, `Revisions verified; ${FORMS.F2004.code} fully signed`)
    }
    // S5.7 → S5.8 — the proposal revisions are complete once FM-2004 is fully
    // signed: the countdown stops here, not when Instructor 1 routes the group.
    // Instructor 1 is told the group can move on.
    if (f2004 && form.payload?.defenseType === 'Proposal' && b.project.currentStage === 'PROPOSAL_REVISION') {
      await db.update('projects', projectId, await completeRevisions(b, 'Proposal'))
      await notify(usersWith(snap, b, 'revision.close').filter(id => id !== me.id), {
        projectId, type: 'Revisions verified', event: 'Revisions verified',
        title: `${b.project.title}: ${FORMS.F2004.code} is fully signed`,
        body: `The panel has verified the proposal revisions. You can move the group on to Capstone 2.`,
      })
    }
    return r
  })
}

// --- Stage gates ---------------------------------------------------------------

export async function runGate(actor, _snap, projectId, requested) {
  const gate = { action: requested?.action }
  const { b, hat, actor: me, snap } = authorizeOn(actor, projectId, gate.action)
  // The gate object comes from the caller; only its name is trusted.
  const liveGate = (stageByKey(b.project.currentStage)?.gates ?? []).find(g => g.action === gate.action)
  if (!liveGate || (liveGate.applies && !liveGate.applies(b))) throw new Error('That step does not belong to the project’s current stage.')
  Object.assign(gate, liveGate)
  if (liveGate.handledIn) throw new Error(`This step is completed from the ${liveGate.handledIn === 'defense' ? 'Defense' : 'Documents'} tab.`)
  if (liveGate.done?.(b)) throw new Error('That step has already been completed.')
  const blocked = liveGate.requires(b, me)
  if (blocked) throw new Error(blocked)

  return perform(`gate:${projectId}:${gate.action}:${me.id}`, async () => {
    const patch = {}

    if (gate.action === 'ROUTE_ADVISER') {
      patch.adviserApprovals = {}
      // NEW-5: record which approving offices the named Adviser holds; that office sits this one out.
      const adviser = (snap.users ?? []).find(u => u.id === assigneeIds(b, P.ADVISER)[0])
      patch.adviserOffices = ADVISER_APPROVERS.filter(r => (adviser?.globalRoles ?? []).includes(r))
    }

    // NEW-7 (flag ADVISER_APPROVAL): each office records its approval; the
    // project moves on once the required approvals are in.
    if (gate.action === 'APPROVE_ADVISER') {
      const approvals = { ...(b.project.adviserApprovals ?? {}), [hat]: { userId: me.id, at: now() } }
      await db.update('projects', projectId, { adviserApprovals: approvals })
      const done = adviserApprovalComplete({ ...b, project: { ...b.project, adviserApprovals: approvals } })
      if (!done) {
        await record({
          actor: me, hat, b, action: 'ADVISER_APPROVAL_RECORDED', entityType: 'projects', entityId: projectId,
          before: { adviserApprovals: b.project.adviserApprovals ?? {} }, after: { adviserApprovals: approvals },
          note: `Adviser assignment approved by the ${hat}`,
        })
        const others = requiredAdviserApprovers(b).filter(r => !approvals[r]).flatMap(r => holdersOf(snap, r).map(u => u.id))
        await notify(others, {
          projectId, type: 'Approval request', event: 'Adviser assignment to approve',
          title: `${b.project.title}: adviser assignment awaits your approval`,
          body: `${me.name} approved as ${hat}.`,
        })
        return b.project.currentStage
      }
    }

    if (gate.action === 'REGISTER_TOPIC') {
      const topic = b.documents.find(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED)
      const chosen = b.reviews.filter(r => r.documentId === topic.id && r.approvedTopic).at(-1)?.approvedTopic
      patch.title = chosen ?? topic.title.replace(/^Proposed Topic:\s*/i, '')
      patch.previousTitles = [...(b.project.previousTitles ?? []), b.project.title]
      patch.topicRegisteredAt = now()
      patch.topicRegisteredBy = me.id
    }

    if (gate.action === 'CLOSE_PROPOSAL_REVISION') Object.assign(patch, await completeRevisions(b, 'Proposal'))

    if (gate.action === 'RECOMMEND_FINAL_DEFENSE') {
      const form = await db.add('forms', {
        projectId, formType: FORMS.F2005.code, name: FORMS.F2005.name,
        status: 'Signed', createdAt: now(), stage: null, payload: {},
        signatories: [{ order: 1, role: P.ADVISER, userId: me.id, name: me.name, signedAt: now() }],
      })
      await logAudit({
        actorId: me.id, hat, action: 'FORM_SUBMITTED', entityType: 'forms', entityId: form.id, projectId,
        before: null, after: { formType: FORMS.F2005.code },
      })
    }

    // Gates that carry a signature sign the actor's office line on the form.
    if (gate.signs) {
      const form = await db.get('forms', formOf(b, gate.signs)?.id)
      if (!form) throw new Error(`The ${gate.signs} has not been issued.`)
      const { complete } = await writeSignature(me, hat, form, s => s.viaGate && s.role === hat)

      if (gate.action === 'FINAL_APPROVE' && !complete) {
        // The other executive still has to sign; the project stays here.
        await record({
          actor: me, hat, b, action: 'FINAL_APPROVAL_SIGNED', entityType: 'projects', entityId: projectId,
          before: { signed: false }, after: { signed: true }, note: `Approval Sheet signed as ${hat}`,
        })
        const other = form.signatories.filter(s => s.order === 5 && s.role !== hat).map(s => s.userId)
        await notify(other, {
          projectId, type: 'Signature request', event: 'Final approval',
          title: `${b.project.title} awaits your final approval`,
          body: `${me.name} signed the Approval Sheet as ${hat}.`,
        })
        return b.project.currentStage
      }
    }

    // S9.4 — what the URO verified is marked Approved.
    if (gate.action === 'URO_VERIFY') {
      for (const d of [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT].map(t => latestOf(b, t)).filter(Boolean)) {
        await db.update('documents', d.id, { status: DOC_STATUS.APPROVED })
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

    // A gate that stays at its stage (S3.4 registration) is recorded, not a transition.
    if (staysAtStage(liveGate)) {
      await record({
        actor: me, hat, b, action: gate.action, entityType: 'projects', entityId: projectId,
        before: { title: b.project.title }, after: { title: patch.title ?? b.project.title },
        note: gate.action === 'REGISTER_TOPIC' ? `Registered the title “${patch.title}”` : gate.label,
      })
      return b.project.currentStage
    }

    // S2.2 — the students' email is "adviser appointed", naming the Adviser.
    const adviserName = gate.action === 'APPROVE_ADVISER'
      ? (snap.users ?? []).find(u => u.id === assigneeIds(b, P.ADVISER)[0])?.name : null
    const announce = adviserName ? {
      type: 'Adviser appointed', event: 'Adviser appointed',
      title: `${adviserName} is the Adviser of ${b.project.title}`,
      body: `${me.name} completed the approval of the adviser assignment. The group can now submit its proposed topics.`,
    // S9.4 — the Dean and AD's email is "fully cleared project endorsed".
    } : gate.action === 'URO_VERIFY' ? {
      type: 'Clearance', event: 'Fully cleared project endorsed',
      title: `${b.project.title} is cleared for final approval`,
      body: `${me.name} verified the Editor’s Certificate, the Plagiarism Clearance Certificate and the manuscript, and signed the Approval Sheet for the University Research Office.`,
    } : null
    return transition(me, hat, snap, b, resolveNext(liveGate, b), gate.action, gate.label, announce)
  })
}

// --- Accounts ------------------------------------------------------------------

const token = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`

/**
 * S0.1 — domain-restricted registration. The account starts Inactive and
 * unverified; the verification email (dev outbox) carries the approval button.
 * No OTP.
 */
export async function registerAccount(_snap, input) {
  const email = normalizeEmail(input.email)
  const type = accountType(email)
  if (!type) throw new Error('Registration is restricted to @hau.edu.ph and @student.hau.edu.ph addresses.')
  if (!input.name?.trim()) throw new Error('Enter your full name.')
  if ((current().users ?? []).some(u => normalizeEmail(u.email) === email)) {
    throw new Error('That address already has an account. Sign in instead.')
  }
  // A student's section places them on a roster: it must name their program
  // and a year in which that program takes a capstone course (WD-401, CS-301).
  const section = type === 'Student' ? normalizeSection(input.block) : ''
  const program = type === 'Student' ? (input.program || parseSection(section)?.program || '') : (input.program ?? '')
  if (type === 'Student') {
    const problem = sectionProblem(section, program)
    if (problem) throw new Error(problem)
  }
  return perform(`register:${email}`, async () => {
    const verifyToken = token()
    const user = await db.add('users', {
      name: input.name.trim(), email, idNumber: input.idNumber?.trim() ?? '',
      program, yearLevel: type === 'Student' ? yearLevelOf(section) : '',
      block: section,
      status: ACCOUNT_STATUS.INACTIVE, emailVerified: false, globalRoles: [], programScope: [],
      verifyToken,
    })
    await logAudit({
      actorId: user.id, hat: null, action: 'ACCOUNT_REGISTERED', entityType: 'users', entityId: user.id,
      before: null, after: { email, status: ACCOUNT_STATUS.INACTIVE, emailVerified: false },
    })
    await sendMail({
      to: [email], event: 'Account verification',
      subject: 'Verify your HAU-SOC Thesis & Capstone account',
      body: `Hello ${user.name}, confirm that ${email} is yours to finish registering.`,
      link: { kind: 'verify', token: verifyToken, label: 'Verify my email' },
    })
    return user
  })
}

/** Initial Global Roles from the registration domain (authTriggers.js, inferred). */
const initialRoles = (email) => accountType(email) === 'Student'
  ? [G.STUDENT]
  : FLAGS.FACULTY_BASE_IDENTITY ? [G.FACULTY] : []

async function markVerified(user, via) {
  const status = FLAGS.ACCOUNT_ACTIVATION === 'email' ? ACCOUNT_STATUS.ACTIVE : user.status
  const globalRoles = user.globalRoles?.length ? user.globalRoles : initialRoles(user.email)
  await db.update('users', user.id, { emailVerified: true, verifyToken: null, status, globalRoles })
  await logAudit({
    actorId: user.id, hat: null, action: 'EMAIL_VERIFIED', entityType: 'users', entityId: user.id,
    before: { emailVerified: false, status: user.status, globalRoles: user.globalRoles ?? [] },
    after: { emailVerified: true, status, globalRoles }, meta: { via },
  })
}

/** S0.2 — the approval button in the verification email. */
export async function verifyEmail(verifyToken) {
  const user = (current().users ?? []).find(u => u.verifyToken && u.verifyToken === verifyToken)
  if (!user) throw new Error('This verification link is invalid or has already been used.')
  return perform(`verify:${user.id}`, () => markVerified(user, 'verification link'))
}

/** Firebase build: Firebase Auth reports the address verified at sign-in. */
export async function confirmProviderVerification(email) {
  const user = (current().users ?? []).find(u => normalizeEmail(u.email) === normalizeEmail(email))
  if (!user || user.emailVerified) return user ?? null
  await perform(`verify:${user.id}`, () => markVerified(user, 'Firebase Auth'))
  return (current().users ?? []).find(u => u.id === user.id)
}

export async function setGlobalRoles(actor, _snap, userId, globalRoles) {
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'admin.accounts')
  const user = (snap.users ?? []).find(u => u.id === userId)
  if (!user) throw new Error('Account not found.')
  const type = accountType(user.email)
  if (globalRoles.includes(G.STUDENT) && type !== 'Student') throw new Error('Only student accounts can hold the Student role.')
  if (type === 'Student' && globalRoles.some(r => r !== G.STUDENT)) throw new Error('Student accounts cannot hold faculty or office roles.')
  if (userId === me.id && !globalRoles.includes(G.ADMIN)) throw new Error('You cannot remove your own System Administrator role.')
  return perform(`roles:${userId}`, async () => {
    await db.update('users', userId, { globalRoles })
    await logAudit({
      actorId: me.id, hat, action: 'GLOBAL_ROLES_CHANGED', entityType: 'users', entityId: userId,
      before: { globalRoles: user.globalRoles ?? [] }, after: { globalRoles },
    })
  })
}

export async function setAccountStatus(actor, _snap, userId, status) {
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'admin.accounts')
  if (userId === me.id) throw new Error('You cannot change your own account status.')
  const user = (snap.users ?? []).find(u => u.id === userId)
  if (!user) throw new Error('Account not found.')
  if (!Object.values(ACCOUNT_STATUS).includes(status)) throw new Error('Unknown status.')
  if (status === ACCOUNT_STATUS.ACTIVE && !user.emailVerified) {
    throw new Error('The owner has not verified this email address yet (S0.2).')
  }
  return perform(`status:${userId}`, async () => {
    await db.update('users', userId, { status })
    await logAudit({
      actorId: me.id, hat, action: 'ACCOUNT_STATUS_CHANGED', entityType: 'users', entityId: userId,
      before: { status: user.status }, after: { status },
    })
  })
}

/**
 * A Program Chair/Coordinator acts only on projects in the programs they
 * coordinate (caac.js `inScope`), so the role means nothing until a scope is set.
 */
export async function setProgramScope(actor, _snap, userId, programScope) {
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'admin.accounts')
  const user = (snap.users ?? []).find(u => u.id === userId)
  if (!user) throw new Error('Account not found.')
  if (!(user.globalRoles ?? []).includes(G.COORDINATOR)) {
    throw new Error('Program scope applies only to a Program Chair/Coordinator.')
  }
  const unknown = programScope.filter(p => !PROGRAMS.includes(p))
  if (unknown.length) throw new Error(`Unknown program: ${unknown.join(', ')}.`)
  const next = [...new Set(programScope)]
  return perform(`scope:${userId}`, async () => {
    await db.update('users', userId, { programScope: next })
    await logAudit({
      actorId: me.id, hat, action: 'PROGRAM_SCOPE_CHANGED', entityType: 'users', entityId: userId,
      before: { programScope: user.programScope ?? [] }, after: { programScope: next },
    })
  })
}

// --- Permission overrides (flag PERMISSION_OVERRIDES = 'deny-only') -------------

/**
 * Revoke one capability from one user, on one project or everywhere. The
 * override can only take a permission away; the guard (caac.js `evaluate`)
 * treats the capability as not granted until the override is lifted.
 */
export async function revokeCapability(actor, _snap, { userId, capability, projectId = null, reason }) {
  if (FLAGS.PERMISSION_OVERRIDES !== 'deny-only') throw new Error('Permission overrides are turned off.')
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'admin.caac')
  const user = (snap.users ?? []).find(u => u.id === userId)
  if (!user) throw new Error('Account not found.')
  if (userId === me.id) throw new Error('You cannot apply an override to your own account.')
  if (!CAPABILITIES[capability]) throw new Error('Unknown capability.')
  if (projectId && !(snap.projects ?? []).some(p => p.id === projectId)) throw new Error('Project not found.')
  if (projectId && !PROJECT_POLICIES.some(p => p.cap === capability)) {
    throw new Error('That capability does not belong to a project — revoke it on every project.')
  }
  if (!reason?.trim()) throw new Error('Give the reason for the override.')
  const duplicate = (snap.permissionOverrides ?? []).some(o =>
    o.userId === userId && o.capability === capability && !o.liftedAt && (o.projectId ?? null) === (projectId ?? null))
  if (duplicate) throw new Error('That capability is already revoked for this account in this scope.')

  const scope = projectId ?? 'all projects'
  return perform(`override:${userId}:${capability}:${scope}`, async () => {
    const row = await db.add('permissionOverrides', {
      userId, capability, projectId: projectId ?? null, effect: 'deny', reason: reason.trim(),
      createdBy: me.id, createdAt: now(), liftedAt: null, liftedBy: null,
    })
    await logAudit({
      actorId: me.id, hat, action: 'PERMISSION_OVERRIDE_APPLIED', entityType: 'permissionOverrides', entityId: row.id,
      projectId: projectId ?? null,
      before: { userId, capability, scope, effect: 'as the policies decide' },
      after: { userId, capability, scope, effect: 'revoked' },
      meta: { reason: row.reason },
    })
    return row
  })
}

export async function liftOverride(actor, _snap, overrideId) {
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'admin.caac')
  const row = (snap.permissionOverrides ?? []).find(o => o.id === overrideId)
  if (!row) throw new Error('Override not found.')
  if (row.liftedAt) throw new Error('That override was already lifted.')
  const scope = row.projectId ?? 'all projects'
  return perform(`liftOverride:${overrideId}`, async () => {
    await db.update('permissionOverrides', overrideId, { liftedAt: now(), liftedBy: me.id })
    await logAudit({
      actorId: me.id, hat, action: 'PERMISSION_OVERRIDE_LIFTED', entityType: 'permissionOverrides', entityId: overrideId,
      projectId: row.projectId ?? null,
      before: { userId: row.userId, capability: row.capability, scope, effect: 'revoked' },
      after: { userId: row.userId, capability: row.capability, scope, effect: 'as the policies decide' },
    })
  })
}

// --- Global settings -------------------------------------------------------------

/**
 * Revision countdown length (S7.6 "configurable"). recordVerdict reads it when
 * the verdict is recorded; countdowns already running keep their deadline.
 */
export async function updateRevisionDays(actor, _snap, input) {
  const { actor: me, snap, hat } = authorizeInstitution(actor, 'settings.manage')
  const { min, max } = REVISION_DAYS_LIMITS
  const next = {}
  for (const k of ['Minor', 'Major']) {
    const n = Number(input?.[k])
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${k} revisions: enter a whole number of days from ${min} to ${max}.`)
    next[k] = n
  }
  const before = revisionDaysOf(snap)
  if (before.Minor === next.Minor && before.Major === next.Major) throw new Error('Nothing changed.')
  return perform('settings:revisionDays', async () => {
    const existing = await db.get('settings', SETTINGS_ID)
    const patch = { revisionDays: next, updatedBy: me.id, updatedAt: now() }
    if (existing) await db.update('settings', SETTINGS_ID, patch)
    else await db.add('settings', { id: SETTINGS_ID, ...patch })
    await logAudit({
      actorId: me.id, hat, action: 'SETTINGS_CHANGED', entityType: 'settings', entityId: SETTINGS_ID,
      before: { revisionDays: before }, after: { revisionDays: next },
    })
  })
}

/** UI-side check for a single action, used by components that need a reason string. */
export const check = (user, action, projectId, target) => canDo(user, action, bundle(current(), projectId), target)
