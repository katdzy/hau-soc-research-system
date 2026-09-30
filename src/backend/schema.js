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
//   WORKFLOW_HISTORY          → workflowHistory  NOTIFICATION      → outbox (email only)
//   AUDIT_LOG                 → auditLogs
//   (no entity)               → permissionOverrides (System Administrator deny overrides)
//   (no entity)               → settings (one `global` document: revision countdown)
//
// annotations.position (OQ#12 — not in the data dictionary): page + boxes in
// page fractions + quoted words (domain/annotations.js). documents.storagePath
// points at the file's bytes in the file store (files.js), never in Firestore.
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
  'auditLogs',
  'permissionOverrides',
  'settings',
  // Notifications are email only (team decision 2026-09-29): one row per email
  // (R6c). The prototype never sends them; the dev tools show them as the outbox.
  'outbox',
]

export const emptyStore = () =>
  Object.fromEntries(COLLECTIONS.map(c => [c, {}]))
