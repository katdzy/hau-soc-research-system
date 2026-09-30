// The workflow spine, following the life cycle in Scope and Delimitations:
// Ideation → Proposal Development → System Implementation → Final Oral Defense
// → Post-Defense Clearance. Every stage declares the gate that moves a project
// forward, the CAAC capability that opens it (never a bare role name), and
// what has to exist first. The UI renders itself from this file. A gate's
// `queue` names the dashboard queue it appears in for the office that runs it
// (§4, e.g. the Program Chair/Coordinator's "Needs adviser").
//
// Ordering notes
// - The Adviser is assigned BEFORE ideation (Decision #16). The Data
//   Dictionary's PROJECT.current_stage enum still lists Conceptualization
//   first — Open Questions #9.
// - URO verification comes before the Dean's and Associate Dean's final
//   signature (Decision #18).
// - Scheduling a defense and recording its verdict are the gates for the two
//   defense stages; they run from the Defense tab (`handledIn`).

import {
  DOC_TYPES, DOC_STATUS, VERDICTS, FORMS, PROJECT_ROLES as P, GLOBAL_ROLES as G, COURSES, CAPSTONE2_MILESTONES,
  capstone2SectionOf, nextSemester,
} from './constants.js'
import { formOf, pendingBefore } from './forms.js'
import { FLAGS } from './flags.js'
import { uroReturnOf, uroReturnOutstanding } from './returns.js'

export { uroReturnOf, uroReturnOutstanding }

// Offices whose approval the adviser assignment needs (NEW-7, flag ADVISER_APPROVAL).
export const ADVISER_APPROVERS = [G.DEAN, G.ASSOCIATE_DEAN]
export const adviserApprovalsOf = (b) => b.project.adviserApprovals ?? {}
/**
 * The offices whose approval this assignment needs. NEW-5 (decided 2026-09-29,
 * Prompt 5): an office named as the Adviser may not approve itself
 * (BLOCK_SELF_APPROVAL), so the other office approves alone. `adviserOffices`
 * is recorded when the Program Chair/Coordinator routes the assignment.
 */
export const requiredAdviserApprovers = (b) => {
  const named = FLAGS.BLOCK_SELF_APPROVAL ? (b.project.adviserOffices ?? []) : []
  const required = ADVISER_APPROVERS.filter(r => !named.includes(r))
  return required.length ? required : ADVISER_APPROVERS
}
export const adviserApprovalComplete = (b) => {
  const required = requiredAdviserApprovers(b)
  const done = required.filter(r => adviserApprovalsOf(b)[r])
  return FLAGS.ADVISER_APPROVAL === 'either' ? done.length > 0 : done.length === required.length
}

const has = (list, pred) => list.some(pred)

const latest = (b, docType) =>
  b.documents.filter(d => d.docType === docType)
    .sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null

const approvedLatest = (b, docType) => latest(b, docType)?.status === DOC_STATUS.APPROVED

const openDefense = (b, type) => b.defenses.find(d => d.type === type && !d.verdict)
const lastDefense = (b, type) =>
  b.defenses.filter(d => d.type === type)
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] ?? null

/** NEW-40 (flag VERDICT_AFTER_SCHEDULED_TIME): why the verdict cannot be recorded yet, or null. */
export function defenseNotHeld(defense, at = Date.now()) {
  if (!FLAGS.VERDICT_AFTER_SCHEDULED_TIME || !defense) return null
  return new Date(defense.scheduledAt).getTime() > at
    ? `The defense is scheduled for ${new Date(defense.scheduledAt).toLocaleString()}. Record the verdict after it is held.`
    : null
}

/** NEW-41: the project is revising for a re-defense (the last verdict of this type was Re-defense). */
export const inRedefense = (b, type) => lastDefense(b, type)?.verdict === VERDICTS.REDEFENSE

/**
 * NEW-42 (flag VERDICT_CORRECTION_HOURS): why this recorded verdict can no
 * longer be corrected, or null. Once only, within the window, and only while
 * nobody has acted on it.
 */
export function verdictCorrectionBlocker(b, defense, at = Date.now()) {
  if (!FLAGS.VERDICT_CORRECTION_HOURS) return 'Recorded verdicts are final.'
  if (!defense?.verdict) return 'No verdict has been recorded.'
  if (defense.correctedAt) return 'This verdict has already been corrected once.'
  if (at - new Date(defense.recordedAt).getTime() > FLAGS.VERDICT_CORRECTION_HOURS * 36e5) {
    return `Verdicts can be corrected only within ${FLAGS.VERDICT_CORRECTION_HOURS} hours of recording.`
  }
  if (b.defenses.some(d => d.type === defense.type && new Date(d.createdAt) > new Date(defense.createdAt))) {
    return 'A later defense has already been scheduled.'
  }
  if (b.documents.some(d => d.docType === DOC_TYPES.REVISED_MANUSCRIPT && new Date(d.submittedAt) > new Date(defense.recordedAt))) {
    return 'The group has already uploaded a revised manuscript for this verdict.'
  }
  const form = b.forms.find(f => f.formType === FORMS.F2004.code && f.payload?.defenseId === defense.id)
  if (form?.signatories.some(s => s.role !== P.PANEL_CHAIR && s.signedAt)) return `Someone else has already signed ${FORMS.F2004.code}.`
  return null
}

