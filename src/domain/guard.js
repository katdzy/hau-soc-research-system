// The one CAAC guard (WORKFLOWS.md §2.2). Every service call and every project
// read goes through here:
//
//   canView(user, project)            — may this user open the project at all?
//   canDo(user, action, project, t)   — canView AND the action is allowed for a
//                                       role hat the user holds on this project,
//                                       at its current stage, for the target's
//                                       document/log/form state.
//
// The capability policies in caac.js hold the role × stage × context rules;
// ACTIONS below names each action the UI and services perform, the capability
// it needs, and which document states it applies to. `allowedActions()` turns
// both into the role hat × stage × document state table §2.2 describes.

import {
  resolveContext, can, why, isActiveAccount, denialOf, PROJECT_POLICIES, AccessDenied,
} from './caac.js'
import {
  STAGES, stageIndex, verdictCorrectionBlocker, milestoneBlocker, readinessBlocker, uroReturnBlocker, postDefenseBlocker,
} from './stages.js'
import { canSign } from './forms.js'
import { DOC_STATUS, REVIEWABLE_TYPES, PROJECT_ROLES as P, PANEL_ROLES, COURSES } from './constants.js'

const OPEN = [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW, DOC_STATUS.FOR_REVISION, DOC_STATUS.APPROVED, DOC_STATUS.REJECTED]
const AWAITING_DECISION = [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW]

const docCheck = (states, label) => (t) => {
  const d = t?.doc
  if (!d) return 'No document was given.'
  if (!states.includes(d.status)) return `${label} (this version is ${d.status}).`
  if (!REVIEWABLE_TYPES.includes(d.docType)) return `${d.docType} is verified at clearance, not reviewed.`
  return null
}

/**
 * Every action the mockup performs. `cap` is the CAAC capability; `docStates`
 * (when present) are the document/log states the action applies to; `check`
 * validates the concrete target. Gate actions are added from stages.js.
 */
export const ACTIONS = {
  viewProject: { cap: 'project.view' },
  readDocuments: { cap: 'document.read' },
  viewDocumentHistory: { cap: 'document.history' },
  viewAnnotations: { cap: 'document.read' },
  submitDocument: { cap: 'document.submit' },
  annotate: {
    cap: 'document.annotate', docStates: OPEN,
    check: docCheck(OPEN, 'Only the current version can be annotated'),
  },
  reviewDocument: {
    cap: 'review.decide', docStates: AWAITING_DECISION,
    check: docCheck(AWAITING_DECISION, 'A decision has already been recorded on this version'),
  },
  returnDocument: {
    cap: 'review.return', docStates: AWAITING_DECISION,
    check: docCheck(AWAITING_DECISION, 'A decision has already been recorded on this version'),
  },
  // Private panel notes after the verdict (OQ#3). The AI summary stays guard-only (R12).
  viewPrivatePanelNotes: { cap: 'annotation.viewReleased' },
  viewAiSummary: { cap: 'ai.view' },

  manageRoster: { cap: 'roster.manage' },
  assignAdviser: { cap: 'adviser.assign' },
  assignPanel: { cap: 'panel.assign' },
  assignInstructor2: { cap: 'instructor2.assign' },
  scheduleDefense: { cap: 'defense.schedule' },
  // S9.4 return path (NEW-7): `t.docTypes`, the certificates to replace (NEW-45).
  uroReturn: {
    cap: 'uro.return',
    check: (t, b) => uroReturnBlocker(b, t?.docTypes),
  },
  recordVerdict: { cap: 'verdict.record' },
  // NEW-42 — once, within VERDICT_CORRECTION_HOURS, before anyone acts on it.
  correctVerdict: {
    cap: 'verdict.correct',
    check: (t, b) => (t?.defense ? verdictCorrectionBlocker(b, t.defense) : 'No defense was given.'),
  },

  submitWeeklyLog: { cap: 'weeklylog.submit' },
  signWeeklyLog: {
    cap: 'weeklylog.sign', docStates: ['Submitted'],
    check: (t) => !t?.log ? 'No log was given.'
      : t.log.status !== 'Submitted' ? `This log is already ${t.log.status}.` : null,
  },
  exportWeeklyLogs: { cap: 'weeklylog.export' },
  // S6.5 — one milestone per call (`t.milestone`, a CAPSTONE2_MILESTONES key).
  confirmMilestones: {
    cap: 'milestone.confirm',
    check: (t, b) => milestoneBlocker(b, t?.milestone),
  },
  // S6.7 (NEW-43) — after both milestones.
  confirmReadiness: {
    cap: 'readiness.confirm',
    check: (t, b) => readinessBlocker(b),
  },
  // S8.5 (NEW-44) — record only.
  confirmPostDefenseRequirements: {
    cap: 'requirements.confirm',
    check: (t, b) => postDefenseBlocker(b),
  },
  // Signing is decided by the form itself: listed signatory, turn, stage.
  signForm: {
    cap: 'project.view',
    check: (t, b, user) => {
      if (!t?.form) return 'No form was given.'
      const r = canSign(t.form, user, b)
      return r.ok ? null : (r.reason ?? 'You have no pending line on this form.')
    },
  },

  // Stage gates — one action per gate, named after the gate.
  ...Object.fromEntries(STAGES.flatMap(s => s.gates.map(gate => [gate.action, { cap: gate.capability, gate: true }]))),
}

/** Gate actions and the stage-machine gate they belong to. */
export const gateAction = (gate) => gate.action

