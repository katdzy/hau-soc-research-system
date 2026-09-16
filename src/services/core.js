import { db } from '../backend/index.js'

/** Everything the CAC resolver and the stage guards need about one project. */
export function bundle(snap, projectId) {
  const project = (snap.projects ?? []).find(p => p.id === projectId) ?? null
  if (!project) return null
  const of = (col) => (snap[col] ?? []).filter(r => r.projectId === projectId)
  const byDate = (a, b) => new Date(a.createdAt ?? a.at ?? 0) - new Date(b.createdAt ?? b.at ?? 0)

  return {
    project,
    members: of('projectMembers'),
    assignments: of('projectAssignments'),
    documents: of('documents').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
    annotations: of('annotations').sort(byDate),
    reviews: of('reviews').sort(byDate),
    aiSummaries: of('aiSummaries'),
    weeklyLogs: of('weeklyLogs').sort((a, b) => a.weekNo - b.weekNo),
    defenses: of('defenses'),
    forms: of('forms'),
    history: of('workflowHistory').sort((a, b) => new Date(a.at) - new Date(b.at)),
  }
}

export const userById = (snap, id) => (snap.users ?? []).find(u => u.id === id) ?? null
export const nameOf = (snap, id) => userById(snap, id)?.name ?? 'Unknown user'

export const latestOf = (b, docType) =>
  b.documents.filter(d => d.docType === docType)
    .sort((a, b2) => b2.versionNumber - a.versionNumber)[0] ?? null

export const assigneeIds = (b, roleType) =>
  b.assignments.filter(a => a.roleType === roleType).map(a => a.userId)

export const memberIds = (b) => b.members.map(m => m.userId)

/** Append-only audit trail (FR-71/72). Never updated, never deleted. */
export async function logAudit(actorId, action, entityType, entityId, projectId, meta = {}) {
  return db.add('auditLogs', {
    actorId, action, entityType, entityId, projectId,
    at: new Date().toISOString(), meta,
  })
}

/**
 * Stands in for the SMTP notification service. In the Firebase build this is a
 * Cloud Function trigger writing to `notifications` and dispatching email;
 * here the in-app inbox is the observable half so the trigger matrix can be
 * tested without a mail server.
 */
export async function notify(userIds, { projectId, type, title, body }) {
  const unique = [...new Set(userIds.filter(Boolean))]
  await Promise.all(unique.map(userId => db.add('notifications', {
    userId, projectId, type, title, body, read: false, at: new Date().toISOString(),
  })))
}