/**
 * S6.5 — each Capstone 2 milestone's confirmation ({ at, by, note }) or null.
 * A project from before the split has only `milestonesConfirmedAt`, which
 * counts for both.
 */
export function milestoneStatus(project) {
  const legacy = project.milestonesConfirmedAt
    ? { at: project.milestonesConfirmedAt, by: project.milestonesConfirmedBy, note: project.milestonesNote ?? '' } : null
  return Object.fromEntries(CAPSTONE2_MILESTONES.map(m => [m.key, project.milestones?.[m.key] ?? legacy]))
}
export const milestonesComplete = (project) => Object.values(milestoneStatus(project)).every(Boolean)

/** Why this milestone cannot be confirmed, or null. */
export function milestoneBlocker(b, key) {
  const m = CAPSTONE2_MILESTONES.find(x => x.key === key)
  if (!m) return 'No milestone was given.'
  return milestoneStatus(b.project)[key] ? `The ${m.label.toLowerCase()} milestone is already confirmed.` : null
}

/** NEW-43 (flag I2_READINESS_CHECK) — why Instructor 2 cannot confirm readiness yet, or null. */
export function readinessBlocker(b) {
  if (FLAGS.I2_READINESS_CHECK !== 'own-step') return 'Readiness is confirmed together with the milestones.'
  if (b.project.readinessConfirmedAt) return 'Readiness for final defense is already confirmed.'
  if (!milestonesComplete(b.project)) return 'Confirm both Capstone 2 milestones first.'
  return null
}

/**
 * S8.5 (NEW-44) — why Instructor 2 cannot confirm the post-defense course
 * requirements, or null. Not while the group revises for a re-defense: the
 * final defense has not been passed yet.
 */
export function postDefenseBlocker(b) {
  if (b.project.postDefenseConfirmedAt) return 'The post-defense course requirements are already confirmed.'
  if (inRedefense(b, 'Final')) return 'The group is revising for a re-defense; confirm the post-defense requirements after it passes.'
  return null
}

// --- S9.4 URO return path (NEW-7, NEW-45) ------------------------------------

/** What the URO may return: the certificates (NEW-45) and, if NEW-46 is on, the manuscript. */
export const uroReturnableTypes = () => [
  ...FLAGS.URO_RETURNABLE,
  ...(FLAGS.URO_MANUSCRIPT_RETURN === 'to-final-requirements' ? [DOC_TYPES.FINAL_MANUSCRIPT] : []),
]

/** A return that includes the manuscript sends the project back to Final Requirements (NEW-46). */
export const returnResetsSigning = (docTypes) =>
  FLAGS.URO_MANUSCRIPT_RETURN === 'to-final-requirements' && docTypes.includes(DOC_TYPES.FINAL_MANUSCRIPT)

/** Why the URO cannot return these types to the group now, or null. */
export function uroReturnBlocker(b, docTypes) {
  if (!FLAGS.URO_RETURN_PATH) return 'Returning a project to the group is switched off.'
  const waiting = uroReturnOutstanding(b)
  if (waiting.length) return `Already returned — waiting for the group’s new ${waiting.join(' and ')}.`
  if (!docTypes?.length) return 'Choose what the group has to replace.'
  const other = docTypes.find(t => !uroReturnableTypes().includes(t))
  if (other) {
    return uroReturnableTypes().includes(DOC_TYPES.FINAL_MANUSCRIPT)
      ? `Only the certificates or the Final Manuscript can be returned, not the ${other}.`
      : `Only the certificates can be returned to the group, not the ${other}.`
  }
  const missing = docTypes.find(t => !latest(b, t))
  if (missing) return `The group has not submitted a ${missing}.`
  return null
}

const revisionFormDone = (b, defenseType) => {
  const f = b.forms
    .filter(x => x.formType === FORMS.F2004.code && x.payload?.defenseType === defenseType)
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0]
  if (!f) return `${FORMS.F2004.code} has not been issued for the ${defenseType.toLowerCase()} defense.`
  const pending = f.signatories.filter(s => !s.signedAt)
  return pending.length
    ? `${FORMS.F2004.code} still needs: ${pending.map(s => s.role).join(', ')}.`
    : null
}