export { AccessDenied }

/** canView(user, project) — §2.2. */
export function canView(user, b) {
  if (!b) return false
  return can(resolveContext(user, b), 'project.view')
}

/**
 * canDo(user, action, project, target) — §2.2.
 * Returns { ok, reason, hat, ctx }. `hat` is the role that grants it.
 */
export function canDo(user, action, b, target = {}) {
  const spec = ACTIONS[action]
  if (!spec) return { ok: false, reason: `Unknown action "${action}".` }
  if (!b) return { ok: false, reason: 'This project is not available to you.' }
  if (!isActiveAccount(user)) {
    return { ok: false, reason: 'Your account is not active yet. The System Administrator activates verified accounts.' }
  }
  const ctx = resolveContext(user, b)
  if (!can(ctx, 'project.view')) return { ok: false, reason: 'This project is not available to you.', ctx }
  if (!can(ctx, spec.cap)) {
    const d = ctx.dormant.find(x => x.cap === spec.cap)
    return {
      ok: false, ctx,
      reason: d ? denialOf(d, b.project.currentStage) : 'No role you hold on this project allows this.',
    }
  }
  const blocked = spec.check?.(target, b, user)
  if (blocked) return { ok: false, reason: blocked, ctx }
  return { ok: true, reason: null, hat: why(ctx, spec.cap).role, ctx }
}

export function assertCan(user, action, b, target) {
  const r = canDo(user, action, b, target)
  if (!r.ok) throw new AccessDenied(r.reason)
  return r
}

/**
 * The allowedActions table of §2.2: which actions a role hat may perform at a
 * stage for a document state. Relationship conditions (member of the group,
 * program in scope, not the adviser being approved) are assumed met here —
 * canView and canDo check them against the real user.
 */
export function allowedActions(roleHat, stage, docState = null) {
  const env = {
    stage, isMember: true, projectRoles: [roleHat],
    user: { programScope: ['*'] }, project: { program: '*' }, sections: [{ course: COURSES.C1 }],
  }
  const caps = new Set(PROJECT_POLICIES.filter(p => p.role === roleHat && p.when.test(env)).map(p => p.cap))
  return Object.entries(ACTIONS)
    .filter(([, spec]) => caps.has(spec.cap))
    .filter(([, spec]) => !docState || !spec.docStates || spec.docStates.includes(docState))
    .map(([name]) => name)
}

/** Every role hat × stage row, for the dev tools and the report. */
export function allowedActionsTable(roleHats) {
  return roleHats.flatMap(hat => STAGES.map(s => ({ hat, stage: s.key, actions: allowedActions(hat, s.key) })))
}

// --- Reads -------------------------------------------------------------------

/**
 * The group learns who its faculty are when the workflow says so: the Adviser
 * once the appointment is approved (S2.2 "adviser name shown"), the panel once
 * the Program Chair/Coordinator confirms it (S5.1). Until then an assignment is
 * a proposal, not a fact the students are told.
 */
export function assignmentVisibleToGroup(a, stage) {
  const at = stageIndex(stage)
  if (a.roleType === P.ADVISER) return at > stageIndex('ADVISER_APPROVAL')
  if (PANEL_ROLES.includes(a.roleType)) return at > stageIndex('PANEL_ASSIGNMENT')
  return true
}

/**
 * Private panel notes: the author always sees their own; others see them only
 * after the verdict releases them AND they hold `annotation.viewReleased`
 * (OQ#3 — the students). Never shared between panelists.
 */
export function canViewAnnotation(user, ctx, a) {
  if (!can(ctx, 'document.read')) return false
  if (a.visibility !== 'private') return true
  if (a.authorId === user?.id) return true
  return Boolean(a.releasedAt) && can(ctx, 'annotation.viewReleased')
}

/**
 * The part of a project bundle this user may see. The UI renders from this,
 * never from the raw bundle, so nothing leaks through lists, counts or badges:
 * no documents without `document.read` (the System Administrator), only the
 * latest version without `document.history` (the panel), private notes per
 * canViewAnnotation, and the AI summary only for its audience.
 */
export function viewBundle(user, b) {
  if (!b) return null
  const ctx = resolveContext(user, b)
  if (!can(ctx, 'project.view')) return null
  const read = can(ctx, 'document.read')
  const documents = !read ? []
    : can(ctx, 'document.history') ? b.documents
      : b.documents.filter(d => d.status !== DOC_STATUS.SUPERSEDED)
  const ids = new Set(documents.map(d => d.id))
  // A group member who holds no role on the project sees the group's view.
  const groupView = ctx.isMember && ctx.projectRoles.length === 0
  return {
    ...b,
    assignments: groupView
      ? b.assignments.filter(a => assignmentVisibleToGroup(a, b.project.currentStage))
      : b.assignments,
    documents,
    reviews: b.reviews.filter(r => ids.has(r.documentId)),
    annotations: b.annotations.filter(a => ids.has(a.documentId) && canViewAnnotation(user, ctx, a)),
    aiSummaries: can(ctx, 'ai.view') ? b.aiSummaries.filter(x => ids.has(x.documentId)) : [],
    weeklyLogs: read ? b.weeklyLogs : [],
    forms: read ? b.forms : [],
    // A private panel note's history entry is its author's alone (T4).
    history: b.history.filter(h => !h.privateTo || h.privateTo === user?.id),
    // A yes/no only — counting hidden notes or versions would itself leak.
    latestOnly: read && !can(ctx, 'document.history'),
  }
}
