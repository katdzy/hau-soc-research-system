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
    evaluations: of('evaluations'),
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
  if (!ctx.grants.has(capability) && actor.actingAs) {
    // Would another of the actor's roles allow it? Then say which context to use.
    const other = resolveContext({ ...actor, actingAs: null }, b).grants.get(capability)
    if (other) throw new Error(`You are acting as ${actor.actingAs}. Switch to your ${other.role} context to do this.`)
  }
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
 * Stands in for notificationService.js. There are no in-system notifications:
 * every workflow event is an email, sent through Resend by the same Cloud
 * Function that updates the workflow record. Locally the message is written to
 * the `emails` collection, which only the System Administrator's Email Log
 * reads — it is the send record, not an inbox.
 */
export async function sendEmail(userIds, { projectId, type, title, body, lines = [], link = null }) {
  const unique = [...new Set(userIds.filter(Boolean))]
  const sentAt = new Date().toISOString()
  await Promise.all(unique.map(userId => db.add('emails', {
    userId, projectId, template: type, subject: title, body, lines, link, sentAt,
  })))
  return { to: unique, subject: title, body, lines, link, sentAt }
}
