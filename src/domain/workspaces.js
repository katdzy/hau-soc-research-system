// The "Acting as" contexts (Figma F02: one account, several roles). A context
// is one role the user holds — a Global Role, or a Project-Based Role across
// every project it is held on — and it decides the rail and the dashboard.
// It is presentation only: what the user may do is still the guard's answer
// for their Global Role plus their role on the project, at its stage (§2.2).

import { GLOBAL_ROLES as G, PROJECT_ROLES as P, COURSES } from './constants.js'
import { sectionNow } from './stages.js'

/**
 * Every context, in the order the switcher lists them: offices first, then
 * project roles. `nav` is the rail (Figma 01 · Dashboards); each entry is a
 * route, and `cap` hides it unless the institution grants that capability.
 */
export const CONTEXTS = [
  {
    key: 'admin', role: G.ADMIN, heading: 'System Administrator', global: true,
    nav: [
      { to: '/admin/accounts', label: 'User accounts', badge: 'toActivate' },
      { to: '/admin/caac', label: 'Role configuration' },
      { to: '/admin/settings', label: 'Global settings' },
      { to: '/audit', label: 'Audit log' },
      { to: '/reports', label: 'Reports' },
      { to: '/records', label: 'Archive' },
    ],
  },
  {
    key: 'dean', role: G.DEAN, heading: 'Dean', global: true,
    nav: [
      { to: '/approvals', label: 'Executive approvals' },
      { to: '/school', label: 'Student capstone & thesis' },
      { to: '/versions', label: 'Version history' },
      { to: '/completions', label: 'Completion records' },
      { to: '/reports', label: 'Reports' },
      { to: '/records', label: 'Archive' },
    ],
  },
  {
    key: 'associate-dean', role: G.ASSOCIATE_DEAN, heading: 'Associate Dean', global: true,
    nav: [
      { to: '/approvals', label: 'Executive approvals' },
      { to: '/school', label: 'Student capstone & thesis' },
      { to: '/versions', label: 'Version history' },
      { to: '/completions', label: 'Completion records' },
      { to: '/reports', label: 'Reports' },
      { to: '/records', label: 'Archive' },
    ],
  },
  {
    key: 'coordinator', role: G.COORDINATOR, heading: 'Program Chair', global: true,
    nav: [
      { to: '/routing', label: 'Assignments & routing' },
      { to: '/sections', label: 'Sections' },
      { to: '/versions', label: 'Version history' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    key: 'uro', role: G.URO, heading: 'URO', global: true,
    nav: [
      { to: '/clearance', label: 'Clearance queue' },
      { to: '/cleared', label: 'Cleared projects' },
      { to: '/versions', label: 'Version history' },
    ],
  },
  {
    key: 'instructor-1', role: P.INSTRUCTOR_1, heading: 'Instructor 1',
    nav: [
      { to: '/rosters', label: 'Groups & rosters' },
      { to: '/versions', label: 'Version history' },
      { to: '/defended', label: 'Defended groups' },
      { to: '/completed', label: 'Completed groups' },
    ],
  },
  {
    key: 'instructor-2', role: P.INSTRUCTOR_2, heading: 'Instructor 2',
    nav: [
      { to: '/scheduling', label: 'Rosters & scheduling' },
      { to: '/versions', label: 'Version history' },
      { to: '/completed', label: 'Completed groups' },
    ],
  },
  {
    key: 'adviser', role: P.ADVISER, heading: 'Adviser',
    nav: [
      { to: '/advisees', label: 'My advisees' },
      { to: '/versions', label: 'Version history' },
      { to: '/weekly-logs', label: 'Weekly logs' },
      { to: '/completed', label: 'Completed groups' },
    ],
  },
  {
    key: 'panel-chair', role: P.PANEL_CHAIR, heading: 'Panel Chair',
    nav: [{ to: '/panels', label: 'Assigned panels' }],
  },
  {
    key: 'panel-member', role: P.PANEL_MEMBER, heading: 'Panel Member',
    nav: [{ to: '/panels', label: 'Assigned panels' }],
  },
  // A group member's rail is their project's tabs (Shell builds those links).
  { key: 'student', role: 'Group member', heading: 'Student', member: true, nav: [] },
]

export const contextByKey = (key) => CONTEXTS.find(c => c.key === key) ?? null

const live = (snap, id) => (snap.projects ?? []).find(p => p.id === id)

/** Whether a worklist row's project is open to this account through `role` itself (CAAC project.view). */
export const opensTo = (row, role) => row.ctx.active.some(g => g.role === role && g.cap === 'project.view')

/**
 * The contexts this account holds, each with the projects it covers and the
 * short scope line the switcher shows ("Adviser — all advisees").
 *
 * With `rows` (the guard-filtered worklist), a Project-Based Role counts only
 * on the groups it opens right now — so a proposed Adviser, whose access waits
 * for the Dean and AD (S2.2), holds no "Adviser" context until the appointment
 * is approved, and an Instructor 2 none before the group reaches Capstone 2.
 */
export function contextsOf(user, snap, rows = null) {
  if (!user) return []
  const roles = user.globalRoles ?? []
  const assignments = (snap.projectAssignments ?? [])
    .filter(a => a.userId === user.id && a.status !== 'Declined' && live(snap, a.projectId))
  const memberships = (snap.projectMembers ?? []).filter(m => m.userId === user.id && live(snap, m.projectId))
  const teaches = (snap.sections ?? []).filter(s => s.instructorId === user.id && s.course === COURSES.C1)

  const out = []
  for (const c of CONTEXTS) {
    let projectIds = []
    if (c.member) {
      if (!memberships.length) continue
      projectIds = memberships.map(m => m.projectId)
    } else if (c.global) {
      if (!roles.includes(c.role)) continue
    } else {
      projectIds = [...new Set(assignments.filter(a => a.roleType === c.role).map(a => a.projectId))]
      if (rows) projectIds = projectIds.filter(id => rows.some(r => r.project.id === id && opensTo(r, c.role)))
      // Teaching a Capstone 1 section makes one Instructor 1 before any group exists.
      if (!projectIds.length && !(c.role === P.INSTRUCTOR_1 && teaches.length)) continue
    }
    const sections = [...new Set(projectIds.map(id => sectionNow(live(snap, id)).section))]
    out.push({ ...c, projectIds, scope: scopeOf(c, user, sections, teaches) })
  }
  return out
}

function scopeOf(c, user, sections, teaches) {
  switch (c.key) {
    case 'admin': return 'Accounts and roles'
    case 'dean': case 'associate-dean': return 'School of Computing'
    case 'uro': return 'University Research Office'
    case 'coordinator': return user.programScope?.length ? `${user.programScope.length} program${user.programScope.length > 1 ? 's' : ''}` : 'Your programs'
    case 'instructor-1': return [...new Set([...teaches.map(s => s.block), ...sections])].join(', ') || 'Capstone 1'
    case 'instructor-2': return 'Capstone 2'
    case 'adviser': return 'all advisees'
    case 'panel-chair': return 'all chaired groups'
    case 'panel-member': return 'all assigned groups'
    case 'student': return sections.join(', ')
    default: return ''
  }
}

/**
 * Which context to open: the one saved for this account if it still holds it,
 * else the role behind the first thing waiting on them, else the first held.
 */
export function pickContext(held, saved, firstHat = null) {
  if (!held.length) return null
  return held.find(c => c.key === saved)
    ?? (firstHat && held.find(c => c.role === firstHat))
    ?? held[0]
}

/** Worklist rows that belong to one context: the projects that role opens to this account. */
export function rowsIn(context, rows) {
  if (!context) return rows
  if (context.member) return rows.filter(r => r.ctx.isMember)
  if (context.global) return rows.filter(r => r.ctx.active.some(g => g.role === context.role))
  return rows.filter(r => opensTo(r, context.role))
}

/** The hats a context's dashboard counts work for. */
export const hatsOf = (context) => (context?.member ? ['Student'] : context ? [context.role] : [])
