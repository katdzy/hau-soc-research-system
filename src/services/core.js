import { db } from '../backend/index.js'
import { resolveContext, authorize } from '../domain/caac.js'

/** Everything the CAAC resolver and the stage guards need about one project. */
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
    defenses: of('defenses').sort(byDate),
    forms: of('forms'),
    history: of('workflowHistory').sort((a, b) => new Date(a.at) - new Date(b.at)),
  }
}

/**
 * The write-side CAAC check. Every action calls this before touching data —
 * in the Firebase build it is the first thing each Cloud Function does.
 */
export function authorizeOn(actor, snap, projectId, capability) {
  const b = bundle(snap, projectId)
  if (!b) throw new Error('Project not found')
  const ctx = resolveContext(actor, b)
  authorize(ctx, capability)
  return { b, ctx }
}

export const userById = (snap, id) => (snap.users ?? []).find(u => u.id === id) ?? null
export const nameOf = (snap, id) => userById(snap, id)?.name ?? 'Unknown user'

export const latestOf = (b, docType) =>
  b.documents.filter(d => d.docType === docType)
    .sort((a, b2) => b2.versionNumber - a.versionNumber)[0] ?? null

export const assigneeIds = (b, roleType) =>
  b.assignments.filter(a => a.roleType === roleType).map(a => a.userId)

export const memberIds = (b) => b.members.map(m => m.userId)

export const holdersOf = (snap, globalRole) =>
  (snap.users ?? []).filter(u => (u.globalRoles ?? []).includes(globalRole))

/** Append-only audit trail. Never updated, never deleted. */
export async function logAudit(actorId, action, entityType, entityId, projectId, meta = {}) {
  return db.add('auditLogs', {
    actorId, action, entityType, entityId, projectId,
    at: new Date().toISOString(), meta,
  })
}

/**
 * Stands in for notificationService.js. In the Firebase build a Cloud Function
 * writes the notification and sends the email through Resend in the same
 * event that updates the workflow record; here the in-app list is the
 * observable half, so the trigger matrix can be checked without a mail server.
 */
export async function notify(userIds, { projectId, type, title, body }) {
  const unique = [...new Set(userIds.filter(Boolean))]
  await Promise.all(unique.map(userId => db.add('notifications', {
    userId, projectId, type, title, body, read: false, at: new Date().toISOString(),
  })))
}