// --- Step sequences ---------------------------------------------------------
// Where a gate waits on several people in a fixed order, the gate's `steps(b)`
// spells the order out — [{ label, role, userId?, tab?, done, order? }] — and
// the Next-step panel shows it, so nobody has to guess who acts first. Steps
// that share an `order` may happen in any order among themselves.

const GROUP = 'Group'

const f2004Of = (b, defenseType) => b.forms
  .filter(x => x.formType === FORMS.F2004.code && x.payload?.defenseType === defenseType)
  .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] ?? null

const signatureSteps = (form, label) => [...(form?.signatories ?? [])]
  .sort((x, y) => x.order - y.order)
  .map(s => ({
    label, role: s.role, userId: s.userId, order: s.order, done: Boolean(s.signedAt),
    tab: s.viaGate ? 'overview' : 'forms',
  }))

/** S5.7 / S8.1–S8.4: group revises → Adviser approves and signs → Panel Members sign. */
function revisionSteps(b, defenseType) {
  const verdictAt = lastDefense(b, defenseType)?.recordedAt
  const rev = latest(b, DOC_TYPES.REVISED_MANUSCRIPT)
  const fresh = Boolean(rev && (!verdictAt || new Date(rev.submittedAt) > new Date(verdictAt)))
  // The Panel Chair signs FM-2004 when recording the verdict, so that line comes first.
  return [
    { label: 'Upload the revised manuscript', role: GROUP, tab: 'documents', done: fresh, order: 0 },
    { label: 'Approve the revised manuscript', role: P.ADVISER, tab: 'documents', done: fresh && rev.status === DOC_STATUS.APPROVED, order: 1 },
    ...signatureSteps(f2004Of(b, defenseType), `Sign ${FORMS.F2004.code}`).map(st => (
      st.role === P.PANEL_CHAIR
        ? { ...st, label: `Recorded the verdict and signed ${FORMS.F2004.code}`, order: -1 }
        : { ...st, order: st.order + 1 }
    )),
  ].sort((x, y) => x.order - y.order)
}

/**
 * NEW-41 — after a Re-defense verdict: the group revises, the Adviser approves
 * the revised manuscript (Documents tab), and that approval returns the project
 * to scheduling for the re-defense (S7.7 → S7.3).
 */
function redefenseGate(type) {
  const proposal = type === 'Proposal'
  return {
    action: proposal ? 'RETURN_TO_PROPOSAL_DEFENSE' : 'RETURN_TO_FINAL_DEFENSE',
    label: 'Approve the revised manuscript for the re-defense',
    capability: 'review.decide',
    actorHint: P.ADVISER,
    handledIn: 'documents',
    next: proposal ? 'PROPOSAL_DEFENSE_SCHEDULING' : 'FINAL_DEFENSE_SCHEDULING',
    applies: (b) => inRedefense(b, type),
    steps: (b) => {
      const verdictAt = lastDefense(b, type)?.recordedAt
      const rev = latest(b, DOC_TYPES.REVISED_MANUSCRIPT)
      const fresh = Boolean(rev && verdictAt && new Date(rev.submittedAt) > new Date(verdictAt))
      return [
        { label: 'Recorded the re-defense verdict with the required changes', role: P.PANEL_CHAIR, userId: lastDefense(b, type)?.recordedBy, order: -1, done: true },
        { label: 'Upload the revised manuscript', role: 'Group', tab: 'documents', order: 0, done: fresh },
        { label: 'Approve the revised manuscript', role: P.ADVISER, tab: 'documents', order: 1, done: false, gate: true },
        { label: `Schedule the re-defense`, role: proposal ? FLAGS.PROPOSAL_DEFENSE_SCHEDULER : P.INSTRUCTOR_2, tab: 'defense', order: 2, done: false },
      ]
    },
    requires: (b) => {
      const verdictAt = lastDefense(b, type)?.recordedAt
      const rev = latest(b, DOC_TYPES.REVISED_MANUSCRIPT)
      if (!rev || new Date(rev.submittedAt) <= new Date(verdictAt)) return 'The group has not uploaded its revised manuscript yet.'
      return [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW].includes(rev.status)
        ? null : `Revised Manuscript v${rev.versionNumber} is ${rev.status}; the group has to submit a new version.`
    },
  }
}

export const PHASES = {
  IDEATION: 'Capstone 1 · Ideation',
  PROPOSAL: 'Capstone 1 · Proposal',
  IMPLEMENTATION: 'Capstone 2 · Implementation',
  CLEARANCE: 'Post-Defense Clearance',
}

