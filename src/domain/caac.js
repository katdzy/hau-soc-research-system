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

import { GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, DOC_TYPES, DOC_STATUS, COURSES } from './constants.js'
import { PHASES, stageIndex, stageLabel, phaseStages, uroReturnOutstanding } from './stages.js'
import { FLAGS } from './flags.js'

export const CAPABILITIES = {
  // Project scope
  'project.view': 'Open the project workspace',
  'document.read': 'Read the project\u2019s submitted documents',
  'annotation.viewReleased': 'Read private panel notes once the verdict releases them',
  'document.history': 'See superseded versions, not only the latest',
  'document.submit': 'Upload a new immutable document version',
  'document.annotate': 'Add non-destructive annotations to a version',
  'annotation.private': 'Annotations stay private until the verdict is recorded',
  'review.decide': 'Issue a review decision on a submitted version',
  'review.return': 'Return a submitted version for revision (no approval)',
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
  'verdict.correct': 'Correct a verdict just recorded, before anyone acts on it',
  'revision.close': 'Close the revision period and advance the project',
  'revision.verify': 'Verify revisions against the panel’s requirements and sign FM-AAC-SOC-2004',
  'weeklylog.submit': 'Submit a weekly accomplishment log',
  'weeklylog.sign': 'Approve, return and sign weekly logs (FM-AAC-SOC-2003)',
  'weeklylog.export': 'Export FM-AAC-SOC-2003 logs',
  'milestone.confirm': 'Confirm Capstone 2 milestones',
  'readiness.confirm': 'Confirm, with the Adviser, that the group is ready for final defense',
  'requirements.confirm': 'Confirm the post-defense course requirements',
  'finaldefense.recommend': 'Submit the Capstone Recommendation Form (FM-AAC-SOC-2005)',
  'finaldefense.endorse': 'Endorse the project for final defense scheduling',
  'clearance.endorse': 'Endorse the cleared project and sign the Approval Sheet',
  'uro.verify': 'Verify the certificates and sign for the URO',
  'uro.return': 'Return the certificates to the group with remarks',
  'final.approve': 'Give final approval by signing the Approval Sheet',
  // Institution scope
  'group.create': 'Create project groups for a Capstone 1 block',
  'report.generate': 'Generate and export reports',
  'records.search': 'Search and filter the records-table archive',
  'records.manage': 'Manage the thesis and capstone archive',
  'admin.accounts': 'Manage accounts and Global Role assignments',
  'admin.caac': 'Configure and audit the CAAC tagging framework, including permission overrides',
  'settings.manage': 'Change global settings such as the revision countdown length',
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
  env => allowedDocTypes(env.stage, env.bundle).length > 0,
)
const teachesBlock = cond(
  'you teach a Capstone 1 section this term',
  env => env.sections.some(s => s.course === COURSES.C1),
)

// --- Policies ----------------------------------------------------------------

const GLOBAL = 'Global Role'
const PROJECT = 'Project-Based Role'

const policy = (dimension, role, cap, when) => ({ dimension, role, cap, when })
const g = (role, cap, when) => policy(GLOBAL, role, cap, when)
const p = (role, cap, when) => policy(PROJECT, role, cap, when)

// Opening a project and reading its documents go together for every role
// except the System Administrator, who may open a project record for
// configuration and audit but never reads a manuscript (§2.2, T20).
const viewAndRead = (make, role, when) => [make(role, 'project.view', when), make(role, 'document.read', when)]

// OQ#2 (flag AI_SUMMARY_AUDIENCE) — feature not built yet (R12), guard only.
const inAiAudience = (role) => FLAGS.AI_SUMMARY_AUDIENCE.includes(role)

