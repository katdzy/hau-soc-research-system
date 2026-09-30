// Guard-level tests for the WORKFLOWS.md §7 CAAC scenarios T1–T21, plus the
// R12 guard-only actions (annotate, viewAnnotations, viewPrivatePanelNotes,
// viewAiSummary). Pure: canView / canDo against scenario stores, no UI.

import { describe, it, expect } from 'vitest'
import { bundle } from '../services/core.js'
import { canView, canDo, viewBundle, allowedActions, canViewAnnotation } from '../domain/guard.js'
import { resolveContext } from '../domain/caac.js'
import { scenarioStore } from '../dev/scenarios.js'
import { buildSeed } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { DOC_TYPES, DOC_STATUS, PROJECT_ROLES as P, accountType } from '../domain/constants.js'

const toSnap = (store) => Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Object.values(v)]))

function world(store) {
  const snap = toSnap(store)
  const user = (id) => snap.users.find(u => u.id === id)
  const b = (id) => bundle(snap, id)
  const doDo = (uid, action, pid, target) => canDo(user(uid), action, b(pid), target)
  const latest = (pid, type) => b(pid).documents.filter(d => d.docType === type)
    .sort((x, y) => y.versionNumber - x.versionNumber)[0]
  return { snap, user, b, can: (...a) => doDo(...a).ok, why: (...a) => doDo(...a).reason, latest }
}
const scenario = (id) => world(scenarioStore(id))

