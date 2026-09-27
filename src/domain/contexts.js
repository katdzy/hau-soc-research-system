// "Acting as" contexts (wireframes S-02 … S-14). Each role a user holds is a
// context with its own menu; switching context switches which CAAC policies
// apply (see `actingAs` in caac.js). Offices that the wireframes do not cover
// yet (Instructor 1 and 2, Dean, Associate Dean, URO, System Administrator)
// keep the shared project workspace.

import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from './constants.js'
import { phaseStages, PHASES } from './stages.js'

const CAPSTONE_1 = phaseStages(PHASES.IDEATION, PHASES.PROPOSAL)
export const inCapstone1 = (project) => CAPSTONE_1.includes(project?.currentStage)

const shortProgram = (programs = []) =>
  [...new Set(programs.map(p => p.split(' — ')[0]))].join(', ')

/** Every context this user can act in, in a stable order. */
export function actingContexts(user, snap) {
  if (!user) return []
  const global = user.globalRoles ?? []
  const mine = (snap.projectAssignments ?? []).filter(a => a.userId === user.id && a.status !== 'Declined')
  const groupsFor = (role) => mine.filter(a => a.roleType === role)
    .map(a => (snap.projects ?? []).find(p => p.id === a.projectId)?.groupName).filter(Boolean)
  const teaches = (snap.sections ?? []).some(s => s.instructorId === user.id && s.course === 'Capstone 1')

  const out = []
  const add = (role, label, detail) => out.push({ role, label, detail })

  if (global.includes(G.STUDENT)) add(G.STUDENT, 'Student')
  for (const role of [P.ADVISER, P.PANEL_CHAIR, P.PANEL_MEMBER, P.INSTRUCTOR_1, P.INSTRUCTOR_2]) {
    const groups = groupsFor(role)
    if (groups.length || (role === P.INSTRUCTOR_1 && teaches)) {
      add(role, role, groups.length > 2 ? `${groups.length} groups` : groups.join(' · '))
    }
  }
  if (global.includes(G.COORDINATOR)) add(G.COORDINATOR, `Program Coordinator — ${shortProgram(user.programScope)}`)
  for (const role of [G.DEAN, G.ASSOCIATE_DEAN, G.URO, G.ADMIN]) {
    if (global.includes(role)) add(role, role)
  }
  return out
}

/**
 * The menu for each context. `lockedUntil` greys an item out with a reason —
 * the student's Weekly Logs stay locked through Capstone 1.
 */
export function navFor(role, { project } = {}) {
  switch (role) {
    case G.STUDENT: return {
      heading: 'Student',
      items: [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/project', label: 'My Project' },
        { to: '/submit', label: 'Submissions' },
        { to: '/versions', label: 'Version History' },
        { to: '/feedback', label: 'Feedback & Annotations' },
        { to: '/logs', label: 'Weekly Logs', locked: !project || inCapstone1(project) ? 'Capstone 2' : null },
        { to: '/defense', label: 'Defense' },
        { to: '/final', label: 'Final Requirements' },
      ],
    }
    case P.ADVISER: return {
      heading: 'Adviser context',
      items: [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/advisees', label: 'My Advisees' },
        { to: '/queue', label: 'Review Queue' },
        { to: '/annotations', label: 'Annotations' },
        { to: '/logs', label: 'Weekly Logs' },
        { to: '/clearance', label: 'Defense Clearance' },
        { to: '/revisions', label: 'Revision Verification' },
      ],
    }
    case P.PANEL_MEMBER:
    case P.PANEL_CHAIR: return {
      heading: role === P.PANEL_CHAIR ? 'Panel Chair context' : 'Panel context',
      items: [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/panels', label: 'Assigned Panels' },
        { to: '/manuscripts', label: 'Manuscripts' },
        { to: '/summaries', label: 'AI Summaries' },
        { to: '/annotations', label: 'My Annotations' },
        { to: '/evaluation', label: 'Evaluation Form' },
        ...(role === P.PANEL_CHAIR ? [{ to: '/verdict', label: 'Verdict Recording' }] : []),
        { to: '/revisions', label: 'Revision Confirmation' },
      ],
    }
    case G.COORDINATOR: return {
      heading: 'Coordinator',
      items: [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/projects', label: 'All Projects' },
        { to: '/adviser-assignment', label: 'Adviser Assignment' },
        { to: '/panel-assignment', label: 'Panel Assignment' },
        { to: '/endorsement', label: 'Defense Endorsement' },
        { to: '/clearance', label: 'Clearance Routing' },
        { to: '/reports', label: 'Reports' },
      ],
    }
    case G.ADMIN: return {
      heading: 'System Administrator',
      items: [
        { to: '/', label: 'Accounts & CAAC', end: true },
        { to: '/audit', label: 'Audit Trail' },
        { to: '/emails', label: 'Email Log' },
        { to: '/records', label: 'Records Archive' },
        { to: '/reports', label: 'Reports' },
      ],
    }
    case G.DEAN:
    case G.ASSOCIATE_DEAN: return {
      heading: role,
      items: [
        { to: '/', label: 'Worklist', end: true },
        { to: '/projects', label: 'Projects' },
        { to: '/records', label: 'Records Archive' },
        { to: '/reports', label: 'Reports' },
      ],
    }
    default: return {
      heading: role,
      items: [
        { to: '/', label: 'Worklist', end: true },
        { to: '/projects', label: role === P.INSTRUCTOR_1 ? 'Groups' : 'Projects' },
      ],
    }
  }
}
