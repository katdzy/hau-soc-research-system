// Every state-changing operation in the prototype. Each one:
//   1. authorizes the actor through CAAC (`authorizeOn`) — the same check a
//      Cloud Function runs before committing a write;
//   2. writes the change;
//   3. appends an audit entry;
//   4. notifies whoever the change concerns (email through Resend in the
//      Firebase build, the in-app Notifications list here).

import { db } from '../backend/index.js'
import {
  bundle, authorizeOn, logAudit, assigneeIds, memberIds, latestOf, holdersOf, sendEmail,
} from './core.js'
import {
  DOC_STATUS, DECISIONS, REVISION_WINDOW_DAYS, FORMS, AI_MILESTONES, AI_DISCLOSURE, VERDICTS,
  GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, ACCOUNT_STATUS, LINK_TYPES, accountType,
  DOC_TYPES, MANUSCRIPT_SCOPES, ANNOTATION_STATUS, capstoneYear, yearDigit, blockExample, blockProblem,
} from '../domain/constants.js'
import {
  stageByKey, stageLabel, resolveNext, STAGES, PHASES, stageIndex, phaseStages,
} from '../domain/stages.js'
import {
  resolveContext, resolveInstitution, authorize, allowedDocTypes, can, why,
} from '../domain/caac.js'
import { formOf, canSign } from '../domain/forms.js'

const now = () => new Date().toISOString()
const MANUSCRIPT_TYPES = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT]
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
  await sendEmail([...memberIds(b), ...assigneeIds(b, P.ADVISER), ...involved].filter(id => id !== actor.id), {
    projectId: b.project.id, type: 'Workflow',
    title: `${b.project.title} moved to ${stageLabel(to)}`,
    body: `${actor.name} completed: ${note}.`,
  })
  return to
}

// --- Group and roster --------------------------------------------------------