describe('§7 CAAC scenarios (guard level)', () => {
  it('T1 — Prof. Alpha signs G1 logs as Adviser; annotate allowed on the open manuscript', () => {
    const w = scenario('T1')
    const log = w.b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    expect(w.can('f_alpha', 'signWeeklyLog', 'p_g1', { log })).toBe(true)
    expect(canDo(w.user('f_alpha'), 'signWeeklyLog', w.b('p_g1'), { log }).hat).toBe(P.ADVISER)
    // R12 guard-only: the Adviser may annotate an open version during Implementation.
    const draft = { ...w.latest('p_g1', DOC_TYPES.REVISED_MANUSCRIPT), status: DOC_STATUS.SUBMITTED }
    expect(w.can('f_alpha', 'annotate', 'p_g1', { doc: draft })).toBe(true)
  })

  it('T2 — Prof. Alpha records the G2 verdict as Panel Chair; no adviser actions', () => {
    const w = scenario('T2')
    expect(w.can('f_alpha', 'recordVerdict', 'p_g2')).toBe(true)
    const m = w.latest('p_g2', DOC_TYPES.PROPOSAL_MANUSCRIPT)
    expect(w.can('f_alpha', 'reviewDocument', 'p_g2', { doc: { ...m, status: DOC_STATUS.SUBMITTED } })).toBe(false)
    expect(w.can('f_alpha', 'signWeeklyLog', 'p_g2', { log: { status: 'Submitted' } })).toBe(false)
    expect(w.can('f_alpha', 'viewDocumentHistory', 'p_g2')).toBe(false)
  })

  it('T3 — G3 is invisible to Prof. Alpha until a PC step is active', () => {
    const w = scenario('T3')
    expect(w.snap.projects.find(p => p.id === 'p_g3').currentStage).toBe('FINAL_REVISION')
    expect(canView(w.user('f_alpha'), w.b('p_g3'))).toBe(false)
    const t10 = scenario('T10')
    expect(canView(t10.user('f_alpha'), t10.b('p_g3'))).toBe(true)
  })

  it('T4 — a panelist’s private note is hidden from the Adviser and the students before the verdict', () => {
    const w = scenario('T4')
    const b = w.b('p_g1')
    const note = b.annotations.find(a => a.authorId === 'f_charlie')
    expect(note?.visibility).toBe('private')
    for (const [uid, sees] of [['f_charlie', true], ['f_alpha', false], ['s_kilo', false], ['f_foxtrot', false]]) {
      const ctx = resolveContext(w.user(uid), b)
      expect(canViewAnnotation(w.user(uid), ctx, note), uid).toBe(sees)
      expect(viewBundle(w.user(uid), b).annotations.some(a => a.id === note.id), uid).toBe(sees)
    }
    expect(w.can('f_alpha', 'viewPrivatePanelNotes', 'p_g1')).toBe(false)
    expect(w.can('s_kilo', 'viewPrivatePanelNotes', 'p_g1')).toBe(true) // capability exists …
    expect(canViewAnnotation(w.user('s_kilo'), resolveContext(w.user('s_kilo'), b), note)).toBe(false) // … but not before release
    // After the verdict releases it: the students see it, the other panelist still does not (OQ#3).
    const released = { ...note, releasedAt: new Date().toISOString() }
    expect(canViewAnnotation(w.user('s_kilo'), resolveContext(w.user('s_kilo'), b), released)).toBe(true)
    expect(canViewAnnotation(w.user('f_foxtrot'), resolveContext(w.user('f_foxtrot'), b), released)).toBe(false)
  })

  it('T5 — Prof. Charlie (Panel Member of G1) cannot record the verdict', () => {
    const w = scenario('T5')
    expect(w.can('f_charlie', 'recordVerdict', 'p_g1')).toBe(false)
    expect(w.can('f_foxtrot', 'recordVerdict', 'p_g1')).toBe(true)
  })

  it('T6 — Instructor 2 on G3 can never annotate', () => {
    const w = scenario('T6')
    const draft = { ...w.latest('p_g3', DOC_TYPES.FINAL_MANUSCRIPT), status: DOC_STATUS.SUBMITTED }
    expect(canView(w.user('f_charlie'), w.b('p_g3'))).toBe(true)
    expect(w.can('f_charlie', 'annotate', 'p_g3', { doc: draft })).toBe(false)
    for (const stage of ['IMPLEMENTATION', 'FINAL_DEFENSE', 'FINAL_REVISION', 'CLEARANCE']) {
      expect(allowedActions(P.INSTRUCTOR_2, stage)).not.toContain('annotate')
    }
  })

  it('T7 — Instructor 2 cannot schedule the final defense before the PC endorses', () => {
    const w = scenario('T7')
    expect(w.can('f_charlie', 'scheduleDefense', 'p_g3')).toBe(false)
    expect(w.can('f_alpha', 'ENDORSE_FINAL_DEFENSE', 'p_g3')).toBe(true)
    const after = world(applyStage(buildSeed(), 'p_g3', 'FINAL_DEFENSE_SCHEDULING', { roles: { [P.INSTRUCTOR_2]: 'f_charlie', [P.ADVISER]: 'f_delta' } }))
    expect(after.can('f_charlie', 'scheduleDefense', 'p_g3')).toBe(true)
  })

  it('T8 — Dean Delta has the full Adviser view on G3', () => {
    const w = scenario('T8')
    expect(canView(w.user('f_delta'), w.b('p_g3'))).toBe(true)
    expect(w.can('f_delta', 'viewDocumentHistory', 'p_g3')).toBe(true)
    expect(w.can('f_delta', 'readDocuments', 'p_g3')).toBe(true)
    expect(viewBundle(w.user('f_delta'), w.b('p_g3')).documents.length).toBe(w.b('p_g3').documents.length)
  })

  it('T9 — as Dean, G1/G2 are visible only at adviser approval and after URO clearance', () => {
    const seed = world(buildSeed())
    expect(canView(seed.user('f_delta'), seed.b('p_g1'))).toBe(false) // Conceptualization
    expect(canView(seed.user('f_delta'), seed.b('p_g2'))).toBe(false) // Proposal Defense
    const w = scenario('T9')
    expect(canView(w.user('f_delta'), w.b('p_g1'))).toBe(true) // Adviser Approval
    expect(w.can('f_delta', 'APPROVE_ADVISER', 'p_g1')).toBe(true)
    const fa = world(applyStage(buildSeed(), 'p_g2', 'FINAL_APPROVAL', { roles: { [P.ADVISER]: 'f_charlie', [P.PANEL_CHAIR]: 'f_alpha', [P.PANEL_MEMBER]: ['f_echo'], [P.INSTRUCTOR_2]: 'f_foxtrot' } }))
    expect(canView(fa.user('f_delta'), fa.b('p_g2'))).toBe(true)
    const uro = world(applyStage(buildSeed(), 'p_g2', 'URO_VERIFICATION', { roles: { [P.ADVISER]: 'f_charlie', [P.PANEL_CHAIR]: 'f_alpha', [P.PANEL_MEMBER]: ['f_echo'], [P.INSTRUCTOR_2]: 'f_foxtrot' } }))
    expect(canView(uro.user('f_delta'), uro.b('p_g2'))).toBe(false)
  })

  it('T10 — Prof. Alpha can endorse the Approval Sheet but never give the final signature', () => {
    const w = scenario('T10')
    expect(w.can('f_alpha', 'ENDORSE_TO_URO', 'p_g3')).toBe(true)
    expect(w.can('f_alpha', 'FINAL_APPROVE', 'p_g3')).toBe(false)
    for (const stage of ['CLEARANCE', 'URO_VERIFICATION', 'FINAL_APPROVAL']) {
      const s = world(applyStage(buildSeed(), 'p_g3', stage, { roles: { [P.ADVISER]: 'f_delta', [P.INSTRUCTOR_2]: 'f_charlie', [P.PANEL_CHAIR]: 'f_foxtrot', [P.PANEL_MEMBER]: ['f_bravo'] } }))
      expect(s.can('f_alpha', 'FINAL_APPROVE', 'p_g3'), stage).toBe(false)
    }
  })

  it('T11 — Dean Delta cannot sign G3 before the URO clears it', () => {
    const w = scenario('T11')
    expect(w.can('f_delta', 'FINAL_APPROVE', 'p_g3')).toBe(false)
    expect(w.can('o_uniform', 'URO_VERIFY', 'p_g3')).toBe(true)
  })

  it('T12 — G3 is not in the URO queue before the PC endorses', () => {
    const w = scenario('T12')
    expect(canView(w.user('o_uniform'), w.b('p_g3'))).toBe(false)
    expect(w.can('o_uniform', 'URO_VERIFY', 'p_g3')).toBe(false)
  })

  it('T13 — a student sees no other group and holds no approve action', () => {
    const w = scenario('T13')
    expect(canView(w.user('s_kilo'), w.b('p_g1'))).toBe(true)
    for (const pid of ['p_g2', 'p_g3', 'p_g4']) expect(canView(w.user('s_kilo'), w.b(pid))).toBe(false)
    const topic = w.b('p_g1').documents.find(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL)
    expect(w.can('s_kilo', 'reviewDocument', 'p_g1', { doc: topic })).toBe(false)
    for (const stage of ['TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'IMPLEMENTATION', 'CLEARANCE']) {
      const acts = allowedActions('Student', stage)
      expect(acts.filter(a => /^[A-Z_]+$/.test(a) || ['reviewDocument', 'recordVerdict', 'signWeeklyLog'].includes(a)), stage).toEqual([])
    }
    // Re-upload is a new version, never an overwrite — covered in services.test.js.
  })

  it('T14 — a student with no group has no project data', () => {
    const w = scenario('T14')
    for (const p of w.snap.projects) expect(canView(w.user('s_whiskey'), w.b(p.id))).toBe(false)
  })

  it('T15 — a Panel Member sees only the latest manuscript version', () => {
    const w = scenario('T15')
    const all = w.b('p_g2').documents.filter(d => d.docType === DOC_TYPES.PROPOSAL_MANUSCRIPT)
    expect(all.length).toBe(2)
    const seen = viewBundle(w.user('f_echo'), w.b('p_g2')).documents.filter(d => d.docType === DOC_TYPES.PROPOSAL_MANUSCRIPT)
    expect(seen.map(d => d.versionNumber)).toEqual([2])
    expect(w.can('f_echo', 'viewDocumentHistory', 'p_g2')).toBe(false)
  })

  it('T16 — only the Program Chair changes the G1 panel; Charlie loses G1 when removed', () => {
    const w = scenario('T16')
    expect(canView(w.user('f_charlie'), w.b('p_g1'))).toBe(true)
    expect(w.can('f_alpha', 'assignPanel', 'p_g1')).toBe(true)
    expect(w.can('a_sierra', 'assignPanel', 'p_g1')).toBe(false)
    expect(w.can('f_bravo', 'assignPanel', 'p_g1')).toBe(false)
    const store = scenarioStore('T16')
    const row = Object.values(store.projectAssignments).find(a => a.projectId === 'p_g1' && a.userId === 'f_charlie' && a.roleType === P.PANEL_MEMBER)
    delete store.projectAssignments[row.id]
    const after = world(store)
    expect(canView(after.user('f_charlie'), after.b('p_g1'))).toBe(false)
    // Live removal + audit entry: services.test.js.
  })

  it('T17 — an already-approved log cannot be approved again', () => {
    const w = scenario('T17')
    const log = w.b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    expect(w.can('f_alpha', 'signWeeklyLog', 'p_g1', { log })).toBe(true)
    expect(w.why('f_alpha', 'signWeeklyLog', 'p_g1', { log: { ...log, status: 'Approved' } })).toMatch(/already Approved/)
    const doc = w.latest('p_g1', DOC_TYPES.REVISED_MANUSCRIPT)
    expect(doc.status).toBe(DOC_STATUS.APPROVED)
    expect(w.can('f_alpha', 'reviewDocument', 'p_g1', { doc })).toBe(false)
  })

  it('T18 — G3’s countdown is past due in the T18 setup', () => {
    const w = scenario('T18')
    const d = w.b('p_g3').defenses.find(x => x.type === 'Final')
    expect(d.revisionStatus).toBe('Pending')
    expect(new Date(d.revisionDeadline).getTime()).toBeLessThan(Date.now())
    // The overdue flag + notification is a system job: services.test.js.
  })

  it('T19 — the G1 Adviser cannot be put on G1’s panel (NEW-5, flag BLOCK_ADVISER_ON_PANEL)', async () => {
    const { assignmentConflict } = await import('../services/actions.js')
    const w = scenario('T19')
    expect(w.can('f_alpha', 'assignPanel', 'p_g1')).toBe(true) // the PC step itself is allowed …
    expect(assignmentConflict(w.b('p_g1'), 'f_alpha', P.PANEL_MEMBER)).toMatch(/cannot sit on its panel/) // … naming themself is not
    expect(assignmentConflict(w.b('p_g1'), 'f_charlie', P.PANEL_MEMBER)).toBeNull()
  })

  it('T20 — Admin Sierra can open a project record but not its manuscripts', () => {
    const w = scenario('T20')
    for (const p of w.snap.projects) {
      expect(canView(w.user('a_sierra'), w.b(p.id))).toBe(true)
      expect(w.can('a_sierra', 'readDocuments', p.id)).toBe(false)
      expect(viewBundle(w.user('a_sierra'), w.b(p.id)).documents).toEqual([])
      expect(w.can('a_sierra', 'viewAiSummary', p.id)).toBe(false)
    }
    const draft = { ...w.latest('p_g2', DOC_TYPES.PROPOSAL_MANUSCRIPT), status: DOC_STATUS.SUBMITTED }
    expect(w.can('a_sierra', 'annotate', 'p_g2', { doc: draft })).toBe(false)
    expect(w.can('a_sierra', 'recordVerdict', 'p_g2')).toBe(false)
    expect(w.can('a_sierra', 'assignAdviser', 'p_g4')).toBe(false)
  })

  it('T21 — every allowed action reports the role hat that granted it', () => {
    const w = scenario('T21')
    expect(canDo(w.user('f_alpha'), 'recordVerdict', w.b('p_g2')).hat).toBe(P.PANEL_CHAIR)
    expect(canDo(w.user('f_bravo'), 'ENDORSE_ROSTER', w.b('p_g4')).hat).toBe(P.INSTRUCTOR_1)
    // Audit entries with actor, hat and before → after: services.test.js.
  })
})

describe('R12 guard-only actions', () => {
  it('viewAiSummary follows AI_SUMMARY_AUDIENCE (Adviser + Panel)', () => {
    const w = world(buildSeed())
    expect(w.can('f_charlie', 'viewAiSummary', 'p_g2')).toBe(true) // Adviser
    expect(w.can('f_alpha', 'viewAiSummary', 'p_g2')).toBe(true) // Panel Chair
    expect(w.can('f_echo', 'viewAiSummary', 'p_g2')).toBe(true) // Panel Member
    expect(w.can('s_november', 'viewAiSummary', 'p_g2')).toBe(false) // Student
    expect(w.can('f_bravo', 'viewAiSummary', 'p_g2')).toBe(false) // Instructor 1
    expect(viewBundle(w.user('s_november'), w.b('p_g2')).aiSummaries).toEqual([])
  })

  it('viewAnnotations requires document access', () => {
    const w = world(buildSeed())
    expect(w.can('s_november', 'viewAnnotations', 'p_g2')).toBe(true)
    expect(w.can('a_sierra', 'viewAnnotations', 'p_g2')).toBe(false)
  })

  it('annotate is limited to open versions', () => {
    const w = world(buildSeed())
    const m1 = w.b('p_g2').documents.find(d => d.docType === DOC_TYPES.PROPOSAL_MANUSCRIPT && d.versionNumber === 1)
    expect(m1.status).toBe(DOC_STATUS.SUPERSEDED)
    expect(w.can('f_alpha', 'annotate', 'p_g2', { doc: m1 })).toBe(false)
  })
})

describe('Accounts', () => {
  it('only exact institutional domains register (S0.1)', () => {
    for (const ok of ['name@hau.edu.ph', 'name@student.hau.edu.ph', 'Name@HAU.edu.ph', '  name@student.hau.edu.ph ']) {
      expect(accountType(ok), ok).not.toBeNull()
    }
    for (const bad of ['name@gmail.com', 'name@hau.edu.ph.evil.com', 'name@evilhau.edu.ph', 'name@fake.student.hau.edu.ph', 'a b@hau.edu.ph', '@hau.edu.ph']) {
      expect(accountType(bad), bad).toBeNull()
    }
  })

  it('an inactive account holds no grant, whatever its roles', () => {
    const store = buildSeed()
    store.users.f_alpha = { ...store.users.f_alpha, status: 'Suspended' }
    const w = world(store)
    expect(canView(w.user('f_alpha'), w.b('p_g1'))).toBe(false)
    expect(w.can('f_alpha', 'recordVerdict', 'p_g2')).toBe(false)
    expect(canView(w.user('f_papa'), w.b('p_g1'))).toBe(false)
  })
})
