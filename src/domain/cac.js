// Contextual Access Control.
//
// A permission is never derived from a role alone. It is resolved from two
// dimensions at once: the user's institutional Global Role, plus any
// Project-Based Role(s) they hold on the specific project being acted on.
// The same faculty member can be an Adviser on project A and a Panel Member
// on project B in the same session, and gets different capabilities in each.
//
// Every grant records where it came from, so the UI can answer "why can I
// see this button?" — that trace is what the CAC Inspector renders.

import { GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES } from './constants.js'
import { stageIndex } from './stages.js'

export const CAPABILITIES = {
  'project.view': 'Open the project workspace',
  'roster.manage': 'Create the group and manage its student roster',
  'roster.endorse': 'Endorse the block roster to the Program Coordinator',
  'topic.review': 'Review and decide on submitted topic proposals',
  'topic.register': 'Register the approved topic as the official project title',
  'document.submit': 'Upload a new immutable document version',
  'document.annotate': 'Add non-destructive annotations to a submitted version',
  'annotation.private': 'Annotations are private to the author until the defense concludes',
  'review.decide': 'Issue a formal review decision on a version',
  'ai.view': 'View the AI-assisted manuscript summary',
  'weeklylog.submit': 'Submit a weekly accomplishment log',
  'weeklylog.sign': 'Digitally sign a weekly log (FM-AAC-SOC-2003)',
  'adviser.assign': 'Assign an Adviser to a project',
  'adviser.approve': 'Approve a routed adviser assignment',
  'proposal.endorse': 'Endorse the project for panel assignment',
  'panel.assign': 'Assign the Panel Chair and Panel Members',
  'defense.schedule': 'Create or amend a defense schedule',
  'verdict.record': 'Record the official defense verdict',
  'revision.verify': 'Verify that post-defense revisions were complied with',
  'finaldefense.recommend': 'Submit the Capstone Recommendation Form (FM-AAC-SOC-2005)',
  'uro.clear': 'Grant University Research Office clearance',
  'dean.sign': 'Apply the final institutional signature and archive the project',
  'form.sign': 'Apply a traceable digital signature to an institutional form',
  'report.generate': 'Generate and export reports',
  'archive.viewAll': 'Browse the full institutional archive',
  'admin.users': 'Manage accounts and global role assignment',
  'admin.cac': 'Configure the CAC tag architecture',
  'audit.view': 'Read the append-only audit trail',
}

// --- Dimension 1: institution-wide grants -----------------------------------
const GLOBAL_GRANTS = {
  [G.STUDENT]: [],
  [G.FACULTY]: [],
  [G.INSTRUCTOR_1]: [],
  [G.INSTRUCTOR_2]: [],
  [G.COORDINATOR]: [
    'project.view', 'adviser.assign', 'panel.assign', 'defense.schedule',
    'form.sign', 'report.generate', 'archive.viewAll',
  ],
  [G.ASSOCIATE_DEAN]: [
    'project.view', 'adviser.approve', 'form.sign', 'report.generate', 'archive.viewAll',
  ],
  [G.DEAN]: [
    'project.view', 'dean.sign', 'form.sign', 'report.generate', 'archive.viewAll',
  ],
  [G.URO]: ['project.view', 'uro.clear', 'form.sign'],
  // FR-24 restricts annotation to Panel, Adviser and Instructor 1. The Admin is
  // deliberately given no document-workflow capability here, which resolves the
  // contradiction between rows 90 and 93 of `Features per User.xlsx`.
  [G.ADMIN]: ['admin.users', 'admin.cac', 'audit.view', 'archive.viewAll', 'report.generate'],
}

// --- Dimension 2: per-project grants ----------------------------------------
const PROJECT_GRANTS = {
  student: [
    'project.view', 'document.submit', 'weeklylog.submit', 'ai.view',
  ],
  [P.INSTRUCTOR_1]: [
    'project.view', 'roster.manage', 'roster.endorse', 'topic.review',
    'topic.register', 'document.annotate', 'review.decide',
  ],
  [P.INSTRUCTOR_2]: ['project.view', 'defense.schedule'],
  [P.ADVISER]: [
    'project.view', 'document.annotate', 'review.decide', 'ai.view',
    'weeklylog.sign', 'proposal.endorse', 'finaldefense.recommend',
    'revision.verify', 'form.sign',
  ],
  [P.PANEL_MEMBER]: [
    'project.view', 'document.annotate', 'annotation.private', 'ai.view',
    'revision.verify', 'form.sign',
  ],
  [P.PANEL_CHAIR]: [
    'project.view', 'document.annotate', 'annotation.private', 'ai.view',
    'revision.verify', 'verdict.record', 'form.sign',
  ],
}