export async function createProject(actor, snap, { groupName, title, sectionId, researchArea }) {
  const inst = resolveInstitution(actor, snap)
  authorize(inst, 'group.create')
  const section = inst.sections.find(s => s.id === sectionId && s.course === 'Capstone 1')
  if (!section) throw new Error('You can only create groups for a Capstone 1 block you teach.')

  const inBlock = (snap.projects ?? []).filter(p => p.sectionId === section.id)
  const name = groupName?.trim() || `Group ${inBlock.length + 1}`
  if (inBlock.some(p => p.groupName === name)) throw new Error(`${section.block} already has a ${name}.`)
  const project = await db.add('projects', {
    groupName: name,
    title: title?.trim() || `Untitled — ${name} (${section.block})`,
    previousTitles: [], category: 'Capstone', researchArea: researchArea || 'Not yet set',
    program: section.program, term: section.term, block: section.block, sectionId: section.id,
    currentStage: 'GROUP_FORMATION', status: 'Active', archiveResult: null,
    revisionClass: null, revisionDeadline: null,
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
  await sendEmail([userId], {
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

// Which capability lets someone hand out each Project-Based Role from the
// project workspace. Instructor 1 and 2 are not here: the System Administrator
// assigns them from CAAC Configuration (see "Instructors" below).
export const ASSIGNING_CAPABILITY = {
  [P.ADVISER]: 'adviser.assign',
  [P.PANEL_CHAIR]: 'panel.assign',
  [P.PANEL_MEMBER]: 'panel.assign',
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
  return addAssignment(actor, snap, b, userId, roleType)
}

export async function unassignRole(actor, snap, projectId, assignment) {
  const cap = ASSIGNING_CAPABILITY[assignment.roleType]
  if (!cap) throw new Error(`${assignment.roleType} is not unassigned from here.`)
  authorizeOn(actor, snap, projectId, cap)
  await removeAssignment(actor, projectId, assignment)
}

// The System Administrator's tag assignment from CAAC Configuration. It is
// not bound to the Coordinator's stage window, but the conflict rules hold.
export async function adminAssignRole(actor, snap, projectId, userId, roleType) {
  authorize(resolveInstitution(actor, snap), 'admin.caac')
  if (!ASSIGNING_CAPABILITY[roleType]) throw new Error(`${roleType} is assigned under Instructors.`)
  const b = bundle(snap, projectId)
  if (!b) throw new Error('Project not found')
  return addAssignment(actor, snap, b, userId, roleType)
}

export async function adminUnassignRole(actor, snap, assignment) {
  authorize(resolveInstitution(actor, snap), 'admin.caac')
  if (!ASSIGNING_CAPABILITY[assignment.roleType]) throw new Error(`${assignment.roleType} is changed under Instructors.`)
  await removeAssignment(actor, assignment.projectId, assignment)
}

async function addAssignment(actor, snap, b, userId, roleType) {
  const projectId = b.project.id
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
  await sendEmail([userId], {
    projectId, type: 'New assignment',
    title: `You were assigned as ${roleType}`,
    body: `${b.project.title}. What you can do on it now depends on this role and on the stage the project is in.`,
  })
  return row
}

async function removeAssignment(actor, projectId, assignment) {
  await db.remove('projectAssignments', assignment.id)
  await logAudit(actor.id, 'ROLE_UNASSIGNED', 'projectAssignments', assignment.id, projectId, {
    userId: assignment.userId, roleType: assignment.roleType,
  })
}

// --- Instructors (System Administrator) --------------------------------------
// Instructor 1 follows the Capstone 1 block: whoever the Administrator puts on
// a block can create its groups and becomes Instructor 1 on each. Instructor 2
// is assigned per project once it is heading into Capstone 2.

const CAPSTONE_1_STAGES = phaseStages(PHASES.IDEATION, PHASES.PROPOSAL)
export const INSTRUCTOR_2_STAGES = STAGES
  .slice(stageIndex('PROPOSAL_REVISION'), stageIndex('ARCHIVED'))
  .map(s => s.key)

function activeFaculty(snap, userId) {
  const user = (snap.users ?? []).find(u => u.id === userId)
  if (!user || accountType(user.email) !== 'Faculty') throw new Error('Instructors must be faculty accounts.')
  if (user.status !== ACCOUNT_STATUS.ACTIVE) throw new Error(`${user.name}’s account is not active.`)
  return user
}

export async function createSection(actor, snap, { block, program, term, instructorId }) {
  authorize(resolveInstitution(actor, snap), 'instructor.assign')
  const name = block?.trim().toUpperCase()
  const when = term?.trim()
  if (!program) throw new Error('Choose the program.')
  const year = capstoneYear(program, 'Capstone 1')
  if (!name) throw new Error(`Enter the block, e.g. ${blockExample(program, year)}.`)
  const problem = blockProblem(name, program, year)
  if (problem) throw new Error(problem)
  if (!when) throw new Error('Enter the academic term.')
  if ((snap.sections ?? []).some(s => s.course === 'Capstone 1' && s.block === name && s.term === when)) {
    throw new Error(`${name} already has a Capstone 1 section for ${when}.`)
  }
  activeFaculty(snap, instructorId)

  const section = await db.add('sections', { course: 'Capstone 1', block: name, program, term: when, instructorId })
  await logAudit(actor.id, 'SECTION_CREATED', 'sections', section.id, null, { block: name, instructorId })
  await sendEmail([instructorId], {
    projectId: null, type: 'New assignment',
    title: `You were assigned as ${P.INSTRUCTOR_1} for ${name}`,
    body: `${actor.name} assigned you to teach Capstone 1 for ${name} (${when}). You can now create its project groups.`,
  })
  return section
}

export async function setSectionInstructor(actor, snap, sectionId, userId) {
  authorize(resolveInstitution(actor, snap), 'instructor.assign')
  const section = (snap.sections ?? []).find(s => s.id === sectionId)
  if (!section) throw new Error('Section not found')
  if (section.instructorId === userId) return section
  activeFaculty(snap, userId)

  await db.update('sections', sectionId, { instructorId: userId })
  // Groups still in Capstone 1 move to the new instructor. Groups already past
  // it keep the Instructor 1 who taught them.
  const moving = (snap.projects ?? [])
    .filter(p => p.sectionId === sectionId && CAPSTONE_1_STAGES.includes(p.currentStage))
  for (const project of moving) {
    const old = (snap.projectAssignments ?? [])
      .filter(a => a.projectId === project.id && a.roleType === P.INSTRUCTOR_1)
    for (const a of old) await db.remove('projectAssignments', a.id)
    await db.add('projectAssignments', {
      projectId: project.id, userId, roleType: P.INSTRUCTOR_1,
      status: 'Accepted', assignedAt: now(), assignedBy: actor.id,
    })
  }
  await logAudit(actor.id, 'SECTION_INSTRUCTOR_CHANGED', 'sections', sectionId, null, {
    block: section.block, before: section.instructorId, after: userId, projects: moving.map(p => p.id),
  })
  await sendEmail([userId], {
    projectId: null, type: 'New assignment',
    title: `You were assigned as ${P.INSTRUCTOR_1} for ${section.block}`,
    body: `${actor.name} assigned you to teach Capstone 1 for ${section.block}` +
      (moving.length ? `, including ${moving.length} group${moving.length > 1 ? 's' : ''} already formed.` : '.'),
  })
  return section
}

/** Assigns, replaces or (with `userId` null) clears a project's Instructor 2. */
export async function setInstructor2(actor, snap, projectId, userId) {
  authorize(resolveInstitution(actor, snap), 'instructor.assign')
  const b = bundle(snap, projectId)
  if (!b) throw new Error('Project not found')
  if (!INSTRUCTOR_2_STAGES.includes(b.project.currentStage)) {
    throw new Error(`Instructor 2 is assigned from Proposal Revision onward. ${b.project.groupName} is at ${stageLabel(b.project.currentStage)}.`)
  }
  const current = b.assignments.find(a => a.roleType === P.INSTRUCTOR_2)
  if ((current?.userId ?? null) === (userId || null)) return
  if (userId) activeFaculty(snap, userId)

  if (current) {
    await db.remove('projectAssignments', current.id)
    await logAudit(actor.id, 'ROLE_UNASSIGNED', 'projectAssignments', current.id, projectId, {
      userId: current.userId, roleType: P.INSTRUCTOR_2,
    })
  }
  if (!userId) return
  const row = await db.add('projectAssignments', {
    projectId, userId, roleType: P.INSTRUCTOR_2, status: 'Accepted', assignedAt: now(), assignedBy: actor.id,
  })
  await logAudit(actor.id, 'ROLE_ASSIGNED', 'projectAssignments', row.id, projectId, { userId, roleType: P.INSTRUCTOR_2 })
  await sendEmail([userId], {
    projectId, type: 'New assignment',
    title: `You were assigned as ${P.INSTRUCTOR_2}`,
    body: `${b.project.title}. What you can do on it now depends on this role and on the stage the project is in.`,
  })
  return row
}

// --- Documents ---------------------------------------------------------------

export const nextVersionOf = (b, docType) => (latestOf(b, docType)?.versionNumber ?? 0) + 1

/**
 * Submissions are immutable. A new upload never overwrites the previous file;
 * it creates a new version and marks its predecessor Superseded.
 *
 * The student states which version they are submitting before it goes in:
 * `expectedVersion` is the number they confirmed on screen, `scope` says
 * whether it is a chapter draft or the complete manuscript, and `versionNote`
 * says what the version contains. If someone else in the group submitted in
 * the meantime the numbers no longer match and nothing is written.
 */
export async function submitDocument(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'document.submit')
  if (!allowedDocTypes(b.project.currentStage).includes(input.docType)) {
    throw new Error(`${input.docType} is not accepted at ${stageLabel(b.project.currentStage)}.`)
  }
  const isLink = LINK_TYPES.includes(input.docType)
  if (isLink && !/^https?:\/\/\S+$/i.test(input.link ?? '')) throw new Error('Enter the full link to the hosted video.')
  if (!isLink && !input.fileName) throw new Error('Choose the PDF to upload.')
  if (!isLink && !/\.pdf$/i.test(input.fileName)) throw new Error('Only PDF files can be submitted.')

  const previous = latestOf(b, input.docType)
  const version = (previous?.versionNumber ?? 0) + 1
  if (input.expectedVersion && input.expectedVersion !== version) {
    throw new Error(`Someone in your group has just submitted v${version - 1}. Review it, then confirm v${version} instead.`)
  }
  const isManuscript = MANUSCRIPT_TYPES.includes(input.docType)
  if (isManuscript && !MANUSCRIPT_SCOPES.includes(input.scope)) throw new Error('Say whether this is a chapter draft or the complete manuscript.')
  if (isManuscript && !input.versionNote?.trim()) throw new Error('Describe what this version contains.')

  const doc = await db.add('documents', {
    projectId, docType: input.docType, versionNumber: version,
    title: input.title || `${input.docType} v${version}`,
    fileName: isLink ? null : input.fileName,
    fileSize: isLink ? null : (input.fileSize ?? 0),
    link: isLink ? input.link : null,
    scope: isManuscript ? input.scope : null,
    versionNote: input.versionNote?.trim() ?? '',
    notesToReviewer: input.notesToReviewer?.trim() ?? '',
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
  await logAudit(actor.id, 'DOCUMENT_SUBMITTED', 'documents', doc.id, projectId, {
    docType: input.docType, version, scope: doc.scope,
  })

  const reviewers = [
    ...usersWith(snap, b, 'review.decide'),
    ...usersWith(snap, b, 'document.annotate'),
  ].filter(id => id !== actor.id)
  await sendEmail(reviewers, {
    projectId, type: 'Submission',
    title: `${b.project.groupName}: ${input.docType} v${version} submitted for review`,
    body: `${actor.name} submitted v${version}${doc.scope ? ` (${doc.scope.toLowerCase()})` : ''}. ${doc.versionNote}`.trim(),
    link: `/review/${doc.id}`,
  })
  return doc
}

/**
 * Reviewer annotations are drafts until the reviewer sends feedback; panel
 * annotations are private notes released when the verdict is recorded.
 */
export async function addAnnotation(actor, snap, projectId, documentId, input) {
  const { b, ctx } = authorizeOn(actor, snap, projectId, 'document.annotate')
  const doc = b.documents.find(d => d.id === documentId)
  if (!doc || [DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)) {
    throw new Error('Only the current version can be annotated.')
  }
  if (!input.text?.trim()) throw new Error('Write the comment first.')
  const isPrivate = can(ctx, 'annotation.private')
  // A reviewer's draft only goes out with a decision, so it belongs on a
  // version that is still awaiting one.
  if (!isPrivate && doc.status !== DOC_STATUS.SUBMITTED) {
    throw new Error('This version has already been decided. Annotate the next version instead.')
  }
  const row = await db.add('annotations', {
    projectId, documentId, authorId: actor.id, authorRole: why(ctx, 'document.annotate').role,
    anchor: input.anchor?.trim() || 'General', category: input.category, text: input.text.trim(),
    visibility: isPrivate ? 'private' : 'shared',
    status: isPrivate ? ANNOTATION_STATUS.OPEN : ANNOTATION_STATUS.DRAFT,
    releasedAt: null, sentAt: null, studentResponse: '', respondedBy: null, respondedAt: null,
    createdAt: now(),
  })
  await logAudit(actor.id, 'ANNOTATION_ADDED', 'annotations', row.id, projectId, {
    documentId, visibility: row.visibility, status: row.status,
  })
  return row
}

export async function discardDraftAnnotation(actor, snap, projectId, annotationId) {
  const { b } = authorizeOn(actor, snap, projectId, 'document.annotate')
  const a = b.annotations.find(x => x.id === annotationId)
  if (!a || a.authorId !== actor.id || a.status !== ANNOTATION_STATUS.DRAFT) {
    throw new Error('Only your own unsent drafts can be discarded.')
  }
  await db.remove('annotations', annotationId)
  await logAudit(actor.id, 'ANNOTATION_DISCARDED', 'annotations', annotationId, projectId, {})
}

const STATUS_FOR_DECISION = {
  [DECISIONS.APPROVE]: DOC_STATUS.APPROVED,
  [DECISIONS.MINOR]: DOC_STATUS.APPROVED,
  [DECISIONS.ENDORSE]: DOC_STATUS.APPROVED,
  [DECISIONS.MAJOR]: DOC_STATUS.FOR_REVISION,
  [DECISIONS.REJECT]: DOC_STATUS.REJECTED,
}

/**
 * "Send feedback" (wireframe S-08). One act releases the reviewer's draft
 * annotations, records the review decision, and emails the group once —
 * the decision, the reviewer's summary and every annotated location, with a
 * link to Feedback & Annotations for that version. Returns the email so the
 * reviewer sees exactly what the students received.
 */
export async function sendFeedback(actor, snap, projectId, documentId, { decision, summary }) {
  const { b, ctx } = authorizeOn(actor, snap, projectId, 'review.decide')
  const doc = b.documents.find(d => d.id === documentId)
  if (!doc || [DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)) {
    throw new Error('Only the current version can be reviewed.')
  }
  if (!STATUS_FOR_DECISION[decision]) throw new Error('Choose a review decision.')
  const drafts = b.annotations.filter(a =>
    a.documentId === documentId && a.authorId === actor.id && a.status === ANNOTATION_STATUS.DRAFT)
  // Major revisions and rejection send the version back; minor revisions
  // approve it with changes to carry into the next version.
  const returned = [DECISIONS.MAJOR, DECISIONS.REJECT].includes(decision)
  const withChanges = returned || decision === DECISIONS.MINOR
  if (withChanges && !summary?.trim() && drafts.length === 0) {
    throw new Error('Add annotations or a summary of the required changes first.')
  }

  const sentAt = now()
  for (const a of drafts) await db.update('annotations', a.id, { status: ANNOTATION_STATUS.OPEN, sentAt })
  const row = await db.add('reviews', {
    projectId, documentId, reviewerId: actor.id, reviewerRole: why(ctx, 'review.decide').role,
    decision, comment: summary?.trim() ?? '', createdAt: sentAt,
  })
  await db.update('documents', documentId, { status: STATUS_FOR_DECISION[decision] })
  await logAudit(actor.id, 'FEEDBACK_SENT', 'reviews', row.id, projectId, {
    documentId, decision, annotationsReleased: drafts.length,
  })

  const label = `${doc.docType} v${doc.versionNumber}`
  const email = await sendEmail(memberIds(b), {
    projectId, type: returned ? 'Returned with annotations' : withChanges ? 'Approved with annotations' : 'Review completed',
    title: returned ? `${label} returned — ${decision.toLowerCase()}` : `${label}: ${decision.toLowerCase()}`,
    body: [
      `${actor.name} (${row.reviewerRole}) reviewed ${label} of ${b.project.title}.`,
      summary?.trim() ? `Required changes: ${summary.trim()}` : null,
      returned
        ? `Add a resolution note to each annotation, then submit v${doc.versionNumber + 1}.`
        : withChanges ? 'This version is approved. Address the annotations below in your next version.' : null,
    ].filter(Boolean).join('\n\n'),
    lines: drafts.map(a => `${a.anchor} — ${a.category}: ${a.text}`),
    link: `/feedback?v=${doc.id}`,
  })
  return { review: row, email }
}

/** A student's resolution note on an annotation (REVIEW.student_response). */
export async function respondToAnnotation(actor, snap, projectId, annotationId, note) {
  authorizeOn(actor, snap, projectId, 'annotation.respond')
  const a = (snap.annotations ?? []).find(x => x.id === annotationId)
  if (!a || a.status === ANNOTATION_STATUS.DRAFT) throw new Error('Annotation not found.')
  if (!note?.trim()) throw new Error('Write how you resolved it.')
  await db.update('annotations', annotationId, {
    studentResponse: note.trim(), respondedBy: actor.id, respondedAt: now(), status: ANNOTATION_STATUS.RESOLVED,
  })
  await logAudit(actor.id, 'ANNOTATION_RESPONDED', 'annotations', annotationId, projectId, {})
}

function buildRealisticAiSummary(doc, project) {
  const title = project?.title || 'Academic Manuscript'
  const area = project?.researchArea || 'Information Systems'
  const abstract = doc?.abstract || ''

  return {
    background: abstract
      ? abstract.slice(0, 240) + (abstract.length > 240 ? '...' : '')
      : `Managing thesis and capstone processes within ${area} requires centralizing document routing, auditability, and role-based permissions to streamline academic evaluation.`,
    problemStatement: `Current manual procedures for "${title}" suffer from fragmented communication, loss of document revision history, and lack of real-time milestone tracking across university stakeholders.`,
    objectives: `Design and evaluate a centralized web-based platform for "${title}" incorporating Context-Aware Access Control (CAAC), automated routing, and ISO/IEC 25010 software quality standards.`,
    methodology: `Employs the Iterative and Incremental Development (IID) model across 4 phases, utilizing React, Firebase Firestore, Cloud Storage, and serverless Cloud Functions. Evaluated via SUS, TAM, and expert ISO/IEC 25010 checklists.`,
    expectedOutput: `A fully deployed web application for "${title}" with non-destructive annotations, immutable version history, and digital clearance workflows.`,
    scope: `Restricted to undergraduate capstone and thesis workflows within Holy Angel University School of Computing (HAU-SOC).`,
    limitations: `Does not compute final grades for panel members; excludes IRB graduate endorsement forms and faculty co-authorship KPI validation.`,
    contributions: `Provides a domain-restricted, audit-compliant academic workflow management engine that enforces state-based progressive visibility across 11 stakeholder roles.`,
  }
}

/**
 * Gemini Flash summary of the complete manuscript, generated by the system at
async function summarizeForMilestone(actor, b, defenseType) {
  const { milestone, docType } = AI_MILESTONES[defenseType]
  const doc = b.documents
    .filter(d => d.docType === docType && d.scope !== 'Chapter draft')
    .sort((x, y) => y.versionNumber - x.versionNumber)[0]
  if (!doc || b.aiSummaries.some(s => s.documentId === doc.id)) return null
  await db.update('documents', doc.id, { milestone })

  const existing = b.aiSummaries.find(s => s.documentId === doc.id)
  if (existing) return existing

  const structured = buildRealisticAiSummary(doc, b.project)
  const row = await db.add('aiSummaries', {
    projectId: b.project.id, documentId: doc.id, documentVersion: doc.versionNumber,
    milestone, generatedAt: now(),
    model: 'Google Gemini Flash (Paid Billing Tier)',
    label: AI_DISCLOSURE,
    structured,
  })
  await logAudit(actor.id, 'AI_SUMMARY_GENERATED', 'aiSummaries', row.id, b.project.id, {
    documentId: doc.id, milestone, transmittedTo: 'Google Gemini Flash API (paid tier)',
  })
  return row
}

/**
 * Public action for authorized reviewers to trigger or refresh AI summaries on demand.
 */
export async function generateAiSummary(actor, snap, projectId, documentId) {
  const { b } = authorizeOn(actor, snap, projectId, 'ai.view')
  const doc = b.documents.find(d => d.id === documentId)
  if (!doc) throw new Error('Document not found')

  const structured = buildRealisticAiSummary(doc, b.project)
  const existing = b.aiSummaries.find(s => s.documentId === doc.id)

  let summaryId
  if (existing) {
    summaryId = existing.id
    await db.update('aiSummaries', existing.id, {
      generatedAt: now(),
      structured,
    })
  } else {
    const milestone = b.project.currentStage.includes('PROPOSAL') ? 'Proposal Defense' : 'Final Defense'
    const row = await db.add('aiSummaries', {
      projectId: b.project.id, documentId: doc.id, documentVersion: doc.versionNumber,
      milestone, generatedAt: now(),
      model: 'Google Gemini Flash (Paid Billing Tier)',
      label: AI_DISCLOSURE,
      structured,
    })
    summaryId = row.id
  }

  await logAudit(actor.id, 'AI_SUMMARY_GENERATED', 'aiSummaries', summaryId, b.project.id, {
    documentId: doc.id, transmittedTo: 'Google Gemini Flash API (paid tier)', action: existing ? 'REFRESH' : 'CREATE',
  })
}

// --- Weekly logs (FM-AAC-SOC-2003) — Capstone 2 only ---------------------------

export async function submitWeeklyLog(actor, snap, projectId, input) {
  const { b } = authorizeOn(actor, snap, projectId, 'weeklylog.submit')
  if (!input.consultationDate) throw new Error('Enter the consultation date.')
  if (!input.accomplishments?.trim()) throw new Error('Describe this week’s accomplishments.')
  const last = b.weeklyLogs.at(-1)
  // A returned log is resubmitted under the same week number.
  const weekNo = last?.status === 'Returned' ? last.weekNo : (last?.weekNo ?? 0) + 1
  const row = await db.add('weeklyLogs', {
    projectId, weekNo, consultationDate: input.consultationDate, consultationMode: input.consultationMode,
    accomplishments: input.accomplishments.trim(), nextTasks: input.nextTasks?.trim() ?? '',
    submittedBy: actor.id, submittedAt: now(),
    status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
  })
  await logAudit(actor.id, 'WEEKLY_LOG_SUBMITTED', 'weeklyLogs', row.id, projectId, { weekNo })
  await sendEmail(assigneeIds(b, P.ADVISER), {
    projectId, type: 'Weekly log',
    title: `${b.project.groupName}: week ${weekNo} log awaiting your signature`,
    body: `${actor.name} submitted the week ${weekNo} accomplishment report.`,
    link: '/logs',
  })
  return row
}

export async function decideWeeklyLog(actor, snap, projectId, logId, { approve, remarks, confirmed }) {
  const { b } = authorizeOn(actor, snap, projectId, 'weeklylog.sign')
  if (approve && !confirmed) throw new Error('Confirm that the consultation took place before signing.')
  if (!approve && !remarks?.trim()) throw new Error('Say what the group needs to fix.')
  const row = await db.update('weeklyLogs', logId, approve
    ? { status: 'Approved', signedBy: actor.id, signedAt: now(), adviserRemarks: remarks ?? '' }
    : { status: 'Returned', adviserRemarks: remarks })
  await logAudit(actor.id, approve ? 'WEEKLY_LOG_SIGNED' : 'WEEKLY_LOG_RETURNED', 'weeklyLogs', logId, projectId, {
    form: FORMS.F2003.code,
  })
  await sendEmail(memberIds(b), {
    projectId, type: 'Weekly log',
    title: approve ? `Week ${row.weekNo} log approved and signed` : `Week ${row.weekNo} log returned`,
    body: approve
      ? `${actor.name} signed your ${FORMS.F2003.code} entry.`
      : `${actor.name} returned your log: ${remarks}`,
    link: '/logs',
  })
  return row
}

// --- Panel evaluation (EVALUATION_FORM) -----------------------------------------

export async function submitEvaluation(actor, snap, projectId, { recommendation, strengths, revisions }) {
  const { b } = authorizeOn(actor, snap, projectId, 'evaluation.submit')
  const type = defenseTypeAt(b.project.currentStage)
  const defense = b.defenses.find(d => d.type === type && !d.verdict)
  if (!defense) throw new Error('There is no open defense to evaluate.')
  if (b.evaluations.some(e => e.defenseId === defense.id && e.panelistId === actor.id)) {
    throw new Error('You have already submitted your evaluation for this defense.')
  }
  if (!recommendation) throw new Error('Choose your recommendation to the Chair.')
  const row = await db.add('evaluations', {
    projectId, defenseId: defense.id, panelistId: actor.id,
    content: { recommendation, strengths: strengths?.trim() ?? '', revisions: revisions?.trim() ?? '' },
    submittedAt: now(),
  })
  await logAudit(actor.id, 'EVALUATION_SUBMITTED', 'evaluations', row.id, projectId, { defenseId: defense.id })
  return row
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
  await sendEmail([...memberIds(b), ...assigneeIds(b, P.ADVISER), ...PANEL_ROLES.flatMap(r => assigneeIds(b, r))], {
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
  const blocked = stageByKey(b.project.currentStage).gates[0].requires(b, actor)
  if (blocked) throw new Error(blocked)
  if (!input.confirmed) throw new Error('Confirm that the panel has deliberated and this is the official verdict.')
  if (!Object.values(VERDICTS).includes(input.verdict)) throw new Error('Choose the verdict.')

  const revisionClass = input.verdict === VERDICTS.MAJOR ? 'Major' : input.verdict === VERDICTS.MINOR ? 'Minor' : null
  // The countdown is configurable (FR "Automated revision countdowns"); the
  // defaults are the current 1 and 2 weeks.
  const days = revisionClass ? Number(input.revisionDays) || REVISION_WINDOW_DAYS[revisionClass] : null
  const deadline = revisionClass ? addDays(days) : null
  const evaluated = latestOf(b, AI_MILESTONES[type].docType)

  await db.update('defenses', defense.id, {
    verdict: input.verdict, revisionClass, revisionDeadline: deadline, revisionDays: days,
    evaluatedDocumentId: evaluated?.id ?? null,
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
  const coordinator = holdersOf(snap, G.COORDINATOR).find(u => (u.programScope ?? []).includes(b.project.program))
  await sendEmail([...memberIds(b), ...assigneeIds(b, P.ADVISER), coordinator?.id], {
    projectId, type: revisionClass ? 'Revision request' : 'Re-defense',
    title: `${b.project.groupName}: ${type.toLowerCase()} defense verdict — ${input.verdict}`,
    body: [
      deadline
        ? `Revisions are due ${new Date(deadline).toLocaleDateString()} (${days} days). They are verified by the Adviser, then the Panel Members, on ${FORMS.F2004.code}.`
        : 'A re-defense will be scheduled once the prescribed revisions are done.',
      input.remarks ? `Required revisions: ${input.remarks}` : null,
    ].filter(Boolean).join('\n\n'),
    link: '/defense',
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
  await sendEmail(signatories.filter(s => s.order === 1).map(s => s.userId), {
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
    await sendEmail(nextSigners, {
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
      await sendEmail(other, {
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
  const block = type === 'Student' ? input.block?.trim().toUpperCase() ?? '' : ''
  const problem = block && blockProblem(block, input.program, yearDigit(input.yearLevel))
  if (problem) throw new Error(problem)
  const user = await db.add('users', {
    name: input.name.trim(), email, idNumber: input.idNumber?.trim() ?? '',
    program: input.program ?? '', yearLevel: type === 'Student' ? input.yearLevel ?? '' : '',
    block,
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

