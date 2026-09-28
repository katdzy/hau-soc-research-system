// Pieces shared by the System Administrator's Accounts and CAAC pages.

import { GLOBAL_ROLES as G, PROJECT_ROLES, ACCOUNT_STATUS, PROGRAM_CODES, accountType } from '../../domain/constants.js'
import { caacTag } from '../../domain/caac.js'

export const ROLE_ORDER = Object.values(PROJECT_ROLES)

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const programCodes = (programs = []) => programs.map(p => PROGRAM_CODES[p] ?? p).join(', ')

export const facultyOf = (users) => users.filter(u => accountType(u.email) === 'Faculty')
export const studentsOf = (users) => users.filter(u => accountType(u.email) === 'Student')

/** Search by name or email; an empty query matches everyone. */
export const matching = (query) => {
  const q = query.trim().toLowerCase()
  return (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
}

/** Who holds which Project-Based Role where — Capstone 1 blocks and project assignments. */
export function roleIndex(snap) {
  const projects = snap.projects ?? []
  const sections = (snap.sections ?? []).filter(s => s.course === 'Capstone 1')
  const assignments = (snap.projectAssignments ?? []).filter(a => a.status !== 'Declined')
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))
  return {
    sections,
    assignments,
    assignmentsOn: (projectId) => assignments.filter(a => a.projectId === projectId),
    blocksOf: (userId) => sections.filter(s => s.instructorId === userId),
    /** { [role]: [{ a, p }] } — every Project-Based Role key is present. */
    holdingsOf: (userId) => {
      const byRole = Object.fromEntries(ROLE_ORDER.map(r => [r, []]))
      for (const a of assignments) {
        const p = projectById[a.projectId]
        if (a.userId === userId && p) byRole[a.roleType]?.push({ a, p })
      }
      return byRole
    },
  }
}

/** Name over email — the identity cell used by every admin table. */
export function Person({ user, flagStatus = false }) {
  return (
    <div className="person">
      <strong>{user.name}</strong>
      <span className="mono">{user.email}</span>
      {!user.emailVerified && <span className="person-flag">Email not verified</span>}
      {flagStatus && user.emailVerified && user.status !== ACCOUNT_STATUS.ACTIVE && (
        <span className="person-flag">{user.status}</span>
      )}
    </div>
  )
}

/** Only a departure from Active draws the eye. */
export function Status({ status }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status}</span>
}

export function GlobalTags({ user }) {
  const roles = user.globalRoles ?? []
  if (!roles.length) return <span className="faint small">—</span>
  return (
    <div className="inline">
      {roles.map(r => (
        <span key={r} className="tag">
          {caacTag(r)}
          {r === G.COORDINATOR && user.programScope?.length > 0 && (
            <span className="tag-scope">{programCodes(user.programScope)}</span>
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * A faculty member's Project-Based Roles as one tag each, counted rather than
 * listed — Instructor 1 by the blocks taught, the rest by groups. The groups
 * themselves are itemised on the CAAC page.
 */
export function ProjectTags({ blocks, byRole }) {
  const tags = ROLE_ORDER.flatMap(role => {
    const held = byRole[role].map(h => h.p)
    if (role === PROJECT_ROLES.INSTRUCTOR_1 && blocks.length) {
      const scope = blocks.length <= 2 ? blocks.map(s => s.block).join(', ') : plural(blocks.length, 'block')
      return [[role, scope, `${blocks.map(s => s.block).join(', ')} · ${plural(held.length, 'group')}`]]
    }
    return held.length ? [[role, held.length, held.map(p => `${p.groupName} (${p.block})`).join(', ')]] : []
  })
  if (!tags.length) return <span className="faint small">—</span>
  return (
    <div className="inline">
      {tags.map(([role, scope, detail]) => (
        <span key={role} className="tag" title={`${role}: ${detail}`}>
          {caacTag(role)}<span className="tag-scope">{scope}</span>
        </span>
      ))}
    </div>
  )
}
