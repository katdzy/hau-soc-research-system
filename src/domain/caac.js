// Context-Aware Access Control (CAAC — Kayes et al., 2017).
//
// Under RBAC a role carries a fixed set of permissions. Here a role carries
// nothing by itself: every permission is a POLICY that pairs a role with the
// context in which it applies. A capability is granted only when the user
// holds the role AND the context holds —
//
//   • relationship — is this user a member of, or assigned to, THIS project?
//   • workflow state — which stage is the project in right now?
//   • scope — is the project inside the programs this Coordinator covers?
//   • conflict — is the approver also the person being approved?
//
// Roles come in two dimensions (Requirements Documentation):
//   Global Roles        Student, Dean, Associate Dean, Program Chair/Coordinator,
//                       University Research Office, System Administrator
//   Project-Based Roles Instructor 1, Instructor 2, Adviser, Panel Member, Panel Chair
//
// The same person therefore resolves differently per project AND per stage.
// Every grant records the role and the condition that produced it, and every
// role-held-but-context-unmet policy is kept as "dormant", which is what the
// CAAC Inspector renders. The service layer calls `authorize()` before every
// write — the local stand-in for the Cloud Function check.

import { GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, DOC_TYPES } from './constants.js'
import { PHASES, stageIndex, stageLabel, phaseStages } from './stages.js'

export const CAPABILITIES = {
  // Project scope
  'project.view': 'Open the project workspace',
  'document.history': 'See superseded versions, not only the latest',
  'document.submit': 'Upload a new immutable document version',
  'document.annotate': 'Add non-destructive annotations to a version',
  'annotation.private': 'Annotations stay private until the verdict is recorded',
  'review.decide': 'Issue a review decision on a submitted version',
  'ai.view': 'Read the AI-generated manuscript summary',
  'roster.manage': 'Add or remove students in the group',
  'roster.endorse': 'Forward the block roster to the Program Chair/Coordinator',
  'topic.register': 'Register the approved topic as the official title',
  'proposal.approveForDefense': 'Approve the group to present its proposal defense',
  'adviser.assign': 'Assign the Adviser',
  'adviser.approve': 'Approve the adviser assignment',
  'panel.assign': 'Designate the Panel Chair and Panel Members',
  'instructor2.assign': 'Assign the Capstone 2 instructor',
  'defense.schedule': 'Create and publish a defense schedule',
  'verdict.record': 'Record the official verdict on FM-AAC-SOC-2004',
  'revision.close': 'Close the revision period and advance the project',
  'weeklylog.submit': 'Submit a weekly accomplishment log',
  'weeklylog.sign': 'Approve, return and sign weekly logs (FM-AAC-SOC-2003)',
  'weeklylog.export': 'Export FM-AAC-SOC-2003 logs',
  'milestone.confirm': 'Confirm Capstone 2 milestones',
  'finaldefense.recommend': 'Submit the Capstone Recommendation Form (FM-AAC-SOC-2005)',
  'finaldefense.endorse': 'Endorse the project for final defense scheduling',
  'clearance.endorse': 'Endorse the cleared project and sign the Approval Sheet',
  'uro.verify': 'Verify the certificates and sign for the URO',
  'final.approve': 'Give final approval by signing the Approval Sheet',
  // Institution scope
  'group.create': 'Create project groups for a Capstone 1 block',
  'report.generate': 'Generate and export reports',
  'records.search': 'Search and filter the records-table archive',
  'records.manage': 'Manage the thesis and capstone archive',
  'admin.accounts': 'Manage accounts and Global Role assignments',
  'admin.caac': 'Configure and audit the CAAC tagging framework',
  'audit.view': 'Read the system activity log',
}

// --- Context conditions --------------------------------------------------------
// Each condition knows how to test the environment and how to describe itself,
// so a denial can always say which part of the context was not met.

