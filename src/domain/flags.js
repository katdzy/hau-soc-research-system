// Configuration flags for every workflow point that WORKFLOWS.md leaves open.
//
// Two kinds of entries live here:
//   • "Mockup default" — a placeholder from WORKFLOWS.md so the mockup can be
//     built now. It is NOT a team decision; flip it once the open question is
//     settled, then re-run the role prompts for the affected roles.
//   • "Decided 2026-09-29" — questions WORKFLOWS.md gave no default for, which
//     the team answered during the Prompt 0 audit (keep the current behaviour).
//
// `wired` says where the flag takes effect. A flag marked "not wired" is
// recorded so the value is in one place, but no code reads it yet.

// No imports: constants.js reads VERDICT_VALUES and REVISION_DAYS from here,
// so role names are written out (they match GLOBAL_ROLES / PROJECT_ROLES).
const G = { COORDINATOR: 'Program Chair/Coordinator' }
const P = {
  INSTRUCTOR_1: 'Instructor 1', INSTRUCTOR_2: 'Instructor 2', ADVISER: 'Adviser',
  PANEL_CHAIR: 'Panel Chair', PANEL_MEMBER: 'Panel Member',
}

export const FLAGS = {
  /** NEW-1 · Mockup default. Faculty accounts get a base `Faculty` Global Role with no global permissions. */
  FACULTY_BASE_IDENTITY: true,

  /**
   * OQ#4 · Mockup default. 'email+admin' = the owner verifies the email, then the
   * System Administrator activates the account. 'email' = verification alone activates.
   */
  ACCOUNT_ACTIVATION: 'email+admin',

  /**
   * NEW-7 · Mockup default. 'both' = Dean AND Associate Dean approve, any order.
   * 'either' = the first approval is enough.
   */
  ADVISER_APPROVAL: 'both',

  /** OQ#5 · Mockup default. No accept/decline step for the Adviser. Not wired (off = nothing to do). */
  ADVISER_ACCEPT_STEP: false,

  /**
   * NEW-2 · Mockup default. Who schedules the PROPOSAL defense:
   * G.COORDINATOR | P.INSTRUCTOR_1 | P.INSTRUCTOR_2.
   */
  PROPOSAL_DEFENSE_SCHEDULER: G.COORDINATOR,

  /**
   * NEW-3 · Mockup default. 'sub-status' = revisions after the proposal defense are
   * shown as part of the Proposal Defense stage (the PROPOSAL_REVISION key stays as
   * the sub-status). 'stage' = shown as a stage of its own.
   */
  PROPOSAL_REVISION: 'sub-status',

  /**
   * NEW-4 · Mockup default — FEATURE NOT BUILT YET (R12). The stub that exists
   * generates the summary when the defense schedule is published; it is left as is.
   * Not wired.
   */
  AI_SUMMARY_TRIGGER: 'auto-on-complete-manuscript-at-defense-milestone',

  /** OQ#2 · Mockup default — FEATURE NOT BUILT YET (R12). Guard-only: who may read the AI summary. */
  AI_SUMMARY_AUDIENCE: [P.ADVISER, P.PANEL_CHAIR, P.PANEL_MEMBER],

  /**
   * OQ#3 · Mockup default. Built 2026-09-30 (annotations are no longer R12).
   * 'students-on-verdict' = private panel notes are released to the group's
   * students when the Panel Chair records the verdict; never shared between panelists.
   */
  PANEL_NOTES_RELEASE: 'students-on-verdict',

  /** OQ#10 · Mockup default. The Panel Chair's verdict values. */
  VERDICT_VALUES: {
    MINOR: 'Passed with Minor Revisions',
    MAJOR: 'Passed with Major Revisions',
    REDEFENSE: 'Re-defense',
  },

  /**
   * Mockup default ("configurable"). Revision countdown length in days. This is
   * the starting value; the System Administrator changes it under Administration →
   * Global settings (`settings/global`, read through revisionDaysOf in settings.js).
   */
  REVISION_DAYS: { Minor: 7, Major: 14 },

  /** OQ#7 · Mockup default. Who approves and e-signs weekly logs: P.ADVISER | P.INSTRUCTOR_2. */
  WEEKLY_LOG_SIGNER: P.ADVISER,

  /**
   * NEW-11 · Mockup default. 'summary-outside-pc-steps' = the Program
   * Chair/Coordinator sees program-level counts and status for every project
   * (Reports), but opens a project only while one of their own steps is active.
   * 'full' = opens every in-scope project from Adviser Assignment on.
   */
  PC_PROGRAM_VISIBILITY: 'summary-outside-pc-steps',

  /** NEW-10 · Mockup default. Number of URO review levels. 1 = one verify step (current behaviour). */
  URO_REVIEW_LEVELS: 1,

  /** NEW-7 · Mockup default. URO can return the project to the group with remarks (S9.4). */
  URO_RETURN_PATH: true,

  // --- Decided 2026-09-29 (Prompt 0): keep the current behaviour ----------------

  /**
   * NEW-5. The Dean / Associate Dean cannot approve an adviser assignment that
   * names themselves. Decided 2026-09-29 (Prompt 5): the other office then
   * approves alone, so such an assignment does not deadlock under 'both'.
   */
  BLOCK_SELF_APPROVAL: true,

  /** NEW-5 / T19. The Adviser cannot sit on their own group's panel (and vice versa). */
  BLOCK_ADVISER_ON_PANEL: true,

  /** NEW-6. What Instructor 1 keeps after routing to Capstone 2: 'none' | 'read-only'. */
  I1_ACCESS_AFTER_ROUTING: 'none',

  /** NEW-6. The proposal panel carries over to the final defense (PC may still change it). */
  SAME_PANEL_BOTH_DEFENSES: true,

  /** OQ#5. Who assigns Instructor 2. */
  INSTRUCTOR_2_ASSIGNER: G.COORDINATOR,

  // --- Decided 2026-09-29 (Prompt 1) --------------------------------------------

  /**
   * §4 "permission overrides" (no definition in WORKFLOWS.md). 'deny-only' = the
   * System Administrator can revoke one capability from one user, on one project
   * or everywhere, and lift it later. An override never adds a permission.
   * 'off' = overrides are ignored and the screen is hidden.
   */
  PERMISSION_OVERRIDES: 'deny-only',

  // --- Decided 2026-09-29 (team) ------------------------------------------------

  /**
   * A capstone group has this many members. Instructor 1 cannot add a student
   * to a full group. Forwarding a smaller group is not blocked (NEW-31).
   */
  GROUP_SIZE: 4,

  // --- Decided 2026-09-29 (Prompt 8, Panel Chair) ------------------------------

  /** NEW-40. The verdict can be recorded only once the defense's scheduled date and time have passed. */
  VERDICT_AFTER_SCHEDULED_TIME: true,

  /**
   * NEW-41. A Re-defense verdict carries required changes and a countdown of this
   * length ('Major' | 'Minor' days from REVISION_DAYS / the Admin setting). The
   * defense is rescheduled once the Adviser approves the revised manuscript (S7.7).
   */
  REDEFENSE_REVISION_DAYS: 'Major',

  /**
   * NEW-42. The Panel Chair may correct a recorded verdict once, within this many
   * hours, and only before anyone has acted on it (no revised manuscript, no other
   * FM-2004 signature). 0 = verdicts are final.
   */
  VERDICT_CORRECTION_HOURS: 24,

  // --- Decided 2026-09-29 (Prompt 9, Instructor 2) ------------------------------

  /**
   * NEW-43. S6.7 — how Instructor 2's readiness check is recorded. 'own-step' =
   * once both Capstone 2 milestones are confirmed, Instructor 2 confirms the group
   * is ready for final defense, and the Adviser's FM-AAC-SOC-2005 waits on it.
   * 'milestones' = confirming the milestones counts as the readiness check.
   */
  I2_READINESS_CHECK: 'own-step',

  /**
   * NEW-44. S8.5 — the stages at which Instructor 2 confirms the post-defense
   * course requirements. Record only: nothing waits on it (§9 — Instructor 2 is
   * not a clearance signatory).
   */
  POST_DEFENSE_REQUIREMENTS_STAGES: ['FINAL_REVISION', 'CLEARANCE'],

  // --- Decided 2026-09-29 (Prompt 10, URO) --------------------------------------

  /**
   * NEW-45. What the URO may return to the group (URO_RETURN_PATH): the
   * certificates only. The group uploads new versions and the project goes back
   * to the URO queue; the Approval Sheet signatures stand. A problem with the
   * manuscript itself has no path yet (NEW-46).
   */
  URO_RETURNABLE: ["Editor's Certificate", 'Plagiarism Clearance Certificate'],

  /**
   * NEW-46. The URO finds a problem in the manuscript itself. 'to-final-requirements'
   * = the URO may return the Final Manuscript too: the project goes back to Final
   * Requirements, the Approval Sheet is voided and reissued, and once the group
   * uploads a new Final Manuscript the Adviser, panel and Program Chair sign again
   * (they certified the old one). 'off' = the manuscript cannot be returned.
   */
  URO_MANUSCRIPT_RETURN: 'to-final-requirements',

  /**
   * S9.4 · not explicit in the manuscript (for the team). true = clearing signs the
   * URO's line (4) on the Approval Sheet. false = the sheet has no URO line; the
   * clearance is recorded in the audit trail and workflow history only.
   */
  URO_SIGNS_APPROVAL_SHEET: true,

  /**
   * URO emails · not stated in the manuscript (for the team). `endorsedToUro` =
   * the URO is emailed when the Program Chair/Coordinator endorses a project to
   * them; `certificatesResubmitted` = when the group replaces what the URO returned.
   */
  URO_EMAILS: { endorsedToUro: true, certificatesResubmitted: true },

  // --- R9: dev tools -----------------------------------------------------------

  /** Persona switcher, stage controls, reset, outbox, audit viewer. Never in a production build. */
  DEV_TOOLS: import.meta.env?.DEV === true,
}

