// The workflow spine, following the life cycle in Scope and Delimitations:
// Ideation → Proposal Development → System Implementation → Final Oral Defense
// → Post-Defense Clearance. Every stage declares the gate that moves a project
// forward, the CAAC capability that opens it (never a bare role name), and
// what has to exist first. The UI renders itself from this file.
//
// Ordering notes
// - The Adviser is assigned BEFORE ideation (Decision #16). The Data
//   Dictionary's PROJECT.current_stage enum still lists Conceptualization
//   first — Open Questions #9.
// - URO verification comes before the Dean's and Associate Dean's final
//   signature (Decision #18).
// - Scheduling a defense and recording its verdict are the gates for the two
//   defense stages; they run from the Defense tab (`handledIn`).

import { DOC_TYPES, DOC_STATUS, VERDICTS, FORMS, PROJECT_ROLES as P } from './constants.js'
import { formOf, pendingBefore } from './forms.js'

const has = (list, pred) => list.some(pred)

const latest = (b, docType) =>
  b.documents.filter(d => d.docType === docType)
    .sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null

const approvedLatest = (b, docType) => latest(b, docType)?.status === DOC_STATUS.APPROVED

const openDefense = (b, type) => b.defenses.find(d => d.type === type && !d.verdict)
const lastDefense = (b, type) =>
  b.defenses.filter(d => d.type === type)
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] ?? null

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
    blurb: 'The Dean or Associate Dean approves the adviser assignment. Neither may approve an assignment that names themselves.',
    gates: [{
      action: 'APPROVE_ADVISER',
      label: 'Approve adviser assignment',
      capability: 'adviser.approve',
      actorHint: 'Dean or Associate Dean',
      next: 'TOPIC_PROPOSAL',
      requires: () => null,
    }],
  },
  {
    key: 'TOPIC_PROPOSAL',
    label: 'Topic Proposal',
    phase: PHASES.IDEATION,
    blurb: 'The group submits up to five proposed topics, then a concept paper. Instructor 1 approves one topic and registers it as the official title; the Adviser annotates.',
    gates: [{
      action: 'REGISTER_TOPIC',
      label: 'Register the approved topic',
      capability: 'topic.register',
      actorHint: P.INSTRUCTOR_1,
      next: 'PROPOSAL_DEVELOPMENT',
      requires: (b) => {
        if (!has(b.documents, d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED)) {
          return 'Approve one of the proposed topics first.'
        }
        return approvedLatest(b, DOC_TYPES.CONCEPT_PAPER) ? null : 'An approved Concept Paper is required.'
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
      next: (b) => lastDefense(b, 'Proposal')?.verdict === VERDICTS.REDEFENSE
        ? 'PROPOSAL_DEFENSE_SCHEDULING' : 'PROPOSAL_REVISION',
      requires: (b) => openDefense(b, 'Proposal') ? null : 'No proposal defense is open.',
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
      requires: (b) => revisionFormDone(b, 'Proposal'),
    }],
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
      requires: (b) => {
        const approved = b.weeklyLogs.filter(l => l.status === 'Approved').length
        if (approved < 2) return `At least 2 approved weekly logs are required (currently ${approved}).`
        if (!latest(b, DOC_TYPES.FINAL_MANUSCRIPT)) return 'The group must upload a Final Manuscript first.'
        if (!b.project.milestonesConfirmedAt) return 'Instructor 2 has not confirmed the Capstone 2 milestones.'
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
      next: (b) => lastDefense(b, 'Final')?.verdict === VERDICTS.REDEFENSE
        ? 'FINAL_DEFENSE_SCHEDULING' : 'FINAL_REVISION',
      requires: (b) => openDefense(b, 'Final') ? null : 'No final defense is open.',
    }],
  },
  {
    key: 'FINAL_REVISION',
    label: 'Final Revision',
    phase: PHASES.IMPLEMENTATION,
    blurb: 'Post-defense revisions go to the Adviser first, then the Panel Members, who sign FM-AAC-SOC-2004. Instructor 2 then opens clearance.',
    gates: [{
      action: 'CLOSE_FINAL_REVISION',
      label: 'Close revisions and open clearance',
      capability: 'revision.close',
      actorHint: P.INSTRUCTOR_2,
      next: 'CLEARANCE',
      requires: (b) => revisionFormDone(b, 'Final'),
    }],
  },

  // --- Post-Defense Clearance ---------------------------------------------
  {
    key: 'CLEARANCE',
    label: 'Final Requirements',
    phase: PHASES.CLEARANCE,
    blurb: 'The group uploads the Editor’s Certificate and Plagiarism Clearance Certificate. The Approval Sheet is signed by the Adviser, then the Panel, then endorsed by the Program Chair/Coordinator.',
    gates: [{
      action: 'ENDORSE_TO_URO',
      label: 'Endorse and sign the Approval Sheet',
      capability: 'clearance.endorse',
      actorHint: 'Program Chair/Coordinator',
      signs: FORMS.APPROVAL.code,
      next: 'URO_VERIFICATION',
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
      label: 'Verify certificates and sign',
      capability: 'uro.verify',
      actorHint: 'University Research Office',
      signs: FORMS.APPROVAL.code,
      next: 'FINAL_APPROVAL',
      requires: (b) => {
        const missing = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT]
          .filter(t => !latest(b, t))
        return missing.length ? `Missing: ${missing.join(', ')}.` : null
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