const DEFENSE_STAGES = ['PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'FINAL_DEFENSE_SCHEDULING', 'FINAL_DEFENSE']
const ADVISER_REVIEW_STAGES = ['PROPOSAL_DEVELOPMENT', 'PROPOSAL_REVISION', 'IMPLEMENTATION', 'FINAL_REVISION']

// Program Chair/Coordinator steps. Their stages are also the only stages at
// which the PC opens a project (NEW-11, flag PC_PROGRAM_VISIBILITY); outside
// them the PC sees program-level counts and status through Reports.
const PC_STEPS = [
  ['adviser.assign', ['ADVISER_ASSIGNMENT']],
  ['panel.assign', ['PANEL_ASSIGNMENT', 'FINAL_DEFENSE_ENDORSEMENT']],
  ...(FLAGS.PROPOSAL_DEFENSE_SCHEDULER === G.COORDINATOR ? [['defense.schedule', ['PROPOSAL_DEFENSE_SCHEDULING']]] : []),
  ...(FLAGS.INSTRUCTOR_2_ASSIGNER === G.COORDINATOR ? [['instructor2.assign', ['PROPOSAL_REVISION', 'FINAL_DEFENSE_ENDORSEMENT']]] : []),
  ['finaldefense.endorse', ['FINAL_DEFENSE_ENDORSEMENT']],
  ['clearance.endorse', ['CLEARANCE']],
]
export const PC_STEP_STAGES = [...new Set(PC_STEPS.flatMap(([, stages]) => stages))]
const pcStepActive = cond(
  'one of your Program Chair/Coordinator steps is active',
  env => PC_STEP_STAGES.includes(env.stage),
)
const pcView = FLAGS.PC_PROGRAM_VISIBILITY === 'full' ? from('ADVISER_ASSIGNMENT') : pcStepActive

const i1View = FLAGS.I1_ACCESS_AFTER_ROUTING === 'read-only'
  ? always
  : during(PHASES.IDEATION, PHASES.PROPOSAL)

const noSelfApproval = FLAGS.BLOCK_SELF_APPROVAL ? notTheAdviser : always

const adviserAppointed = cond(
  'the Dean and Associate Dean have approved your appointment',
  env => stageIndex(env.stage) > stageIndex('ADVISER_APPROVAL'),
)

export const PROJECT_POLICIES = [
  // Student — a Global Role, but every permission depends on group membership.
  ...viewAndRead(g, G.STUDENT, member),
  g(G.STUDENT, 'document.history', member),
  g(G.STUDENT, 'document.submit', all(member, acceptsUploads)),
  g(G.STUDENT, 'weeklylog.submit', all(member, at('IMPLEMENTATION'))),
  g(G.STUDENT, 'weeklylog.export', all(member, from('IMPLEMENTATION'))),
  ...(inAiAudience(G.STUDENT) ? [g(G.STUDENT, 'ai.view', member)] : []),
  // OQ#3 (flag PANEL_NOTES_RELEASE): released panel notes go to the students.
  ...(FLAGS.PANEL_NOTES_RELEASE === 'students-on-verdict' ? [g(G.STUDENT, 'annotation.viewReleased', member)] : []),

  // Instructor 1 — Thesis/Capstone 1 only (NEW-6, flag I1_ACCESS_AFTER_ROUTING).
  ...viewAndRead(p, P.INSTRUCTOR_1, i1View),
  p(P.INSTRUCTOR_1, 'document.history', i1View),
  p(P.INSTRUCTOR_1, 'roster.manage', at('GROUP_FORMATION')),
  p(P.INSTRUCTOR_1, 'roster.endorse', at('GROUP_FORMATION')),
  p(P.INSTRUCTOR_1, 'document.annotate', at('TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT')),
  p(P.INSTRUCTOR_1, 'review.decide', at('TOPIC_PROPOSAL')),
  // S4.2 — Instructor 1 may return drafts; approving them is the Adviser's.
  p(P.INSTRUCTOR_1, 'review.return', at('PROPOSAL_DEVELOPMENT')),
  p(P.INSTRUCTOR_1, 'topic.register', at('TOPIC_PROPOSAL')),
  p(P.INSTRUCTOR_1, 'proposal.approveForDefense', at('PROPOSAL_DEVELOPMENT')),
  p(P.INSTRUCTOR_1, 'revision.close', at('PROPOSAL_REVISION')),
  ...(inAiAudience(P.INSTRUCTOR_1) ? [p(P.INSTRUCTOR_1, 'ai.view', i1View)] : []),

  // Instructor 2 — Thesis/Capstone 2 and post-defense requirements. Never annotates.
  ...viewAndRead(p, P.INSTRUCTOR_2, during(PHASES.IMPLEMENTATION, PHASES.CLEARANCE)),
  p(P.INSTRUCTOR_2, 'document.history', during(PHASES.IMPLEMENTATION, PHASES.CLEARANCE)),
  p(P.INSTRUCTOR_2, 'milestone.confirm', at('IMPLEMENTATION')),
  // S6.7 readiness check (NEW-43) and S8.5 post-defense requirements (NEW-44).
  ...(FLAGS.I2_READINESS_CHECK === 'own-step' ? [p(P.INSTRUCTOR_2, 'readiness.confirm', at('IMPLEMENTATION'))] : []),
  p(P.INSTRUCTOR_2, 'requirements.confirm', at(...FLAGS.POST_DEFENSE_REQUIREMENTS_STAGES)),
  p(P.INSTRUCTOR_2, 'defense.schedule', at('FINAL_DEFENSE_SCHEDULING')),
  ...(inAiAudience(P.INSTRUCTOR_2) ? [p(P.INSTRUCTOR_2, 'ai.view', during(PHASES.IMPLEMENTATION, PHASES.CLEARANCE))] : []),

  // NEW-2 (flag PROPOSAL_DEFENSE_SCHEDULER) when it is not the Program Chair.
  ...([P.INSTRUCTOR_1, P.INSTRUCTOR_2].includes(FLAGS.PROPOSAL_DEFENSE_SCHEDULER)
    ? [p(FLAGS.PROPOSAL_DEFENSE_SCHEDULER, 'defense.schedule', at('PROPOSAL_DEFENSE_SCHEDULING'))] : []),

  // Adviser — from the approved appointment (S2.2: "Adviser: group appears
  // under Advising") to the end of the life cycle. A proposed Adviser holds
  // the assignment row but no access while the Dean and AD decide.
  ...viewAndRead(p, P.ADVISER, adviserAppointed),
  p(P.ADVISER, 'document.history', adviserAppointed),
  ...(inAiAudience(P.ADVISER) ? [p(P.ADVISER, 'ai.view', adviserAppointed)] : []),
  p(P.ADVISER, 'document.annotate', at('TOPIC_PROPOSAL', ...ADVISER_REVIEW_STAGES)),
  p(P.ADVISER, 'review.decide', at(...ADVISER_REVIEW_STAGES)),
  // S3.2 / S3.6 — the Adviser may also return topics and the concept paper;
  // approving them is Instructor 1's (§3 "I1 is the gate, Adviser reviews").
  p(P.ADVISER, 'review.return', at('TOPIC_PROPOSAL')),
  p(P.ADVISER, 'weeklylog.export', from('IMPLEMENTATION')),
  p(P.ADVISER, 'finaldefense.recommend', at('IMPLEMENTATION')),

  p(P.ADVISER, 'revision.verify', at('PROPOSAL_REVISION', 'FINAL_REVISION')),

  // Weekly log signer (OQ#7, flag WEEKLY_LOG_SIGNER).
  p(FLAGS.WEEKLY_LOG_SIGNER, 'weeklylog.sign', at('IMPLEMENTATION')),

  // Panel — access opens at Panel Assignment; latest version only (no history).
  ...PANEL_ROLES.flatMap(role => [
    ...viewAndRead(p, role, from('PANEL_ASSIGNMENT')),
    ...(inAiAudience(role) ? [p(role, 'ai.view', from('PANEL_ASSIGNMENT'))] : []),
    p(role, 'document.annotate', at(...DEFENSE_STAGES)),
    p(role, 'annotation.private', at(...DEFENSE_STAGES)),
    p(role, 'revision.verify', at('PROPOSAL_REVISION', 'FINAL_REVISION')),
  ]),
  p(P.PANEL_CHAIR, 'verdict.record', at('PROPOSAL_DEFENSE', 'FINAL_DEFENSE')),
  // NEW-42: every verdict leads to a revision stage, where the Chair may correct it.
  p(P.PANEL_CHAIR, 'verdict.correct', at('PROPOSAL_REVISION', 'FINAL_REVISION')),

  // Program Chair/Coordinator — only for projects in their programs, and only
  // while one of their steps is active (NEW-11).
  ...viewAndRead(g, G.COORDINATOR, all(inScope, pcView)),
  g(G.COORDINATOR, 'document.history', all(inScope, pcView)),
  ...PC_STEPS.map(([cap, stages]) => g(G.COORDINATOR, cap, all(inScope, at(...stages)))),

  // Dean and Associate Dean — progressive visibility: only while a stage
  // involves them, plus the archive.
  ...[G.DEAN, G.ASSOCIATE_DEAN].flatMap(role => [
    ...viewAndRead(g, role, at('ADVISER_APPROVAL', 'FINAL_APPROVAL', 'ARCHIVED')),
    g(role, 'document.history', at('FINAL_APPROVAL', 'ARCHIVED')),
    g(role, 'adviser.approve', all(at('ADVISER_APPROVAL'), noSelfApproval)),
    g(role, 'final.approve', at('FINAL_APPROVAL')),
  ]),

  // University Research Office
  ...viewAndRead(g, G.URO, at('URO_VERIFICATION')),
  g(G.URO, 'uro.verify', at('URO_VERIFICATION')),
  // NEW-7 (flag URO_RETURN_PATH): return the certificates to the group (NEW-45).
  ...(FLAGS.URO_RETURN_PATH ? [g(G.URO, 'uro.return', at('URO_VERIFICATION'))] : []),

  // System Administrator — opens the project record for configuration and
  // audit (§2.2), never its documents: no document.read, no annotate (T20).
  g(G.ADMIN, 'project.view', always),
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
  g(G.ADMIN, 'settings.manage', always),
  g(G.ADMIN, 'audit.view', always),
]

// --- Resolution --------------------------------------------------------------

export const caacTag = (role) => '@' + String(role).replace(/[^A-Za-z0-9]/g, '')

export const globalRolesOf = (user) => user?.globalRoles ?? []

/** Only active, verified accounts hold any grant (S0.3, flag ACCOUNT_ACTIVATION). */
export const isActiveAccount = (user) =>
  Boolean(user) && user.status === 'Active' && user.emailVerified !== false

/**
 * Permission overrides (flag PERMISSION_OVERRIDES = 'deny-only'): the System
 * Administrator's active revocations for this user. `projectId: null` applies
 * everywhere. An override can only take a capability away — never add one.
 */
export function overridesFor(user, rows, projectId = null) {
  if (FLAGS.PERMISSION_OVERRIDES !== 'deny-only' || !user) return []
  return (rows ?? []).filter(o =>
    o.userId === user.id && o.effect === 'deny' && !o.liftedAt &&
    (o.projectId == null || o.projectId === projectId))
}

/** The sentence a denial shows when an override, not the policy, is the reason. */
export const overrideReason = (o) =>
  `Revoked for your account by a System Administrator override${o.reason ? ` (“${o.reason}”)` : ''}.`

function evaluate(policies, held, env, overrides = []) {
  const revoked = new Map(overrides.map(o => [o.capability, o]))
  const grants = new Map()
  const active = []
  const dormant = []
  for (const pol of policies) {
    if (!held.has(pol.role)) continue
    if (pol.when.test(env) && revoked.has(pol.cap)) {
      const o = revoked.get(pol.cap)
      dormant.push({ cap: pol.cap, role: pol.role, dimension: pol.dimension, unmet: [overrideReason(o)], override: o })
    } else if (pol.when.test(env)) {
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
    // An override-revoked entry sorts first, so a denial names the override.
    dormant: dormant
      .sort((a, b) => Number(Boolean(b.override)) - Number(Boolean(a.override)))
      .filter(d => {
        const key = `${d.cap}|${d.role}`
        if (grants.has(d.cap) || seen.has(key)) return false
        seen.add(key)
        return true
      }),
  }
}

/** Why a dormant capability is not granted, in one sentence. */
export function denialOf(d, stage) {
  if (d.override) return overrideReason(d.override)
  return `Not permitted right now. Your ${d.role} role allows this only if: ${d.unmet.join('; ')}.` +
    (stage ? ` The project is at ${stageLabel(stage)}.` : '')
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
  const held = new Set(isActiveAccount(user) ? [...globalRoles, ...projectRoles] : [])
  const overrides = overridesFor(user, b.overrides, b.project.id)
  const { grants, active, dormant } = evaluate(PROJECT_POLICIES, held, env, overrides)

  return { user, globalRoles, projectRoles, isMember, stage: env.stage, grants, active, dormant }
}

/** Capabilities that do not belong to any one project (navigation, reports). */
export function resolveInstitution(user, snap) {
  if (!user) return { user, globalRoles: [], grants: new Map(), active: [], dormant: [], sections: [] }
  const globalRoles = globalRolesOf(user)
  const sections = (snap?.sections ?? []).filter(s => s.instructorId === user.id)
  const held = new Set(isActiveAccount(user) ? globalRoles : [])
  if (isActiveAccount(user) && sections.some(s => s.course === COURSES.C1)) held.add(P.INSTRUCTOR_1)
  const overrides = overridesFor(user, (snap?.permissionOverrides ?? []).filter(o => o.projectId == null))
  const { grants, active, dormant } = evaluate(INSTITUTION_POLICIES, held, { user, sections }, overrides)
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
    ? denialOf(d)
    : `Not permitted: no role you hold grants "${cap}".`)
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
    reason: d?.override ? overrideReason(d.override)
      : d ? `Your ${d.role} role opens this project only if: ${d.unmet.join('; ')}. It is now at ${stageLabel(b.project.currentStage)}.`
        : 'None of your roles gives you access to this project.',
  }
}