/** Where each flag takes effect — shown on the dev tools page and in the report. */
export const FLAG_NOTES = {
  FACULTY_BASE_IDENTITY: { source: 'NEW-1', kind: 'Mockup default', wired: 'verifyEmail (actions.js), Admin role options' },
  ACCOUNT_ACTIVATION: { source: 'OQ#4', kind: 'Mockup default', wired: 'verifyEmail, setAccountStatus (actions.js)' },
  ADVISER_APPROVAL: { source: 'NEW-7', kind: 'Mockup default', wired: 'APPROVE_ADVISER gate (stages.js, actions.js)' },
  ADVISER_ACCEPT_STEP: { source: 'OQ#5', kind: 'Mockup default', wired: 'not wired (off)' },
  PROPOSAL_DEFENSE_SCHEDULER: { source: 'NEW-2', kind: 'Mockup default', wired: 'caac.js defense.schedule policy' },
  PROPOSAL_REVISION: { source: 'NEW-3', kind: 'Mockup default', wired: 'stages.js label / macro stage' },
  AI_SUMMARY_TRIGGER: { source: 'NEW-4', kind: 'Mockup default · feature not built (R12)', wired: 'not wired' },
  AI_SUMMARY_AUDIENCE: { source: 'OQ#2', kind: 'Mockup default · feature not built (R12)', wired: 'caac.js ai.view policy (guard)' },
  PANEL_NOTES_RELEASE: { source: 'OQ#3', kind: 'Mockup default', wired: 'guard.js canViewAnnotation; recordVerdict (actions.js) sets releasedAt' },
  VERDICT_VALUES: { source: 'OQ#10', kind: 'Mockup default', wired: 'constants.js VERDICTS' },
  REVISION_DAYS: { source: 'S7.6', kind: 'Mockup default', wired: 'starting value for settings.js revisionDaysOf → recordVerdict, DefensePanel; Admin can change it' },
  WEEKLY_LOG_SIGNER: { source: 'OQ#7', kind: 'Mockup default', wired: 'caac.js weeklylog.sign policy' },
  PC_PROGRAM_VISIBILITY: { source: 'NEW-11', kind: 'Mockup default', wired: 'caac.js Program Chair project.view' },
  URO_REVIEW_LEVELS: { source: 'NEW-10', kind: 'Mockup default', wired: '1 = current single URO gate' },
  URO_RETURN_PATH: { source: 'NEW-7', kind: 'Mockup default', wired: 'caac.js uro.return policy, returnToGroup (actions.js), UroReview panel' },
  BLOCK_SELF_APPROVAL: { source: 'NEW-5', kind: 'Decided 2026-09-29', wired: 'caac.js notTheAdviser; stages.js requiredAdviserApprovers (other office approves alone)' },
  BLOCK_ADVISER_ON_PANEL: { source: 'NEW-5 / T19', kind: 'Decided 2026-09-29', wired: 'assignmentConflict (actions.js)' },
  I1_ACCESS_AFTER_ROUTING: { source: 'NEW-6', kind: 'Decided 2026-09-29', wired: 'caac.js Instructor 1 project.view' },
  SAME_PANEL_BOTH_DEFENSES: { source: 'NEW-6', kind: 'Decided 2026-09-29', wired: 'current behaviour (assignments persist)' },
  INSTRUCTOR_2_ASSIGNER: { source: 'OQ#5', kind: 'Decided 2026-09-29', wired: 'caac.js instructor2.assign policy' },
  PERMISSION_OVERRIDES: { source: '§4 Sys Admin (NEW-19)', kind: 'Decided 2026-09-29', wired: 'caac.js overridesFor / evaluate, revokeCapability (actions.js), Admin page' },
  GROUP_SIZE: { source: 'Team, 2026-09-29', kind: 'Decided 2026-09-29', wired: 'addMember (actions.js), Overview and section desk counts' },
  VERDICT_AFTER_SCHEDULED_TIME: { source: 'NEW-40', kind: 'Decided 2026-09-29', wired: 'stages.js defenseNotHeld → verdict gates, recordVerdict, DefensePanel' },
  REDEFENSE_REVISION_DAYS: { source: 'NEW-41', kind: 'Decided 2026-09-29', wired: 'recordVerdict countdown; stages.js RETURN_TO_*_DEFENSE gates; submitReview' },
  VERDICT_CORRECTION_HOURS: { source: 'NEW-42', kind: 'Decided 2026-09-29', wired: 'stages.js verdictCorrectionBlocker, guard correctVerdict, correctVerdict (actions.js), DefensePanel' },
  I2_READINESS_CHECK: { source: 'NEW-43', kind: 'Decided 2026-09-29', wired: 'caac.js readiness.confirm policy, stages.js readinessBlocker + FM-2005 gate, confirmReadiness (actions.js)' },
  POST_DEFENSE_REQUIREMENTS_STAGES: { source: 'NEW-44', kind: 'Decided 2026-09-29', wired: 'caac.js requirements.confirm policy, confirmPostDefenseRequirements (actions.js)' },
  URO_RETURNABLE: { source: 'NEW-45', kind: 'Decided 2026-09-29', wired: 'stages.js uroReturnBlocker, returns.js uroReturnOutstanding, caac.js allowedDocTypes' },
  URO_MANUSCRIPT_RETURN: { source: 'NEW-46', kind: 'Decided 2026-09-30', wired: 'stages.js uroReturnableTypes / returnResetsSigning, returnToGroup (actions.js), forms.js canSign' },
  URO_SIGNS_APPROVAL_SHEET: { source: 'S9.4 (not explicit)', kind: 'Mockup default', wired: 'stages.js URO_VERIFY signs, approvalSheetSignatories (actions.js), stageBuilder' },
  URO_EMAILS: { source: 'S9.4 (not stated)', kind: 'Mockup default', wired: 'transition + submitDocument (actions.js)' },
  DEV_TOOLS: { source: 'R9', kind: 'Build flag', wired: 'App.jsx, Shell.jsx, SignIn.jsx' },
}
