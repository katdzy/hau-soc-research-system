import { db } from '../backend/index.js'
import { assertCan, AccessDenied } from '../domain/guard.js'
import { resolveInstitution, authorize } from '../domain/caac.js'
import { getSessionUserId } from '../state/session.js'
import { nowIso } from '../backend/clock.js'

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
    // Permission overrides on this project or on every project (projectId null).
    overrides: (snap.permissionOverrides ?? []).filter(o => o.projectId == null || o.projectId === projectId),
  }
}

/** The store as it is right now — never a snapshot handed in by the caller. */
export const current = () => db.snapshot()

/**
 * The account behind a request, read fresh from the store. The caller's user
 * object is only used for its id, and that id must be the signed-in session:
 * a call made "as" someone else (from the console, with a doctored object) is
 * rejected. In the Firebase build this is the verified ID token.
 */
export function resolveActor(actor) {
  const snap = current()
  const user = (snap.users ?? []).find(u => u.id === actor?.id)
  if (!user) throw new AccessDenied('Unknown account.')
  if (getSessionUserId() !== user.id) throw new AccessDenied('This request does not come from the signed-in account.')
  return { user, snap }
}

/**
 * The write-side check. Every project action calls this before touching data —
 * in the Firebase build it is the first thing each Cloud Function does.
 */
export function authorizeOn(actor, projectId, action, target) {
  const { user, snap } = resolveActor(actor)
  const b = bundle(snap, projectId)
  if (!b) throw new AccessDenied('This project is not available to you.')
  const { ctx, hat } = assertCan(user, action, b, target)
  return { b, ctx, hat, actor: user, snap }
}

/** Same, for capabilities that belong to no project (accounts, group creation). */
export function authorizeInstitution(actor, capability) {
  const { user, snap } = resolveActor(actor)
  const inst = resolveInstitution(user, snap)
  authorize(inst, capability)
  const grant = inst.grants.get(capability)
  return { inst, actor: user, snap, hat: grant?.role ?? null }
}

// Requests already running. A second identical request while the first is in
// flight (a double-click, a resubmitted form) is refused rather than recorded
// twice (R7, T17).
const inflight = new Set()

/** Run `fn` once per key at a time, as one all-or-nothing write. */
export async function perform(key, fn) {
  if (inflight.has(key)) throw new Error('That request is already being processed.')
  inflight.add(key)
  try {
    return await db.transaction(fn)
  } finally {
    inflight.delete(key)
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

export const holdersOf = (snap, globalRole) =>
  (snap.users ?? []).filter(u => (u.globalRoles ?? []).includes(globalRole))

/**
 * Append-only audit trail (R6a): actor, the role hat used, project, action,
 * before → after, timestamp. Never updated, never deleted.
 */
export async function logAudit({
  actorId, hat = null, action, entityType, entityId, projectId = null, before = null, after = null, meta = {},
}) {
  return db.add('auditLogs', {
    actorId, hat, action, entityType, entityId, projectId, before, after,
    at: nowIso(), meta,
  })
}

/**
 * Workflow history (R6b). Stage transitions write from → to; every other
 * state change on a project writes an entry at its current stage.
 */
export async function logHistory({ projectId, fromStage, toStage, actorId, hat = null, action, note = '', privateTo = null }) {
  return db.add('workflowHistory', {
    projectId, fromStage, toStage, actorId, hat, action, note, at: nowIso(),
    // Set for entries only one user may see (a private panel note) — viewBundle.
    ...(privateTo ? { privateTo } : {}),
  })
}

/**
 * Notify by email (R6c). There is no in-app inbox (team decision 2026-09-29).
 * In the Firebase build the deliverOutbox Cloud Function (functions/) sends
 * each one through Resend; the prototype only records it in `outbox`, which
 * the dev tools show. Each entry also becomes a device notification for its recipients
 * (DEVICE_NOTIFICATIONS, revision 2026-10-07; see src/notifications.js) — the
 * same event and text as the email, so the two channels never disagree.
 */
export async function notify(userIds, { projectId = null, type, title, body, event = type }) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return
  const users = current().users ?? []
  await db.add('outbox', {
    event, type, projectId, subject: title, body, at: nowIso(), userIds: unique,
    to: unique.map(id => users.find(u => u.id === id)?.email).filter(Boolean),
  })
}

/** An email to an address rather than to accounts (e.g. registration verification). */
export async function sendMail({ to, event, subject, body, link = null }) {
  return db.add('outbox', { event, projectId: null, subject, body, link, at: nowIso(), userIds: [], to })
}
