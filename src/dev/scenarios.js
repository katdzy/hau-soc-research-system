// Dev-only (R9). One-click setups for the WORKFLOWS.md §7 scenarios. Each
// starts from a fresh seed and moves the groups the scenario needs to the
// right stage with the stage builder. The guard unit tests use the same
// setups, so the UI walkthrough and the tests exercise identical data.
//
// §6 and §7 do not line up on stages (T1 needs G1 in Implementation, T4/T5/T16
// need a panel on G1, T7 needs G3 before PC endorsement), which is why these
// exist instead of one fixed seed.

import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'

const g1 = (stage, extra = {}) => (s) => applyStage(s, 'p_g1', stage, { roles: SEED_ROLES.p_g1, ...extra })
const g3 = (stage, extra = {}) => (s) => applyStage(s, 'p_g3', stage, { roles: SEED_ROLES.p_g3, ...extra })
const seedOnly = (s) => s

// `on`: the project the scenario is about (null: accounts, audit, no project),
// so the sign-in demo panel can file each one under its group.
export const SCENARIOS = [
  { id: 'T1', on: 'p_g1', loginAs: 'f_alpha', setup: g1('IMPLEMENTATION', { pendingLog: true }),
    look: 'G1 → Weekly logs', expect: 'Prof. Alpha (Adviser of G1) can approve and sign the pending log, and annotate the current Revised Manuscript in G1 → Documents.' },
  { id: 'T2', on: 'p_g2', loginAs: 'f_alpha', setup: seedOnly,
    look: 'G2 → Defense', expect: 'Can record the verdict as Panel Chair; no adviser actions (no review, no log signing).' },
  { id: 'T3', on: 'p_g3', loginAs: 'f_alpha', setup: seedOnly,
    look: 'Projects list and /projects/p_g3', expect: 'G3 (Final Revision) is not visible to Prof. Alpha; it appears only when a PC step is active (load T10).' },
  { id: 'T4', on: 'p_g1', loginAs: 'f_charlie', setup: g1('PROPOSAL_DEFENSE', { privateNoteBy: 'f_charlie' }),
    look: 'G1 → Documents', expect: 'Charlie’s private note is visible to Charlie only — switch to Prof. Alpha (Adviser), Prof. Foxtrot (Panel Chair) or a G1 student: it is not in their list or on the page.' },
  { id: 'T5', on: 'p_g1', loginAs: 'f_charlie', setup: g1('PROPOSAL_DEFENSE'),
    look: 'G1 → Defense', expect: 'No verdict button — Charlie is a Panel Member, not the Chair.' },
  { id: 'T6', on: 'p_g3', loginAs: 'f_charlie', setup: seedOnly,
    look: 'G3 as Instructor 2', expect: 'G3 → Documents opens the file read-only: no Select text / Mark area tools and no annotation form; the guard rejects annotate.' },
  { id: 'T7', on: 'p_g3', loginAs: 'f_charlie', setup: g3('FINAL_DEFENSE_ENDORSEMENT'),
    look: 'G3 → Defense / Overview', expect: '"Create schedule" is not available before the PC endorses.' },
  { id: 'T8', on: 'p_g3', loginAs: 'f_delta', setup: seedOnly,
    look: 'G3', expect: 'Full Adviser view (documents with history, logs, forms).' },
  { id: 'T9', on: 'p_g1', loginAs: 'f_delta', setup: g1('ADVISER_APPROVAL'),
    look: 'Worklist', expect: 'G1 visible (adviser approval); G2 not visible as Dean.' },
  { id: 'T10', on: 'p_g3', loginAs: 'f_alpha', setup: g3('CLEARANCE', { approvalSheet: 'panel-signed', certificates: true }),
    look: 'G3 → Overview', expect: 'Prof. Alpha can endorse the Approval Sheet; cannot give the final signature.' },
  { id: 'T11', on: 'p_g3', loginAs: 'f_delta', setup: g3('URO_VERIFICATION'),
    look: 'G3', expect: 'Final signature blocked (not visible / guard rejects) until the URO clears.' },
  { id: 'T12', on: 'p_g3', loginAs: 'o_uniform', setup: g3('CLEARANCE', { certificates: true }),
    look: 'Worklist', expect: 'G3 not in the URO queue before the PC endorses.' },
  { id: 'T13', on: 'p_g1', loginAs: 's_kilo', setup: seedOnly,
    look: 'Projects, G1 → Documents', expect: 'No other groups, no approve buttons; a re-upload creates v2 and supersedes v1.' },
  { id: 'T14', on: null, loginAs: 's_whiskey', setup: seedOnly,
    look: 'Worklist', expect: 'Empty state, no project data.' },
  { id: 'T15', on: 'p_g2', loginAs: 'f_echo', setup: seedOnly,
    look: 'G2 → Documents', expect: 'Only the latest Proposal Manuscript version (v2) is listed.' },
  { id: 'T16', on: 'p_g1', loginAs: 'f_alpha', setup: g1('PANEL_ASSIGNMENT', { preassign: ['Panel Chair', 'Panel Member'] }),
    look: 'G1 → Overview → Faculty assignments', expect: 'Remove Prof. Charlie from the panel; G1 leaves Charlie’s dashboard; audit entry written.' },
  { id: 'T17', on: 'p_g1', loginAs: 'f_alpha', setup: g1('IMPLEMENTATION', { pendingLog: true }),
    look: 'G1 → Weekly logs', expect: 'Double-click "Approve and sign": one approval recorded.' },
  { id: 'T18', on: 'p_g3', loginAs: 's_quebec', setup: g3('FINAL_REVISION', { revisionDeadlineDays: -1 }),
    look: 'Worklist / Dev tools → Outbox', expect: 'Overdue flag on the worklist and an "Overdue Revision" email in the outbox.' },
  { id: 'T19', on: 'p_g1', loginAs: 'f_alpha', setup: g1('PANEL_ASSIGNMENT'),
    look: 'G1 → Overview → assign Panel Member', expect: 'Prof. Alpha (G1 Adviser) cannot be assigned to G1’s panel (NEW-5, BLOCK_ADVISER_ON_PANEL).' },
  { id: 'T20', on: null, loginAs: 'a_sierra', setup: seedOnly,
    look: 'Any project', expect: 'Project record opens (config/audit) but no documents tab; annotate rejected.' },
  { id: 'T21', on: null, loginAs: 'f_alpha', setup: seedOnly,
    look: 'Dev tools → Audit / history', expect: 'Every action above writes actor, role hat, before → after.' },
]

export const scenarioById = (id) => SCENARIOS.find(s => s.id === id)

/** The store for a scenario: fresh seed + its setup. */
export function scenarioStore(id) {
  const sc = scenarioById(id)
  if (!sc) throw new Error(`Unknown scenario ${id}`)
  return sc.setup(buildSeed())
}