/**
 * Which document types the current stage accepts (§3 student steps):
 * S3.1/S3.5 topics and concept paper · S4.1 drafts · S5.3 complete proposal
 * manuscript + video link once the defense is scheduled · S5.7/S8.1 revised
 * manuscript · S6.3/S6.6 drafts and deployment information · S7.4 final
 * manuscript + video link once scheduled · S9.1/S9.2 certificates, and at
 * URO Verification the certificates the URO returned (pass the bundle `b`).
 */
export function allowedDocTypes(stage, b = null) {
  switch (stage) {
    case 'TOPIC_PROPOSAL': return [DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER]
    case 'PROPOSAL_DEVELOPMENT': return [DOC_TYPES.PROPOSAL_MANUSCRIPT]
    case 'PROPOSAL_DEFENSE': return [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.PRESENTATION_VIDEO]
    case 'PROPOSAL_REVISION':
    case 'FINAL_REVISION': return [DOC_TYPES.REVISED_MANUSCRIPT]
    case 'IMPLEMENTATION': return [DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.DEPLOYMENT_INFO]
    case 'FINAL_DEFENSE': return [DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.PRESENTATION_VIDEO]
    case 'CLEARANCE': return [
      DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE,
    ]
    // S9.4 return path — only the certificates the URO sent back, until replaced.
    case 'URO_VERIFICATION': return b ? uroReturnOutstanding(b) : []
    default: return []
  }
}

const latestOfType = (b, docType) =>
  b.documents.filter(d => d.docType === docType)
    .sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null

/**
 * Why a type the stage accepts cannot be submitted yet, or null. Topics close
 * once Instructor 1 approves one (S3.3); the concept paper waits until that
 * topic is registered as the title (S3.5 precondition S3.4).
 */
export function uploadBlocker(b, docType) {
  const topicApproved = b.documents.some(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL && d.status === DOC_STATUS.APPROVED)
  if (docType === DOC_TYPES.TOPIC_PROPOSAL && topicApproved) {
    return 'Instructor 1 has already approved one of your topics.'
  }
  if (docType === DOC_TYPES.CONCEPT_PAPER) {
    if (!topicApproved) return 'Instructor 1 has to approve one of your proposed topics first.'
    if (!b.project.topicRegisteredAt) return 'Instructor 1 has to register your approved topic as the title first.'
    if (latestOfType(b, DOC_TYPES.CONCEPT_PAPER)?.status === DOC_STATUS.APPROVED) return 'Your concept paper is already approved.'
  }
  return null
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

