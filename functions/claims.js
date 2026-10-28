/**
 * The custom claims firestore.rules and storage.rules read, built from one
 * account's rows. Pure — no Firebase — so the root Vitest suite tests it
 * (src/__tests__/claims.test.js).
 *
 *   userId        the account's id in `users` (not the Auth uid: the app links
 *                 the two by email). Rules compare record owners against it.
 *   globalRoles   ['Dean'], ['Student'], [] …
 *   programScope  programs a Program Chair/Coordinator covers
 *   projects      { <projectId>: ['Member' | 'Adviser' | 'Panel Member' | …] }
 *   hidden        true while a System Administrator override revokes
 *                 project.view or document.read for every project
 *
 * Mirrors src/domain/caac.js: resolveContext() (who holds which Project-Based
 * Role: memberships, plus assignments not Declined), isActiveAccount() (an
 * inactive or unverified account holds nothing) and overridesFor() (deny-only,
 * not lifted). Stage conditions stay in the rules; claims only say who someone
 * is on each project. Keep in step with caac.js.
 */

/** Firebase refuses claims whose JSON is over 1000 bytes. */
export const MAX_CLAIMS_BYTES = 1000

// Revoking either one on a project closes the project to that account in the
// rules, which cannot tell the two apart.
const HIDING = ['project.view', 'document.read']

const ARCHIVED = 'ARCHIVED'

const isActive = (user) => Boolean(user) && user.status === 'Active' && user.emailVerified !== false

const sizeOf = (claims) => new TextEncoder().encode(JSON.stringify(claims)).length

const empty = (user) => ({ userId: user?.id ?? null, globalRoles: [], programScope: [], projects: {} })

/**
 * → { claims, dropped }: `dropped` lists project ids left out to stay under
 * MAX_CLAIMS_BYTES — archived projects first. Empty when everything fits.
 */
export function buildClaims({ user, members = [], assignments = [], overrides = [], stages = {} }) {
  if (!isActive(user)) return { claims: empty(user), dropped: [] }

  const roles = new Map()
  const hold = (projectId, role) => {
    if (!projectId) return
    roles.set(projectId, [...new Set([...(roles.get(projectId) ?? []), role])])
  }
  for (const m of members) if (m.userId === user.id) hold(m.projectId, 'Member')
  for (const a of assignments) {
    if (a.userId === user.id && a.status !== 'Declined') hold(a.projectId, a.roleType)
  }

  const revoked = overrides.filter(o =>
    o.userId === user.id && o.effect === 'deny' && !o.liftedAt && HIDING.includes(o.capability))
  const hidden = revoked.some(o => o.projectId == null)
  for (const o of revoked) if (o.projectId != null) roles.delete(o.projectId)

  const claims = {
    userId: user.id,
    globalRoles: [...(user.globalRoles ?? [])],
    programScope: [...(user.programScope ?? [])],
    projects: hidden ? {} : Object.fromEntries([...roles].sort(([a], [b]) => a.localeCompare(b))),
    ...(hidden ? { hidden: true } : {}),
  }
  if (sizeOf(claims) <= MAX_CLAIMS_BYTES) return { claims, dropped: [] }

  // Too many projects to fit. Keep the ones still in progress; an archived
  // project stays open to the Dean and Associate Dean through their Global
  // Role, so leaving it out costs least.
  const order = Object.keys(claims.projects)
    .sort((a, b) => Number(stages[a] === ARCHIVED) - Number(stages[b] === ARCHIVED))
  const kept = { ...claims, projects: {} }
  const dropped = []
  for (const id of order) {
    const next = { ...kept.projects, [id]: claims.projects[id] }
    if (sizeOf({ ...kept, projects: next }) <= MAX_CLAIMS_BYTES) kept.projects = next
    else dropped.push(id)
  }
  return { claims: kept, dropped }
}

/** Same claims, ignoring key order — so an unchanged account is not rewritten. */
export function sameClaims(a = {}, b = {}) {
  const norm = (c) => JSON.stringify(c ?? {}, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v)
  return norm(a) === norm(b)
}
