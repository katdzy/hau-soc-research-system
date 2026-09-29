// Dev-only helpers: who holds which hat, for the persona switcher and the
// sign-in demo panel.
import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'
import { bundle } from '../services/core.js'
import { worklistRow } from '../services/worklist.js'

/** "G1" / "NW2" for seeded groups, otherwise a shortened title. */
export const projectLabel = (p) =>
  /^p_[a-z]+\d+$/.test(p?.id ?? '') ? p.id.slice(2).toUpperCase()
    : (p?.title ?? '?').length > 28 ? `${p.title.slice(0, 27)}…` : p?.title ?? '?'

/** [{ label, role }] — the user's Project-Based Roles, plus group membership. */
export function hatsOf(user, snap) {
  const projects = snap.projects ?? []
  const pOf = (id) => projects.find(p => p.id === id)
  return [
    ...(snap.projectMembers ?? []).filter(m => m.userId === user.id)
      .map(m => ({ label: projectLabel(pOf(m.projectId)), role: 'Member' })),
    ...(snap.projectAssignments ?? []).filter(a => a.userId === user.id)
      .map(a => ({ label: projectLabel(pOf(a.projectId)), role: a.roleType })),
  ]
}

const isStudent = (u) => (u.globalRoles ?? []).includes(G.STUDENT)

/** Faculty and offices first, then students; each alphabetical. */
export const personaOrder = (users) =>
  [...users].sort((a, b) => Number(isStudent(a)) - Number(isStudent(b)) || a.name.localeCompare(b.name))

/** §6 personas first; NPC accounts (npcs.js) separately, so they don't bury them. */
export const splitPersonas = (users) => ({
  personas: personaOrder(users.filter(u => !u.npc)),
  npcs: personaOrder(users.filter(u => u.npc)),
})

/** Global Roles that run an office, in the order the demo panel lists them. */
export const OFFICES = [G.COORDINATOR, G.DEAN, G.ASSOCIATE_DEAN, G.URO, G.ADMIN]
const ROLE_ORDER = [P.ADVISER, P.INSTRUCTOR_1, P.INSTRUCTOR_2, P.PANEL_CHAIR, P.PANEL_MEMBER]
const rank = (role) => { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.length : i }

/** A §6 group (G1–G4) rather than an NPC group. */
export const isPersonaProject = (p) => /^p_g\d+$/.test(p.id)

/**
 * What `user` owes on one project, from the same worklist row the dashboard
 * shows: `ready` steps they can take now, `waiting` gates they hold but that
 * are blocked, and where the first of them is done. Null when the project is
 * not visible to them.
 */
export function turnOf(snap, user, p, b = bundle(snap, p.id)) {
  const row = worklistRow(snap, user, p, b)
  if (!row) return null
  const open = row.gates.filter(g => !g.blocker)
  const first = open[0]
    ? { label: open[0].gate.label, tab: open[0].gate.handledIn ?? 'overview', hat: open[0].hat }
    : row.tasks[0] ? { label: row.tasks[0].label, tab: row.tasks[0].tab ?? 'overview', hat: row.tasks[0].hat } : null
  const blocked = row.gates.find(g => g.blocker)
  return {
    ready: open.length + row.tasks.length,
    next: first,
    waiting: blocked ? { label: blocked.gate.label, why: blocked.blocker } : null,
  }
}

/**
 * Everyone with a part in one project: the group, the faculty assigned to it
 * (all their hats on it), and any office that can act on it right now.
 */
export function castOf(snap, p) {
  const users = snap.users ?? []
  const byId = (id) => users.find(u => u.id === id)
  const b = bundle(snap, p.id)
  const entry = (user, roles) => ({ user, roles, turn: turnOf(snap, user, p, b) })

  const students = b.members.map(m => byId(m.userId)).filter(Boolean)
    .sort((x, y) => Number(Boolean(x.npc)) - Number(Boolean(y.npc)) || x.name.localeCompare(y.name))
    .map(u => entry(u, ['Member']))

  const roles = new Map()
  for (const a of b.assignments) roles.set(a.userId, [...(roles.get(a.userId) ?? []), a.roleType])
  const faculty = [...roles].map(([id, rs]) => [byId(id), rs.sort((x, y) => rank(x) - rank(y))])
    .filter(([u]) => u)
    .sort(([, x], [, y]) => rank(x[0]) - rank(y[0]))
    .map(([u, rs]) => entry(u, rs))

  const inCast = new Set([...students, ...faculty].map(e => e.user.id))
  const offices = users
    .filter(u => !inCast.has(u.id) && (u.globalRoles ?? []).some(r => OFFICES.includes(r)))
    .map(u => ({ user: u, turn: turnOf(snap, u, p, b) }))
    .filter(e => e.turn?.ready)
    .map(e => ({ ...e, roles: [e.turn.next?.hat ?? OFFICES.find(r => e.user.globalRoles.includes(r))] }))

  const all = [...faculty, ...offices, ...students]
  return { project: p, students, faculty, offices, next: all.filter(e => e.turn?.ready) }
}
