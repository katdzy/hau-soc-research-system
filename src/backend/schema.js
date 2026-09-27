// Firestore collections. Kept close to the 17-entity Data Dictionary so the
// prototype and the manuscript's ERD can be read side by side (Open Questions
// #8 asks for exactly this mapping):
//
//   USER + USER_ROLE (global) → users (globalRoles[], programScope[])
//   PROJECT_ASSIGNMENT        → projectAssignments (project-based roles)
//   PROJECT_MEMBER            → projectMembers
//   DOCUMENT                  → documents        REVIEW (comments) → annotations
//   REVIEW (decisions)        → reviews          AI_SUMMARY        → aiSummaries
//   WEEKLY_ACCOMPLISHMENT     → weeklyLogs       DEFENSE           → defenses
//   DIGITAL_FORM + DIGITAL_SIGNATURE → forms (signatories embedded)
//   WORKFLOW_HISTORY          → workflowHistory  NOTIFICATION      → notifications
//   AUDIT_LOG                 → auditLogs
//
// `sections` is not one of the 17 entities. Requirement Analysis lists
// "programs, sections, and group assignments" as data to capture, and
// Instructor 1 forwards rosters per block, so the prototype needs it —
// Open Questions #11.
export const COLLECTIONS = [
  'users',
  'sections',
  'projects',
  'projectMembers',
  'projectAssignments',
  'documents',
  'annotations',
  'reviews',
  'aiSummaries',
  'weeklyLogs',
  'defenses',
  'forms',
  'workflowHistory',
  'notifications',
  'auditLogs',
]

export const emptyStore = () =>
  Object.fromEntries(COLLECTIONS.map(c => [c, {}]))