// CAC tags are the administrator-configurable surface described in Chapter 1.
export const cacTag = (role) => '@' + String(role).replace(/[^A-Za-z0-9]/g, '')

/**
 * Resolve one user's capabilities for one project.
 * Pass project=null to resolve institution-wide capabilities only.
 */
export function resolveContext(user, bundle) {
  const grants = new Map()
  const add = (cap, via) => { if (!grants.has(cap)) grants.set(cap, via) }

  if (!user) return { user: null, globalRole: null, projectRoles: [], isMember: false, grants }

  for (const cap of GLOBAL_GRANTS[user.globalRole] ?? []) {
    add(cap, { dimension: 'Global Role', role: user.globalRole, tag: cacTag(user.globalRole) })
  }

  const project = bundle?.project ?? null
  const projectRoles = []
  let isMember = false

  if (project) {
    isMember = (bundle.members ?? []).some(m => m.userId === user.id)
    if (isMember) {
      projectRoles.push('Student')
      for (const cap of PROJECT_GRANTS.student) {
        add(cap, { dimension: 'Project Role', role: 'Group Member', tag: '@ProjectMember', project: project.title })
      }
    }
    for (const a of bundle.assignments ?? []) {
      if (a.userId !== user.id || a.status === 'Declined') continue
      projectRoles.push(a.roleType)
      for (const cap of PROJECT_GRANTS[a.roleType] ?? []) {
        add(cap, { dimension: 'Project Role', role: a.roleType, tag: cacTag(a.roleType), project: project.title })
      }
    }
  }

  return { user, globalRole: user.globalRole, projectRoles, isMember, grants }
}

export const can = (ctx, cap) => ctx?.grants?.has(cap) ?? false
export const why = (ctx, cap) => ctx?.grants?.get(cap) ?? null

/**
 * Progressive visibility: a project does not appear on a higher-level
 * administrator's worklist until it has been endorsed into their gate.
 * `observe` = shows up in school-wide listings and reports, read only.
 * `work`    = appears on the worklist with actions available.
 */
export function projectAccess(user, bundle) {
  if (!user) return { level: 'none', reason: 'Not signed in' }
  const { project } = bundle
  const ctx = resolveContext(user, bundle)
  const idx = stageIndex(project.currentStage)

  if (ctx.isMember || ctx.projectRoles.length) {
    // Panel roles only gain access once the panel has actually been assigned.
    const panelOnly = ctx.projectRoles.every(r => r === 'Panel Chair' || r === 'Panel Member')
    if (panelOnly && idx < stageIndex('PANEL_ASSIGNMENT')) {
      return { level: 'none', reason: 'Panel access opens at Panel Assignment' }
    }
    return { level: 'work', reason: `Project role: ${ctx.projectRoles.join(', ')}` }
  }

  const gates = {
    [G.COORDINATOR]: 'ADVISER_ASSIGNMENT',
    [G.ASSOCIATE_DEAN]: 'ADVISER_ENDORSEMENT',
    [G.DEAN]: 'DEAN_APPROVAL',
    [G.URO]: 'URO_CLEARANCE',
  }
  const gate = gates[user.globalRole]
  if (gate) {
    return idx >= stageIndex(gate)
      ? { level: 'work', reason: `Endorsed past ${gate.replace(/_/g, ' ').toLowerCase()}` }
      : { level: 'observe', reason: `Not yet endorsed to the ${user.globalRole} gate` }
  }
  if (user.globalRole === G.ADMIN) return { level: 'observe', reason: 'Administrative oversight, no workflow role' }
  return { level: 'none', reason: 'No global or project role on this project' }
}

/** Which document types the current stage accepts. */
export function allowedDocTypes(stage) {
  switch (stage) {
    case 'TOPIC_PROPOSAL': return [DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER]
    case 'PROPOSAL_DEVELOPMENT': return [DOC_TYPES.PROPOSAL_MANUSCRIPT]
    case 'PROPOSAL_REVISION':
    case 'FINAL_REVISION': return [DOC_TYPES.REVISED_MANUSCRIPT]
    case 'IMPLEMENTATION': return [DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.SOURCE_CODE, DOC_TYPES.DEPLOYMENT_DOC]
    case 'URO_CLEARANCE': return [
      DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.EDITORS_CERTIFICATE,
      DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.SOURCE_CODE, DOC_TYPES.DEPLOYMENT_DOC,
    ]
    default: return []
  }
}
