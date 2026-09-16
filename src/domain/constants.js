// Vocabulary shared by the whole prototype. Names follow the manuscript
// (Requirements Documentation chapter + PRD) so screens map 1:1 to the FR table.

export const GLOBAL_ROLES = {
  STUDENT: 'Student',
  // Not in the manuscript's role list. Prototyping surfaced the gap: a faculty
  // member who is only ever an Adviser or panellist has no institutional role
  // to hold, yet still needs an account. Their authority comes entirely from
  // project assignments — which is exactly the case CAC exists to handle.
  FACULTY: 'Faculty',
  INSTRUCTOR_1: 'Instructor 1',
  INSTRUCTOR_2: 'Instructor 2',
  COORDINATOR: 'Program Chair/Coordinator',
  ASSOCIATE_DEAN: 'Associate Dean',
  DEAN: 'Dean',
  URO: 'University Research Office',
  ADMIN: 'System Administrator',
}

export const PROJECT_ROLES = {
  ADVISER: 'Adviser',
  PANEL_CHAIR: 'Panel Chair',
  PANEL_MEMBER: 'Panel Member',
  INSTRUCTOR_1: 'Instructor 1',
  INSTRUCTOR_2: 'Instructor 2',
}

// PRD FR-26 review decision enumeration.
export const DECISIONS = {
  APPROVE: 'Approve',
  MINOR: 'Approve with Minor Revisions',
  MAJOR: 'Return for Major Revisions',
  REJECT: 'Reject',
  ENDORSE: 'Endorse to Next Stage',
}

// DEFENSE.verdict enumeration (Data Dictionary).
export const VERDICTS = {
  PASSED: 'Passed',
  PASSED_MINOR: 'Passed with Minor Revisions',
  PASSED_MAJOR: 'Passed with Major Revisions',
  FAILED: 'Failed',
}

export const REVISION_WINDOW_DAYS = { Minor: 7, Major: 21 }

// DOCUMENT.status enumeration (Data Dictionary).
export const DOC_STATUS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  FOR_REVISION: 'For Revision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
}

export const DOC_TYPES = {
  TOPIC_PROPOSAL: 'Topic Proposal',
  CONCEPT_PAPER: 'Concept Paper',
  PROPOSAL_MANUSCRIPT: 'Proposal Manuscript',
  FINAL_MANUSCRIPT: 'Final Manuscript',
  REVISED_MANUSCRIPT: 'Revised Manuscript',
  EDITORS_CERTIFICATE: "Editor's Certificate",
  PLAGIARISM_CERTIFICATE: 'Plagiarism Clearance Certificate',
  SOURCE_CODE: 'Source Code Package',
  DEPLOYMENT_DOC: 'Deployment Documentation',
}

// Certificates and code packages are verified at clearance, not reviewed with
// an annotation-and-decision cycle. Only these types enter the review queue.
export const REVIEWABLE_TYPES = [
  DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER,
  DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT,
]

// Milestones that are allowed to trigger AI summarisation (PRD FR-20).
export const AI_MILESTONES = ['Proposal Defense', 'Final Defense']

export const FORMS = {
  F2003: { code: 'FM-AAC-SOC-2003', name: 'Attendance Monitoring and Activity Sheet' },
  F2004: { code: 'FM-AAC-SOC-2004', name: 'Capstone/Thesis Revision Form' },
  F2005: { code: 'FM-AAC-SOC-2005', name: 'Capstone Recommendation Form' },
  APPROVAL: { code: 'Approval Sheet', name: 'Institutional Approval Sheet' },
}

export const PROGRAMS = [
  'BSIT — Web Development',
  'BSIT — Network Administration',
  'BSCS',
  'BSEMC',
  'BS Cybersecurity',
]

export const EMAIL_DOMAINS = ['@hau.edu.ph', '@student.hau.edu.ph']
