// The workflow spine. Every stage declares the gate(s) that move a project
// forward, who may open the gate (a CAC capability, never a bare role name),
// and what has to exist first. The UI renders itself from this file, so
// changing the process here changes the whole prototype.
//
// Ordering note: advisers are assigned BEFORE topic ideation, per the Dean
// meeting and the current Method & RA "Current Process" description. The Data
// Dictionary's PROJECT.current_stage enum still lists Conceptualization first
// — flagged in Open Questions #20 and resolved here in favour of the newer text.

import { DOC_TYPES, DOC_STATUS, VERDICTS } from './constants.js'

const has = (list, pred) => list.some(pred)

export const PHASES = {
  C1_CONCEPT: 'Capstone 1 · Conceptualization',
  C1_PROPOSAL: 'Capstone 1 · Proposal',
  C2_IMPL: 'Capstone 2 · Implementation',
  CLEARANCE: 'Clearance & Archival',
}

export const STAGES = [
  {
    key: 'GROUP_FORMATION',
    label: 'Group Formation',
    phase: PHASES.C1_CONCEPT,
    blurb: 'Instructor 1 forms the project group and verifies its members. Students do not self-register.',
    gates: [{
      action: 'ENDORSE_ROSTER',
      label: 'Endorse roster to Program Coordinator',
      capability: 'roster.endorse',
      actorHint: 'Instructor 1',
      next: 'ADVISER_ASSIGNMENT',
      requires: (ctx) => ctx.members.length >= 1 ? null : 'Add at least one student to the group first.',
    }],
  },
  {
    key: 'ADVISER_ASSIGNMENT',
    label: 'Adviser Assignment',
    phase: PHASES.C1_CONCEPT,
    blurb: 'The Program Coordinator assigns an Adviser to the group and routes the assignment to the Associate Dean.',
    gates: [{
      action: 'ROUTE_ADVISER',
      label: 'Route adviser assignment to Associate Dean',
      capability: 'adviser.assign',
      actorHint: 'Program Chair/Coordinator',
      next: 'ADVISER_ENDORSEMENT',
      requires: (ctx) => has(ctx.assignments, a => a.roleType === 'Adviser')
        ? null : 'Assign an Adviser before routing.',
    }],
  },
  {
    key: 'ADVISER_ENDORSEMENT',
    label: 'Adviser Endorsement',
    phase: PHASES.C1_CONCEPT,
    blurb: 'The Associate Dean reviews and approves the adviser assignment before ideation begins.',
    gates: [{
      action: 'APPROVE_ADVISER',
      label: 'Approve adviser assignment',
      capability: 'adviser.approve',
      actorHint: 'Associate Dean',
      next: 'TOPIC_PROPOSAL',
      requires: () => null,
    }],
  },
  {
    key: 'TOPIC_PROPOSAL',
    label: 'Topic Proposal',
    phase: PHASES.C1_CONCEPT,
    blurb: 'The group submits proposed topics. Instructor 1 and the Adviser annotate and approve one, which is then registered as the project title.',
    gates: [{
      action: 'REGISTER_TOPIC',
      label: 'Register approved topic as project title',
      capability: 'topic.register',
      actorHint: 'Instructor 1',
      next: 'PROPOSAL_DEVELOPMENT',
      requires: (ctx) => has(ctx.documents, d =>
        d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED)
        ? null : 'Approve one submitted topic proposal first.',
    }],
  },
  {
    key: 'PROPOSAL_DEVELOPMENT',
    label: 'Proposal Development',
    phase: PHASES.C1_PROPOSAL,
    blurb: 'Manuscript drafting. Each upload creates a new immutable version; the Adviser annotates and issues a review decision on each one.',
    gates: [{
      action: 'ENDORSE_FOR_PANEL',
      label: 'Endorse project for panel assignment',
      capability: 'proposal.endorse',
      actorHint: 'Adviser',
      next: 'PANEL_ASSIGNMENT',
      requires: (ctx) => has(ctx.documents, d =>
        d.docType === DOC_TYPES.PROPOSAL_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
        ? null : 'An approved Proposal Manuscript version is required.',
    }],
  },
  {
    key: 'PANEL_ASSIGNMENT',
    label: 'Panel Assignment',
    phase: PHASES.C1_PROPOSAL,
    blurb: 'The Program Coordinator assigns a Panel Chair and Panel Members. Conflict check: an Adviser cannot sit on their own advisee’s panel.',
    gates: [{
      action: 'CONFIRM_PANEL',
      label: 'Confirm panel composition',
      capability: 'panel.assign',
      actorHint: 'Program Chair/Coordinator',
      next: 'PROPOSAL_DEFENSE_SCHEDULING',
      requires: (ctx) => {
        const chair = has(ctx.assignments, a => a.roleType === 'Panel Chair')
        const members = ctx.assignments.filter(a => a.roleType === 'Panel Member').length
        if (!chair) return 'A Panel Chair must be assigned.'
        if (members < 1) return 'At least one Panel Member must be assigned.'
        return null
      },
    }],
  },
  {
    key: 'PROPOSAL_DEFENSE_SCHEDULING',
    label: 'Proposal Defense Scheduling',
    phase: PHASES.C1_PROPOSAL,
    blurb: 'Date, time and venue are set; the panel is notified and gains access to the manuscript under evaluation and its AI summary.',
    gates: [{
      action: 'OPEN_PROPOSAL_DEFENSE',
      label: 'Confirm schedule and open the defense',
      capability: 'defense.schedule',
      actorHint: 'Program Chair/Coordinator or Instructor 2',
      next: 'PROPOSAL_DEFENSE',
      requires: (ctx) => has(ctx.defenses, d => d.type === 'Proposal')
        ? null : 'Schedule the proposal defense first.',
    }],
  },
  {
    key: 'PROPOSAL_DEFENSE',
    label: 'Proposal Defense',
    phase: PHASES.C1_PROPOSAL,
    blurb: 'Panellists annotate privately before deliberation. Only the Panel Chair may record the official verdict, which starts the revision countdown.',
    gates: [{
      action: 'RECORD_PROPOSAL_VERDICT',
      label: 'Record official verdict',
      capability: 'verdict.record',
      actorHint: 'Panel Chair',
      next: (ctx) => {
        const d = ctx.defenses.find(x => x.type === 'Proposal')
        return d?.verdict === VERDICTS.PASSED ? 'IMPLEMENTATION' : 'PROPOSAL_REVISION'
      },
      requires: (ctx) => has(ctx.defenses, d => d.type === 'Proposal' && d.verdict)
        ? null : 'Record the verdict on the scheduled defense first.',
    }],
  },
  {
    key: 'PROPOSAL_REVISION',
    label: 'Proposal Revision',
    phase: PHASES.C1_PROPOSAL,
    blurb: 'The group submits a revised manuscript within the countdown window. Panel Members and the Panel Chair confirm compliance on FM-AAC-SOC-2004.',
    gates: [{
      action: 'CONFIRM_PROPOSAL_REVISION',
      label: 'Confirm revisions complied with',
      capability: 'revision.verify',
      actorHint: 'Panel Chair',
      next: 'IMPLEMENTATION',
      requires: (ctx) => has(ctx.documents, d =>
        d.docType === DOC_TYPES.REVISED_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
        ? null : 'An approved revised manuscript is required.',
    }],
  },
  {
    key: 'IMPLEMENTATION',
    label: 'Implementation & Monitoring',
    phase: PHASES.C2_IMPL,
    blurb: 'Weekly accomplishment logs are submitted and signed by the Adviser; Instructor 2 monitors milestone progress.',
    gates: [{
      action: 'RECOMMEND_FINAL_DEFENSE',
      label: 'Submit FM-AAC-SOC-2005 (Capstone Recommendation)',
      capability: 'finaldefense.recommend',
      actorHint: 'Adviser',
      next: 'FINAL_DEFENSE_SCHEDULING',
      requires: (ctx) => {
        const signed = ctx.weeklyLogs.filter(l => l.status === 'Signed').length
        if (signed < 2) return `At least 2 adviser-signed weekly logs are required (currently ${signed}).`
        if (!has(ctx.documents, d => d.docType === DOC_TYPES.FINAL_MANUSCRIPT)) {
          return 'The group must upload a Final Manuscript version first.'
        }
        return null
      },
    }],
  },
  {
    key: 'FINAL_DEFENSE_SCHEDULING',
    label: 'Final Defense Scheduling',
    phase: PHASES.C2_IMPL,
    blurb: 'Instructor 2 coordinates the final oral defense schedule with the Program Coordinator.',
    gates: [{
      action: 'OPEN_FINAL_DEFENSE',
      label: 'Confirm schedule and open the defense',
      capability: 'defense.schedule',
      actorHint: 'Instructor 2 or Program Chair/Coordinator',
      next: 'FINAL_DEFENSE',
      requires: (ctx) => has(ctx.defenses, d => d.type === 'Final')
        ? null : 'Schedule the final defense first.',
    }],
  },
  {
    key: 'FINAL_DEFENSE',
    label: 'Final Defense',
    phase: PHASES.C2_IMPL,
    blurb: 'Final oral defense. The Panel Chair records the verdict; the Adviser does not evaluate on behalf of the panel.',
    gates: [{
      action: 'RECORD_FINAL_VERDICT',
      label: 'Record official verdict',
      capability: 'verdict.record',
      actorHint: 'Panel Chair',
      next: (ctx) => {
        const d = ctx.defenses.find(x => x.type === 'Final')
        return d?.verdict === VERDICTS.PASSED ? 'URO_CLEARANCE' : 'FINAL_REVISION'
      },
      requires: (ctx) => has(ctx.defenses, d => d.type === 'Final' && d.verdict)
        ? null : 'Record the verdict on the scheduled defense first.',
    }],
  },
  {
    key: 'FINAL_REVISION',
    label: 'Final Revision',
    phase: PHASES.CLEARANCE,
    blurb: 'Post-defense revisions are verified by the panel and the Adviser before the project can be routed to the University Research Office.',
    gates: [{
      action: 'CONFIRM_FINAL_REVISION',
      label: 'Confirm revisions and route to URO',
      capability: 'revision.verify',
      actorHint: 'Panel Chair',
      next: 'URO_CLEARANCE',
      requires: (ctx) => has(ctx.documents, d =>
        d.docType === DOC_TYPES.REVISED_MANUSCRIPT && d.status === DOC_STATUS.APPROVED)
        ? null : 'An approved revised manuscript is required.',
    }],
  },
  {
    key: 'URO_CLEARANCE',
    label: 'URO Clearance',
    phase: PHASES.CLEARANCE,
    blurb: 'The University Research Office verifies the editor’s certificate, the plagiarism clearance certificate and the finalised manuscript before the Dean signs.',
    gates: [{
      action: 'GRANT_URO_CLEARANCE',
      label: 'Grant URO clearance',
      capability: 'uro.clear',
      actorHint: 'University Research Office',
      next: 'DEAN_APPROVAL',
      requires: (ctx) => {
        const missing = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT]
          .filter(t => !has(ctx.documents, d => d.docType === t))
        return missing.length ? `Missing final requirements: ${missing.join(', ')}.` : null
      },
    }],
  },
  {
    key: 'DEAN_APPROVAL',
    label: 'Dean’s Final Approval',
    phase: PHASES.CLEARANCE,
    blurb: 'The Dean applies the final administrative signature to the Approval Sheet after URO clearance.',
    gates: [{
      action: 'DEAN_SIGN',
      label: 'Sign Approval Sheet and archive',
      capability: 'dean.sign',
      actorHint: 'Dean',
      next: 'ARCHIVED',
      requires: (ctx) => {
        const sheet = ctx.forms.find(f => f.formType === 'Approval Sheet')
        if (!sheet) return 'The Approval Sheet has not been generated yet.'
        const pending = sheet.signatories.filter(s => !s.signedAt && s.role !== 'Dean')
        return pending.length
          ? `Awaiting signatures: ${pending.map(s => s.role).join(', ')}.`
          : null
      },
    }],
  },
  {
    key: 'ARCHIVED',
    label: 'Archived',
    phase: PHASES.CLEARANCE,
    blurb: 'The project is sealed into the institutional archive with a Pass/Fail result. No grades are stored.',
    gates: [],
  },
]

export const stageByKey = (key) => STAGES.find(s => s.key === key)
export const stageIndex = (key) => STAGES.findIndex(s => s.key === key)
export const stageLabel = (key) => stageByKey(key)?.label ?? key

export function resolveNext(gate, ctx) {
  return typeof gate.next === 'function' ? gate.next(ctx) : gate.next
}