export const STAGES = [
  // --- Capstone 1 · Ideation ----------------------------------------------
  {
    key: 'GROUP_FORMATION',
    label: 'Group Formation',
    phase: PHASES.IDEATION,
    blurb: 'Instructor 1 creates the group from their block and forwards the roster to the Program Chair/Coordinator. Students do not form their own groups.',
    gates: [{
      action: 'ENDORSE_ROSTER',
      label: 'Forward roster to the Program Chair/Coordinator',
      capability: 'roster.endorse',
      actorHint: P.INSTRUCTOR_1,
      next: 'ADVISER_ASSIGNMENT',
      requires: (b) => b.members.length >= 1 ? null : 'Add at least one student to the group first.',
    }],
  },
  {
    key: 'ADVISER_ASSIGNMENT',
    label: 'Adviser Assignment',
    phase: PHASES.IDEATION,
    blurb: 'The Program Chair/Coordinator assigns an Adviser before ideation begins and routes the assignment for approval.',
    gates: [{
      action: 'ROUTE_ADVISER',
      queue: 'Needs adviser',
      label: 'Route adviser assignment to the Dean and Associate Dean',
      capability: 'adviser.assign',
      actorHint: 'Program Chair/Coordinator',
      next: 'ADVISER_APPROVAL',
      requires: (b) => has(b.assignments, a => a.roleType === P.ADVISER)
        ? null : 'Assign an Adviser before routing.',
    }],
  },
  {
    key: 'ADVISER_APPROVAL',
    label: 'Adviser Approval',
    phase: PHASES.IDEATION,
    blurb: FLAGS.ADVISER_APPROVAL === 'either'
      ? 'The Dean or the Associate Dean approves the adviser assignment. Neither may approve an assignment that names themselves.'
      : 'The Dean and the Associate Dean both approve the adviser assignment, in either order. Neither may approve an assignment that names themselves; if one of them is the named Adviser, the other approves alone.',
    gates: [{
      action: 'APPROVE_ADVISER',
      queue: 'Adviser assignments to approve',
      label: 'Approve adviser assignment',
      capability: 'adviser.approve',
      actorHint: FLAGS.ADVISER_APPROVAL === 'either' ? 'Dean or Associate Dean' : 'Dean and Associate Dean',
      next: 'TOPIC_PROPOSAL',
      steps: (b) => ADVISER_APPROVERS.map(r => (requiredAdviserApprovers(b).includes(r) ? {
        label: 'Approve the adviser assignment', role: r, tab: 'overview', order: 1,
        done: Boolean(adviserApprovalsOf(b)[r]), userId: adviserApprovalsOf(b)[r]?.userId,
      } : {
        label: 'Named as the Adviser, so this office does not approve; the other office approves alone',
        role: r, order: 0, done: true,
      })).sort((x, y) => x.order - y.order),
      requires: (b, me) => {
        const approvals = adviserApprovalsOf(b)
        const mine = ADVISER_APPROVERS.find(r => (me?.globalRoles ?? []).includes(r))
        if (mine && approvals[mine]) {
          const waiting = requiredAdviserApprovers(b).filter(r => !approvals[r])
          return `You have approved. Waiting on: ${waiting.join(', ')}.`
        }
        return null
      },
    }],
  },
  {
    key: 'TOPIC_PROPOSAL',
    label: 'Topic Proposal',
    phase: PHASES.IDEATION,
    blurb: 'The group submits five proposed topics. Instructor 1 approves one and registers it as the official title; the group then submits the concept paper, and Instructor 1’s approval of it opens Proposal Development. The Adviser annotates.',
    gates: [{
      // S3.4 — sets the title; the project stays here for the concept paper.
      action: 'REGISTER_TOPIC',
      label: 'Register the approved topic as the project title',
      capability: 'topic.register',
      actorHint: P.INSTRUCTOR_1,
      next: null,
      done: (b) => Boolean(b.project.topicRegisteredAt),
      requires: (b) => has(b.documents, d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED)
        ? null : 'Approve one of the proposed topics first.',
    }, {
      // S3.6 — approving the concept paper is the step that moves the stage.
      action: 'APPROVE_CONCEPT_PAPER',
      label: 'Approve the concept paper',
      capability: 'topic.register',
      actorHint: P.INSTRUCTOR_1,
      handledIn: 'documents',
      next: 'PROPOSAL_DEVELOPMENT',
      requires: (b) => {
        if (!b.project.topicRegisteredAt) return 'Register the approved topic first.'
        const cp = latest(b, DOC_TYPES.CONCEPT_PAPER)
        if (!cp) return 'The group has not submitted its concept paper yet.'
        return [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW].includes(cp.status)
          ? null : `Concept Paper v${cp.versionNumber} is ${cp.status}; the group has to submit a new version.`
      },
    }],
  },

  // --- Capstone 1 · Proposal ----------------------------------------------
  {
    key: 'PROPOSAL_DEVELOPMENT',
    label: 'Proposal Development',
    phase: PHASES.PROPOSAL,
    blurb: 'Manuscript drafting. Every upload is a new immutable version; the Adviser annotates and decides on each one. Instructor 1 then approves the group to present its proposal defense.',
    gates: [{
      action: 'APPROVE_FOR_DEFENSE',
      label: 'Approve group for the proposal defense',
      capability: 'proposal.approveForDefense',
      actorHint: P.INSTRUCTOR_1,
      next: 'PANEL_ASSIGNMENT',
      requires: (b) => approvedLatest(b, DOC_TYPES.PROPOSAL_MANUSCRIPT)
        ? null : 'The latest Proposal Manuscript version must be approved by the Adviser.',
    }],
  },
  {
    key: 'PANEL_ASSIGNMENT',
    label: 'Panel Assignment',
    phase: PHASES.PROPOSAL,
    blurb: 'The Program Chair/Coordinator designates the Panel Chair and Panel Members. An Adviser cannot sit on their own group’s panel.',
    gates: [{
      action: 'CONFIRM_PANEL',
      queue: 'Needs panel',
      label: 'Confirm panel composition',
      capability: 'panel.assign',
      actorHint: 'Program Chair/Coordinator',
      next: 'PROPOSAL_DEFENSE_SCHEDULING',
      requires: (b) => {
        if (!has(b.assignments, a => a.roleType === P.PANEL_CHAIR)) return 'A Panel Chair must be assigned.'
        if (!has(b.assignments, a => a.roleType === P.PANEL_MEMBER)) return 'At least one Panel Member must be assigned.'
        return null
      },
    }],
  },
  {
    key: 'PROPOSAL_DEFENSE_SCHEDULING',
    label: 'Proposal Defense Scheduling',
    phase: PHASES.PROPOSAL,
    blurb: 'The Program Chair/Coordinator sets the date, time and venue. Publishing the schedule notifies the group and panel and generates the AI summary of the complete manuscript.',
    gates: [{
      action: 'SCHEDULE_PROPOSAL_DEFENSE',
      queue: 'Proposal defenses to schedule',
      label: 'Publish the proposal defense schedule',
      capability: 'defense.schedule',
      actorHint: 'Program Chair/Coordinator',
      handledIn: 'defense',
      next: 'PROPOSAL_DEFENSE',
      requires: (b) => latest(b, DOC_TYPES.PROPOSAL_MANUSCRIPT) ? null : 'There is no Proposal Manuscript to defend.',
    }],
  },
  {
    key: 'PROPOSAL_DEFENSE',
    label: 'Proposal Defense',
    phase: PHASES.PROPOSAL,
    blurb: 'Panel members annotate privately before the defense. Only the Panel Chair records the verdict on FM-AAC-SOC-2004, which starts the revision countdown.',
    gates: [{
      action: 'RECORD_PROPOSAL_VERDICT',
      label: 'Record the official verdict',
      capability: 'verdict.record',
      actorHint: P.PANEL_CHAIR,
      handledIn: 'defense',
      // Every verdict opens a revision period; a re-defense returns to scheduling after it (NEW-41).
      next: 'PROPOSAL_REVISION',
      requires: (b) => (openDefense(b, 'Proposal') ? defenseNotHeld(openDefense(b, 'Proposal')) : 'No proposal defense is open.'),
    }],
  },
  {
    key: 'PROPOSAL_REVISION',
    label: 'Proposal Revision',
    phase: PHASES.PROPOSAL,
    blurb: 'The group uploads the revised manuscript before the countdown ends. The Adviser verifies it first, then the Panel Members sign FM-AAC-SOC-2004. Instructor 1 then moves the group on to Capstone 2.',
    gates: [{
      action: 'CLOSE_PROPOSAL_REVISION',
      label: 'Move the group on to Capstone 2',
      capability: 'revision.close',
      actorHint: P.INSTRUCTOR_1,
      next: 'IMPLEMENTATION',
      steps: (b) => [
        ...revisionSteps(b, 'Proposal'),
        { label: 'Assign an Instructor 2', role: G.COORDINATOR, tab: 'overview', order: 5, done: has(b.assignments, a => a.roleType === P.INSTRUCTOR_2) },
        { label: 'Move the group on to Capstone 2', role: P.INSTRUCTOR_1, tab: 'overview', order: 6, done: false, gate: true },
      ],
      applies: (b) => !inRedefense(b, 'Proposal'),
      requires: (b) => revisionFormDone(b, 'Proposal')
        ?? (has(b.assignments, a => a.roleType === P.INSTRUCTOR_2)
          ? null : 'The Program Chair/Coordinator must assign an Instructor 2 first.'),
    }, redefenseGate('Proposal')],
  },

  // --- Capstone 2 · Implementation ----------------------------------------
  {
    key: 'IMPLEMENTATION',
    label: 'Implementation & Monitoring',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'Weekly logs (FM-AAC-SOC-2003) are approved and signed by the Adviser; Instructor 2 confirms milestones. When the project is ready, the Adviser submits the Capstone Recommendation Form.',
    gates: [{
      action: 'RECOMMEND_FINAL_DEFENSE',
      label: `Submit ${FORMS.F2005.code} (Capstone Recommendation)`,
      capability: 'finaldefense.recommend',
      actorHint: P.ADVISER,
      next: 'FINAL_DEFENSE_ENDORSEMENT',
      // S6.5 + S6.7: the group's logs and manuscript and Instructor 2's milestones
      // may come in any order; the readiness check follows the milestones (NEW-43).
      steps: (b) => {
        const done = milestoneStatus(b.project)
        const ownStep = FLAGS.I2_READINESS_CHECK === 'own-step'
        return [
          { label: 'Get at least 2 weekly logs approved', role: GROUP, tab: 'logs', order: 0, done: b.weeklyLogs.filter(l => l.status === 'Approved').length >= 2 },
          { label: 'Upload the Final Manuscript', role: GROUP, tab: 'documents', order: 0, done: Boolean(latest(b, DOC_TYPES.FINAL_MANUSCRIPT)) },
          ...CAPSTONE2_MILESTONES.map(m => ({ label: `Confirm the ${m.label.toLowerCase()} milestone`, role: P.INSTRUCTOR_2, tab: 'overview', order: 0, done: Boolean(done[m.key]) })),
          ...(ownStep ? [{ label: 'Confirm, with the Adviser, that the group is ready for final defense', role: P.INSTRUCTOR_2, tab: 'overview', order: 1, done: Boolean(b.project.readinessConfirmedAt) }] : []),
          { label: `Submit ${FORMS.F2005.code}`, role: P.ADVISER, tab: 'overview', order: 2, done: false, gate: true },
        ]
      },
      requires: (b) => {
        const approved = b.weeklyLogs.filter(l => l.status === 'Approved').length
        if (approved < 2) return `At least 2 approved weekly logs are required (currently ${approved}).`
        if (!latest(b, DOC_TYPES.FINAL_MANUSCRIPT)) return 'The group must upload a Final Manuscript first.'
        if (!milestonesComplete(b.project)) return 'Instructor 2 has not confirmed the Capstone 2 milestones.'
        if (FLAGS.I2_READINESS_CHECK === 'own-step' && !b.project.readinessConfirmedAt) {
          return 'Instructor 2 has not confirmed that the group is ready for final defense.'
        }
        return null
      },
    }],
  },
  {
    key: 'FINAL_DEFENSE_ENDORSEMENT',
    label: 'Final Defense Endorsement',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'After the Adviser’s recommendation, the Program Chair/Coordinator formally endorses the project for final defense scheduling.',
    gates: [{
      action: 'ENDORSE_FINAL_DEFENSE',
      queue: 'Recommendations to endorse',
      label: 'Endorse for final defense scheduling',
      capability: 'finaldefense.endorse',
      actorHint: 'Program Chair/Coordinator',
      next: 'FINAL_DEFENSE_SCHEDULING',
      requires: (b) => {
        if (!formOf(b, FORMS.F2005.code)) return `${FORMS.F2005.code} has not been submitted.`
        if (!has(b.assignments, a => a.roleType === P.INSTRUCTOR_2)) return 'Assign an Instructor 2 to publish the schedule.'
        return null
      },
    }],
  },
  {
    key: 'FINAL_DEFENSE_SCHEDULING',
    label: 'Final Defense Scheduling',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'Instructor 2 creates and publishes the final oral defense schedule. Publishing notifies the group and panel and generates the AI summary of the final manuscript.',
    gates: [{
      action: 'SCHEDULE_FINAL_DEFENSE',
      queue: 'Final defenses to schedule',
      label: 'Publish the final defense schedule',
      capability: 'defense.schedule',
      actorHint: P.INSTRUCTOR_2,
      handledIn: 'defense',
      next: 'FINAL_DEFENSE',
      requires: (b) => latest(b, DOC_TYPES.FINAL_MANUSCRIPT) ? null : 'There is no Final Manuscript to defend.',
    }],
  },
  {
    key: 'FINAL_DEFENSE',
    label: 'Final Defense',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'Final oral defense. Only the Panel Chair records the verdict; the Adviser does not evaluate on the panel’s behalf.',
    gates: [{
      action: 'RECORD_FINAL_VERDICT',
      label: 'Record the official verdict',
      capability: 'verdict.record',
      actorHint: P.PANEL_CHAIR,
      handledIn: 'defense',
      next: 'FINAL_REVISION',
      requires: (b) => (openDefense(b, 'Final') ? defenseNotHeld(openDefense(b, 'Final')) : 'No final defense is open.'),
    }],
  },
  {
    key: 'FINAL_REVISION',
    label: 'Final Revision',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'Post-defense revisions go to the Adviser first, then the Panel Members, who sign FM-AAC-SOC-2004. The last signature completes the revisions and opens clearance (S8.4).',
    gates: [{
      // S8.4 — handled by the signatures themselves: the last FM-2004 line moves the stage.
      action: 'COMPLETE_FINAL_REVISION',
      label: `Verify the revisions and sign ${FORMS.F2004.code}`,
      capability: 'revision.verify',
      actorHint: 'Adviser and Panel Members',
      handledIn: 'forms',
      next: 'CLEARANCE',
      steps: (b) => revisionSteps(b, 'Final'),
      applies: (b) => !inRedefense(b, 'Final'),
      requires: (b) => revisionFormDone(b, 'Final'),
    }, redefenseGate('Final')],
  },

  // --- Post-Defense Clearance ---------------------------------------------
  {
    key: 'CLEARANCE',
    label: 'Final Requirements',
    phase: PHASES.CLEARANCE,
    blurb: 'The group uploads the Editor’s Certificate and Plagiarism Clearance Certificate. The Approval Sheet is signed by the Adviser, then the Panel, then endorsed by the Program Chair/Coordinator.',
    gates: [{
      action: 'ENDORSE_TO_URO',
      queue: 'Approval Sheets to endorse',
      label: 'Endorse and sign the Approval Sheet',
      capability: 'clearance.endorse',
      actorHint: 'Program Chair/Coordinator',
      signs: FORMS.APPROVAL.code,
      next: 'URO_VERIFICATION',
      steps: (b) => [
        { label: 'Upload the Editor’s Certificate', role: GROUP, tab: 'documents', order: 0, done: Boolean(latest(b, DOC_TYPES.EDITORS_CERTIFICATE)) },
        { label: 'Upload the Plagiarism Clearance Certificate', role: GROUP, tab: 'documents', order: 0, done: Boolean(latest(b, DOC_TYPES.PLAGIARISM_CERTIFICATE)) },
        ...signatureSteps(formOf(b, FORMS.APPROVAL.code), 'Sign the Approval Sheet')
          .filter(st => st.order <= 3)
          .map(st => (st.order === 3 ? { ...st, label: 'Endorse and sign the Approval Sheet', gate: true } : st)),
      ],
      requires: (b) => {
        const missing = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE]
          .filter(t => !latest(b, t))
        if (missing.length) return `Missing: ${missing.join(', ')}.`
        const waiting = pendingBefore(formOf(b, FORMS.APPROVAL.code), 'Program Chair/Coordinator')
        return waiting.length ? `Approval Sheet still needs: ${waiting.join(', ')}.` : null
      },
    }],
  },
  {
    key: 'URO_VERIFICATION',
    label: 'URO Verification',
    phase: PHASES.CLEARANCE,
    blurb: 'The University Research Office verifies the Editor’s Certificate, the Plagiarism Clearance Certificate and the manuscript, then signs.',
    gates: [{
      action: 'URO_VERIFY',
      queue: 'Clearances to verify',
      label: 'Verify certificates and sign',
      capability: 'uro.verify',
      actorHint: 'University Research Office',
      // Not explicit in the manuscript (flag URO_SIGNS_APPROVAL_SHEET), read when used.
      get signs() { return FLAGS.URO_SIGNS_APPROVAL_SHEET ? FORMS.APPROVAL.code : undefined },
      next: 'FINAL_APPROVAL',
      // §4 URO: "certificates + manuscript" — what the queue lists for each project.
      verifies: [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT],
      requires: (b) => {
        const missing = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT]
          .filter(t => !latest(b, t))
        if (missing.length) return `Missing: ${missing.join(', ')}.`
        const waiting = uroReturnOutstanding(b)
        return waiting.length
          ? `Returned to the group on ${new Date(uroReturnOf(b).at).toLocaleDateString()}. Waiting for a new ${waiting.join(' and ')}.`
          : null
      },
    }],
  },
  {
    key: 'FINAL_APPROVAL',
    label: 'Final Approval',
    phase: PHASES.CLEARANCE,
    blurb: 'The Dean and the Associate Dean sign the Approval Sheet and give final approval. The second signature archives the project.',
    gates: [{
      action: 'FINAL_APPROVE',
      queue: 'Projects for final approval',
      // The whole Approval Sheet chain; the Dean's and AD's lines are the open ones.
      steps: (b) => signatureSteps(formOf(b, FORMS.APPROVAL.code), '').map(st => ({
        ...st,
        label: ({ 1: 'Signed the Approval Sheet', 2: 'Signed the Approval Sheet', 3: 'Endorsed and signed the Approval Sheet', 4: 'Verified the certificates and signed' })[st.order]
          ?? 'Sign the Approval Sheet (final approval)',
      })),
      label: 'Sign the Approval Sheet (final approval)',
      capability: 'final.approve',
      actorHint: 'Dean and Associate Dean',
      signs: FORMS.APPROVAL.code,
      next: 'ARCHIVED',
      requires: (b, me) => {
        const sheet = formOf(b, FORMS.APPROVAL.code)
        if (!sheet) return 'The Approval Sheet has not been issued.'
        // Match the executive line by office, not by person: the Dean may
        // also have signed the same sheet earlier as the group's Adviser.
        const mine = sheet.signatories.find(s => s.viaGate && (me?.globalRoles ?? []).includes(s.role))
        if (mine?.signedAt) {
          const other = sheet.signatories.filter(s => !s.signedAt).map(s => s.role)
          return `You have signed. Waiting on: ${other.join(', ')}.`
        }
        return null
      },
    }],
  },
  {
    key: 'ARCHIVED',
    label: 'Archived',
    phase: PHASES.CLEARANCE,
    blurb: 'Cleared and moved to the records-table archive with a Pass result. The system stores no grades.',
    gates: [],
  },
]

