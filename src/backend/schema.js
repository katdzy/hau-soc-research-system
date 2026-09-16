// Firestore collections. Kept close to the 17-entity Data Dictionary so the
// prototype and the manuscript's ERD can be read side by side. USER_ROLE is
// folded into `users.globalRole` + `projectAssignments`; AI_SUMMARY, REVIEW,
// DEFENSE, DIGITAL_FORM and DIGITAL_SIGNATURE keep their own collections
// rather than being flattened into the Chapter 5 six-collection sketch.
export const COLLECTIONS = [
  'users',
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
