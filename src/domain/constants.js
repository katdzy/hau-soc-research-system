// Vocabulary shared by the whole prototype. Names follow the finalized proposal
// manuscript (Requirements Documentation, Tables 1–2, Data Dictionary) and the
// preferred terms in the Capstone 2 knowledge base.

// Global Roles — the user's institutional position. A user may hold several
// (USER_ROLE is many-to-many) or none: a faculty member who is only ever an
// Adviser or Panel Member holds no Global Role at all, and gets every bit of
// their authority from the projects they are assigned to.
export const GLOBAL_ROLES = {
  STUDENT: 'Student',
  COORDINATOR: 'Program Chair/Coordinator',
  ASSOCIATE_DEAN: 'Associate Dean',
  DEAN: 'Dean',
  URO: 'University Research Office',
  ADMIN: 'System Administrator',
}

// Project-Based Roles — held per project (Instructor 1 and 2 included, per
// Decision #15). The same person can hold different ones on different projects.
export const PROJECT_ROLES = {
  INSTRUCTOR_1: 'Instructor 1',
  INSTRUCTOR_2: 'Instructor 2',
  ADVISER: 'Adviser',
  PANEL_MEMBER: 'Panel Member',
  PANEL_CHAIR: 'Panel Chair',
}

export const PANEL_ROLES = [PROJECT_ROLES.PANEL_CHAIR, PROJECT_ROLES.PANEL_MEMBER]

// Account type follows the registration domain.
export const EMAIL_DOMAINS = {
  STUDENT: '@student.hau.edu.ph',
  FACULTY: '@hau.edu.ph',
}
export const accountType = (email = '') =>
  email.toLowerCase().endsWith(EMAIL_DOMAINS.STUDENT) ? 'Student'
    : email.toLowerCase().endsWith(EMAIL_DOMAINS.FACULTY) ? 'Faculty'
      : null

// USER.account_status enumeration (Data Dictionary I-1).
export const ACCOUNT_STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Suspended' }

// REVIEW.decision enumeration (Data Dictionary I-9).
export const DECISIONS = {
  APPROVE: 'Approve',
  MINOR: 'Approve with Minor Revisions',
  MAJOR: 'Return for Major Revisions',
  REJECT: 'Reject',
  ENDORSE: 'Endorse to Next Stage',
}

// REVIEW.category enumeration — used for annotations.
export const ANNOTATION_CATEGORIES = [
  'General Comment', 'Technical Concern', 'Methodology Concern', 'Documentation Issue',
  'Formatting Issue', 'Required Revision', 'Recommendation',
]

// The Panel Chair's three verdicts (Requirement Analysis p. 32, Panel Chair role
// p. 43). The Data Dictionary's "Passed"/"Failed" values are replaced here by
// "Re-defense" — Open Questions #10.
export const VERDICTS = {
  MINOR: 'Passed with Minor Revisions',
  MAJOR: 'Passed with Major Revisions',
  REDEFENSE: 'Re-defense',
}

// 1 week for minor, 2 weeks for major, per the current process.
export const REVISION_WINDOW_DAYS = { Minor: 7, Major: 14 }

// DOCUMENT.status enumeration (Data Dictionary I-7).
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
  DEPLOYMENT_INFO: 'Deployment Information',
  // Videos are never stored — students submit a link to an external host.
  PRESENTATION_VIDEO: 'Presentation Video (link)',
}

export const LINK_TYPES = [DOC_TYPES.PRESENTATION_VIDEO]

// Certificates, deployment information and video links are verified at
// clearance; only these types go through annotation and a review decision.
export const REVIEWABLE_TYPES = [
  DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER,
  DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT,
]

// AI summaries are generated only for the complete manuscript at these two
// milestones (FR "AI-assisted manuscript summaries").
export const AI_MILESTONES = {
  Proposal: { milestone: 'Proposal Defense', docType: DOC_TYPES.PROPOSAL_MANUSCRIPT },
  Final: { milestone: 'Final Defense', docType: DOC_TYPES.FINAL_MANUSCRIPT },
}
export const AI_DISCLOSURE =
  'AI-generated summary (Gemini Flash). Machine-generated and for decision support only — ' +
  'it is not an evaluation and does not replace reading the manuscript.'

export const FORMS = {
  F2003: { code: 'FM-AAC-SOC-2003', name: 'Attendance Monitoring and Activity Sheet' },
  F2004: { code: 'FM-AAC-SOC-2004', name: 'Capstone Revision Form' },
  F2005: { code: 'FM-AAC-SOC-2005', name: 'Capstone Recommendation Form' },
  APPROVAL: { code: 'Approval Sheet', name: 'Approval Sheet' },
}

export const PROGRAMS = [
  'BSIT — Web Development',
  'BSIT — Network Administration',
  'BS Computer Science',
  'BS Entertainment and Multimedia Computing',
  'BS Cybersecurity',
]