// Each fine-grained key belongs to one stage of the WORKFLOWS.md §3.0 stage
// machine. With PROPOSAL_REVISION = 'sub-status' (NEW-3) the proposal
// revision period is part of Proposal Defense.
export const MACRO_STAGES = {
  GROUP_FORMATION: 'Group Formation',
  ADVISER_ASSIGNMENT: 'Adviser Assignment',
  ADVISER_APPROVAL: 'Adviser Assignment',
  TOPIC_PROPOSAL: 'Conceptualization',
  PROPOSAL_DEVELOPMENT: 'Proposal Development',
  PANEL_ASSIGNMENT: 'Proposal Defense',
  PROPOSAL_DEFENSE_SCHEDULING: 'Proposal Defense',
  PROPOSAL_DEFENSE: 'Proposal Defense',
  PROPOSAL_REVISION: FLAGS.PROPOSAL_REVISION === 'stage' ? 'Proposal Revision' : 'Proposal Defense',
  IMPLEMENTATION: 'Implementation',
  FINAL_DEFENSE_ENDORSEMENT: 'Implementation',
  FINAL_DEFENSE_SCHEDULING: 'Final Defense',
  FINAL_DEFENSE: 'Final Defense',
  FINAL_REVISION: 'Final Revision',
  CLEARANCE: 'Clearance',
  URO_VERIFICATION: 'Clearance',
  FINAL_APPROVAL: 'Clearance',
  ARCHIVED: 'Archived',
}
export const macroStageOf = (key) => MACRO_STAGES[key] ?? key