const listOf = (items) =>
  items.length <= 1 ? items.join('')
    : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`

const cond = (label, test) => ({ label, test, parts: null })

const all = (...conds) => ({
  label: conds.map(c => c.label).join(', and '),
  test: (env) => conds.every(c => c.test(env)),
  parts: conds,
})

const unmet = (c, env) =>
  c.parts ? c.parts.filter(p => !p.test(env)).map(p => p.label) : (c.test(env) ? [] : [c.label])

const always = cond('at every stage', () => true)
const at = (...keys) =>
  cond(`while the project is at ${listOf(keys.map(stageLabel))}`, env => keys.includes(env.stage))
const from = (key) =>
  cond(`from ${stageLabel(key)} onward`, env => stageIndex(env.stage) >= stageIndex(key))
const during = (...phases) =>
  cond(`during ${listOf(phases)}`, env => phaseStages(...phases).includes(env.stage))

const member = cond('you are in this project group', env => env.isMember)
const inScope = cond(
  'the project is in a program you coordinate',
  env => (env.user.programScope ?? []).includes(env.project.program),
)
const notTheAdviser = cond(
  'you are not the Adviser being approved',
  env => !env.projectRoles.includes(P.ADVISER),
)
const acceptsUploads = cond(
  'the current stage accepts submissions',
  env => allowedDocTypes(env.stage).length > 0,
)
const teachesBlock = cond(
  'you teach a Capstone 1 block this term',
  env => env.sections.some(s => s.course === 'Capstone 1'),
)

// --- Policies ----------------------------------------------------------------

const GLOBAL = 'Global Role'
const PROJECT = 'Project-Based Role'

const policy = (dimension, role, cap, when) => ({ dimension, role, cap, when })
const g = (role, cap, when) => policy(GLOBAL, role, cap, when)
const p = (role, cap, when) => policy(PROJECT, role, cap, when)

const DEFENSE_STAGES = ['PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'FINAL_DEFENSE_SCHEDULING', 'FINAL_DEFENSE']
const ADVISER_REVIEW_STAGES = ['PROPOSAL_DEVELOPMENT', 'PROPOSAL_REVISION', 'IMPLEMENTATION', 'FINAL_REVISION']

export const PROJECT_POLICIES = [
  // Student — a Global Role, but every permission depends on group membership.
  g(G.STUDENT, 'project.view', member),
  g(G.STUDENT, 'document.history', member),
  g(G.STUDENT, 'document.submit', all(member, acceptsUploads)),
  g(G.STUDENT, 'weeklylog.submit', all(member, at('IMPLEMENTATION'))),
  g(G.STUDENT, 'weeklylog.export', all(member, from('IMPLEMENTATION'))),
  g(G.STUDENT, 'ai.view', member),

  // Instructor 1 — Thesis/Capstone 1 only.
  p(P.INSTRUCTOR_1, 'project.view', during(PHASES.IDEATION, PHASES.PROPOSAL)),
  p(P.INSTRUCTOR_1, 'document.history', during(PHASES.IDEATION, PHASES.PROPOSAL)),
  p(P.INSTRUCTOR_1, 'roster.manage', at('GROUP_FORMATION')),
  p(P.INSTRUCTOR_1, 'roster.endorse', at('GROUP_FORMATION')),
  p(P.INSTRUCTOR_1, 'document.annotate', at('TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT')),
  p(P.INSTRUCTOR_1, 'review.decide', at('TOPIC_PROPOSAL')),
  p(P.INSTRUCTOR_1, 'topic.register', at('TOPIC_PROPOSAL')),
  p(P.INSTRUCTOR_1, 'proposal.approveForDefense', at('PROPOSAL_DEVELOPMENT')),
  p(P.INSTRUCTOR_1, 'revision.close', at('PROPOSAL_REVISION')),

  // Instructor 2 — Thesis/Capstone 2 and post-defense requirements. Never annotates.
  p(P.INSTRUCTOR_2, 'project.view', during(PHASES.IMPLEMENTATION, PHASES.CLEARANCE)),
  p(P.INSTRUCTOR_2, 'document.history', during(PHASES.IMPLEMENTATION, PHASES.CLEARANCE)),
  p(P.INSTRUCTOR_2, 'milestone.confirm', at('IMPLEMENTATION')),
  p(P.INSTRUCTOR_2, 'defense.schedule', at('FINAL_DEFENSE_SCHEDULING')),
  p(P.INSTRUCTOR_2, 'revision.close', at('FINAL_REVISION')),

  // Adviser — the whole life cycle.
  p(P.ADVISER, 'project.view', always),
  p(P.ADVISER, 'document.history', always),
  p(P.ADVISER, 'ai.view', always),
  p(P.ADVISER, 'document.annotate', at('TOPIC_PROPOSAL', ...ADVISER_REVIEW_STAGES)),
  p(P.ADVISER, 'review.decide', at(...ADVISER_REVIEW_STAGES)),
  p(P.ADVISER, 'weeklylog.sign', at('IMPLEMENTATION')),
  p(P.ADVISER, 'weeklylog.export', from('IMPLEMENTATION')),
  p(P.ADVISER, 'finaldefense.recommend', at('IMPLEMENTATION')),

  // Panel — access opens at Panel Assignment; latest version only (no history).
  ...PANEL_ROLES.flatMap(role => [
    p(role, 'project.view', from('PANEL_ASSIGNMENT')),
    p(role, 'ai.view', from('PANEL_ASSIGNMENT')),
    p(role, 'document.annotate', at(...DEFENSE_STAGES)),
    p(role, 'annotation.private', at(...DEFENSE_STAGES)),
  ]),
  p(P.PANEL_CHAIR, 'verdict.record', at('PROPOSAL_DEFENSE', 'FINAL_DEFENSE')),

  // Program Chair/Coordinator — only for projects in their programs, and only
  // once Instructor 1 has forwarded the roster.
  g(G.COORDINATOR, 'project.view', all(inScope, from('ADVISER_ASSIGNMENT'))),
  g(G.COORDINATOR, 'document.history', all(inScope, from('ADVISER_ASSIGNMENT'))),
  g(G.COORDINATOR, 'adviser.assign', all(inScope, at('ADVISER_ASSIGNMENT'))),
  g(G.COORDINATOR, 'panel.assign', all(inScope, at('PANEL_ASSIGNMENT', 'FINAL_DEFENSE_ENDORSEMENT'))),
  g(G.COORDINATOR, 'defense.schedule', all(inScope, at('PROPOSAL_DEFENSE_SCHEDULING'))),
  g(G.COORDINATOR, 'instructor2.assign', all(inScope, at('PROPOSAL_REVISION', 'IMPLEMENTATION', 'FINAL_DEFENSE_ENDORSEMENT'))),
  g(G.COORDINATOR, 'finaldefense.endorse', all(inScope, at('FINAL_DEFENSE_ENDORSEMENT'))),
  g(G.COORDINATOR, 'clearance.endorse', all(inScope, at('CLEARANCE'))),

  // Dean and Associate Dean — progressive visibility: only while a stage
  // involves them, plus the archive.
  ...[G.DEAN, G.ASSOCIATE_DEAN].flatMap(role => [
    g(role, 'project.view', at('ADVISER_APPROVAL', 'FINAL_APPROVAL', 'ARCHIVED')),
    g(role, 'document.history', at('FINAL_APPROVAL', 'ARCHIVED')),
    g(role, 'adviser.approve', all(at('ADVISER_APPROVAL'), notTheAdviser)),
    g(role, 'final.approve', at('FINAL_APPROVAL')),
  ]),

  // University Research Office
  g(G.URO, 'project.view', at('URO_VERIFICATION')),
  g(G.URO, 'uro.verify', at('URO_VERIFICATION')),

  // System Administrator — no manuscript access while a project is active.
  g(G.ADMIN, 'project.view', at('ARCHIVED')),
]

export const INSTITUTION_POLICIES = [
  p(P.INSTRUCTOR_1, 'group.create', teachesBlock),
  ...[G.DEAN, G.ASSOCIATE_DEAN].flatMap(role => [
    g(role, 'report.generate', always),
    g(role, 'records.search', always),
  ]),
  g(G.COORDINATOR, 'report.generate', cond('for the programs you coordinate', () => true)),
  g(G.ADMIN, 'report.generate', always),
  g(G.ADMIN, 'records.manage', always),
  g(G.ADMIN, 'admin.accounts', always),
  g(G.ADMIN, 'admin.caac', always),
  g(G.ADMIN, 'audit.view', always),
]

// --- Resolution --------------------------------------------------------------

export const caacTag = (role) => '@' + String(role).replace(/[^A-Za-z0-9]/g, '')

export const globalRolesOf = (user) => user?.globalRoles ?? []

function evaluate(policies, held, env) {
  const grants = new Map()
  const active = []
  const dormant = []
  for (const pol of policies) {
    if (!held.has(pol.role)) continue
    if (pol.when.test(env)) {
      const grant = { cap: pol.cap, role: pol.role, dimension: pol.dimension, condition: pol.when.label }
      active.push(grant)
      if (!grants.has(pol.cap)) grants.set(pol.cap, grant)
    } else {
      dormant.push({ cap: pol.cap, role: pol.role, dimension: pol.dimension, unmet: unmet(pol.when, env) })
    }
  }
  const seen = new Set()
  return {
    grants,
    active,
    dormant: dormant.filter(d => {
      const key = `${d.cap}|${d.role}`
      if (grants.has(d.cap) || seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}

/** One user's capabilities on one project at its current stage. */
export function resolveContext(user, b) {
  if (!user || !b) {
    return { user, globalRoles: [], projectRoles: [], isMember: false, grants: new Map(), active: [], dormant: [] }
  }
  const globalRoles = globalRolesOf(user)
  const isMember = b.members.some(m => m.userId === user.id)
  const projectRoles = [...new Set(b.assignments
    .filter(a => a.userId === user.id && a.status !== 'Declined')
    .map(a => a.roleType))]

  const env = { user, project: b.project, stage: b.project.currentStage, isMember, projectRoles, bundle: b }
  const held = new Set([...globalRoles, ...projectRoles])
  const { grants, active, dormant } = evaluate(PROJECT_POLICIES, held, env)

  return { user, globalRoles, projectRoles, isMember, stage: env.stage, grants, active, dormant }
}

/** Capabilities that do not belong to any one project (navigation, reports). */
export function resolveInstitution(user, snap) {
  if (!user) return { user, globalRoles: [], grants: new Map(), active: [], dormant: [], sections: [] }
  const globalRoles = globalRolesOf(user)
  const sections = (snap?.sections ?? []).filter(s => s.instructorId === user.id)
  const held = new Set(globalRoles)
  if (sections.some(s => s.course === 'Capstone 1')) held.add(P.INSTRUCTOR_1)
  const { grants, active, dormant } = evaluate(INSTITUTION_POLICIES, held, { user, sections })
  return { user, globalRoles, sections, grants, active, dormant }
}

export const can = (ctx, cap) => ctx?.grants?.has(cap) ?? false
export const why = (ctx, cap) => ctx?.grants?.get(cap) ?? null

/** Thrown by the service layer when a write is attempted without the grant. */
export class AccessDenied extends Error {}

export function authorize(ctx, cap) {
  if (can(ctx, cap)) return
  const d = ctx?.dormant?.find(x => x.cap === cap)
  throw new AccessDenied(d
    ? `Not permitted right now. Your ${d.role} role grants "${cap}" only if: ${d.unmet.join('; ')}.`
    : `Not permitted: no role you hold grants "${cap}" on this project.`)
}

/**
 * State-based progressive visibility: a project is visible only when some
 * policy grants `project.view` in the current context.
 */
export function projectAccess(user, b) {
  const ctx = resolveContext(user, b)
  const grant = why(ctx, 'project.view')
  if (grant) return { visible: true, via: grant.role, reason: `${grant.role} · ${grant.condition}` }
  const d = ctx.dormant.find(x => x.cap === 'project.view')
  return {
    visible: false,
    reason: d
      ? `Your ${d.role} role opens this project only if: ${d.unmet.join('; ')}. It is now at ${stageLabel(b.project.currentStage)}.`
      : 'None of your roles gives you access to this project.',
  }
}

/** Which document types the current stage accepts. */
export function allowedDocTypes(stage) {
  switch (stage) {
    case 'TOPIC_PROPOSAL': return [DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER]
    case 'PROPOSAL_DEVELOPMENT': return [DOC_TYPES.PROPOSAL_MANUSCRIPT]
    case 'PROPOSAL_REVISION':
    case 'FINAL_REVISION': return [DOC_TYPES.REVISED_MANUSCRIPT]
    case 'IMPLEMENTATION': return [DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.DEPLOYMENT_INFO, DOC_TYPES.PRESENTATION_VIDEO]
    case 'FINAL_DEFENSE_ENDORSEMENT':
    case 'FINAL_DEFENSE_SCHEDULING': return [DOC_TYPES.PRESENTATION_VIDEO]
    case 'CLEARANCE': return [
      DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE,
    ]
    default: return []
  }
}

/** Short description of someone's standing, e.g. "Dean · Adviser on 1 project". */
export function describeStanding(user, snap) {
  const counts = {}
  for (const a of snap.projectAssignments ?? []) {
    if (a.userId === user.id && a.status !== 'Declined') counts[a.roleType] = (counts[a.roleType] ?? 0) + 1
  }
  const project = Object.entries(counts)
    .map(([role, n]) => `${role} on ${n} project${n > 1 ? 's' : ''}`)
  const global = globalRolesOf(user)
  return [...(global.length ? global : ['No Global Role']), ...project].join(' · ')
}