if (FLAGS.PROPOSAL_REVISION === 'sub-status') {
  STAGES.find(s => s.key === 'PROPOSAL_REVISION').label = 'Proposal Defense · Revisions'
}

export const stageByKey = (key) => STAGES.find(s => s.key === key)
export const stageIndex = (key) => STAGES.findIndex(s => s.key === key)
export const stageLabel = (key) => stageByKey(key)?.label ?? key

/** Stage keys from `from` to `to`, inclusive. */
export const stageRange = (from, to) =>
  STAGES.slice(stageIndex(from), stageIndex(to) + 1).map(s => s.key)

export const phaseStages = (...phases) =>
  STAGES.filter(s => phases.includes(s.phase)).map(s => s.key)

export function resolveNext(gate, b) {
  return typeof gate.next === 'function' ? gate.next(b) : gate.next
}

/** The stage's gates that still have work left (a `done` gate drops out). */
/** The stage's gates that apply now and still have work left (see `applies` and `done`). */
export const openGates = (stage, b) => (stage?.gates ?? []).filter(g => (!g.applies || g.applies(b)) && !g.done?.(b))

/** Gates with `next: null` record their effect and leave the project where it is. */
export const staysAtStage = (gate) => gate.next === null

/** Which course a stage belongs to: Ideation and Proposal are Capstone 1; the rest is Capstone 2. */
export const courseOfStage = (key) =>
  [PHASES.IDEATION, PHASES.PROPOSAL].includes(stageByKey(key)?.phase) ? COURSES.C1 : COURSES.C2

/**
 * The section and term a project is in right now. A project records its
 * Capstone 1 section and term; the Capstone 2 ones follow from the program's
 * schedule (WD-401 stays WD-401 next semester; CS-301 becomes CS-401 next year).
 */
export function sectionNow(project) {
  const course = courseOfStage(project.currentStage)
  return course === COURSES.C1
    ? { course, section: project.block, term: project.term }
    : { course, section: capstone2SectionOf(project.block), term: nextSemester(project.term) }
}
