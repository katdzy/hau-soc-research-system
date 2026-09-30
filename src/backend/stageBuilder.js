// Puts one project at a given stage with plausible prerequisite data: every
// gate BEFORE the target stage is satisfied (approved topic, documents,
// assignments, schedule, verdict, signatures…), and the target stage's own
// work is left undone. Used by the seed and by the dev-only "Set stage" and
// "Load scenario T#" controls. Pure: takes a store ({ collection: { id: row } })
// and returns a new one. It bypasses the guard on purpose — it fabricates
// history, it does not act as anyone.

import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES, DOC_STATUS, DECISIONS, VERDICTS, FORMS,
  AI_DISCLOSURE, REVISION_WINDOW_DAYS, CAPSTONE2_MILESTONES,
} from '../domain/constants.js'
import { STAGES, stageIndex, ADVISER_APPROVERS } from '../domain/stages.js'
import { FLAGS } from '../domain/flags.js'

const DAY = 864e5
// Placeholder for a running countdown's deadline until the timeline is shifted.
const FINAL_DEADLINE = 'FINAL_DEADLINE'
const PROJECT_COLLECTIONS = ['documents', 'annotations', 'reviews', 'aiSummaries', 'weeklyLogs', 'defenses', 'forms', 'workflowHistory']

// The four topics a group proposes besides the one that gets approved.
export const ALTERNATE_TOPICS = [
  'Campus Lost-and-Found Tracker',
  'Room Reservation System for Student Organizations',
  'Library Seat Availability Monitor',
  'Alumni Tracer Survey Portal',
]

// Default faculty used when a role must exist and the caller named nobody.
export const DEFAULT_ROLE_HOLDERS = {
  [P.INSTRUCTOR_1]: 'f_bravo',
  [P.ADVISER]: 'f_charlie',
  [P.PANEL_CHAIR]: 'f_foxtrot',
  [P.PANEL_MEMBER]: ['f_bravo'],
  [P.INSTRUCTOR_2]: 'f_charlie',
}

/**
 * @param store      keyed store
 * @param projectId  project to move
 * @param target     stage key
 * @param opts       {
 *   roles:     { [roleType]: userId | userId[] } — who holds each project role
 *   preassign: roleType[] — assign these even though the target stage is where
 *              they would normally be assigned (e.g. the panel at PANEL_ASSIGNMENT)
 *   revisionDeadlineDays: deadline offset for a running countdown (default: the verdict's window)
 *   pendingLog: add a Submitted weekly log at IMPLEMENTATION
 *   approvalSheet: at CLEARANCE, how far the Approval Sheet is signed: 'issued' | 'panel-signed'
 *   certificates: at CLEARANCE, upload the Editor's and Plagiarism certificates
 *   privateNoteBy: userId of a panelist who leaves a private note on the defended manuscript
 * }
 */
export function applyStage(store, projectId, target, opts = {}) {
  const s = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, { ...v }]))
  const project = s.projects[projectId]
  if (!project) throw new Error(`Unknown project ${projectId}`)
  const idx = stageIndex(target)
  if (idx < 0) throw new Error(`Unknown stage ${target}`)

  // Start from a clean slate for this project's derived records.
  for (const col of PROJECT_COLLECTIONS) {
    s[col] = Object.fromEntries(Object.entries(s[col] ?? {}).filter(([, r]) => r.projectId !== projectId))
  }

  const past = (key) => idx > stageIndex(key) // gate of `key` already done
  const users = s.users
  const nameOf = (id) => users[id]?.name ?? null
  const roleOpts = { ...DEFAULT_ROLE_HOLDERS, ...(opts.roles ?? {}) }
  const preassign = new Set(opts.preassign ?? [])
  let seq = 0
  const id = (prefix) => `${prefix}_${projectId}_${++seq}`

  // A timeline that ends "now": each completed gate is a few days apart.
  const gatesDone = STAGES.slice(0, idx).length
  let clock = Date.now() - (gatesDone * 4 + 2) * DAY
  const tick = (days = 4) => { clock += days * DAY; return new Date(clock).toISOString() }
  const at = () => new Date(clock).toISOString()

  const add = (col, row) => { s[col][row.id] = row; return row }
  const history = (from, to, actorId, action) => add('workflowHistory', {
    id: id('h'), projectId, fromStage: from, toStage: to, actorId, action, hat: null,
    note: 'Set by the stage builder', at: tick(),
  })

  // --- Project roles -------------------------------------------------------
  const assignments = () => Object.values(s.projectAssignments).filter(a => a.projectId === projectId)
  const holders = (role) => assignments().filter(a => a.roleType === role).map(a => a.userId)
  const ensureRole = (role) => {
    const wanted = [roleOpts[role]].flat().filter(Boolean)
    const have = holders(role)
    const single = [P.ADVISER, P.PANEL_CHAIR, P.INSTRUCTOR_2, P.INSTRUCTOR_1].includes(role)
    const toAdd = single ? (have.length ? [] : wanted.slice(0, 1)) : wanted.filter(u => !have.includes(u))
    for (const userId of toAdd) {
      add('projectAssignments', {
        id: `a_${projectId}_${role.replace(/\W/g, '')}_${userId}`,
        projectId, userId, roleType: role, status: 'Accepted', assignedAt: at(),
      })
    }
  }
  const roleDue = (role, assignedAt) => past(assignedAt) || preassign.has(role)

  ensureRole(P.INSTRUCTOR_1)
  if (roleDue(P.ADVISER, 'ADVISER_ASSIGNMENT')) ensureRole(P.ADVISER)
  if (roleDue(P.PANEL_CHAIR, 'PANEL_ASSIGNMENT')) ensureRole(P.PANEL_CHAIR)
  if (roleDue(P.PANEL_MEMBER, 'PANEL_ASSIGNMENT')) ensureRole(P.PANEL_MEMBER)
  if (roleDue(P.INSTRUCTOR_2, 'PROPOSAL_REVISION')) ensureRole(P.INSTRUCTOR_2)

  const i1 = holders(P.INSTRUCTOR_1)[0]
  const adviser = holders(P.ADVISER)[0]
  const chair = holders(P.PANEL_CHAIR)[0]
  const panelMembers = holders(P.PANEL_MEMBER)
  const i2 = holders(P.INSTRUCTOR_2)[0]
  const members = Object.values(s.projectMembers).filter(m => m.projectId === projectId).map(m => m.userId)
  const student = members[0] ?? null
  const holderOf = (role) => Object.values(users).find(u => (u.globalRoles ?? []).includes(role))?.id ?? null
  const coordinator = Object.values(users).find(u =>
    (u.globalRoles ?? []).includes(G.COORDINATOR) && (u.programScope ?? []).includes(project.program))?.id ?? null
  const uro = holderOf(G.URO)
  const dean = holderOf(G.DEAN)
  const ad = holderOf(G.ASSOCIATE_DEAN)

  // --- Documents -------------------------------------------------------------
  const versions = {}
  const doc = (docType, status, extra = {}) => {
    const prev = Object.values(s.documents)
      .filter(d => d.projectId === projectId && d.docType === docType)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0]
    if (prev && prev.status !== DOC_STATUS.ARCHIVED) s.documents[prev.id] = { ...prev, status: DOC_STATUS.SUPERSEDED }
    versions[docType] = (versions[docType] ?? 0) + 1
    const v = versions[docType]
    return add('documents', {
      id: id('d'), projectId, docType, versionNumber: v,
      title: extra.title ?? `${docType} v${v}`,
      fileName: `${docType.toLowerCase().replace(/\W+/g, '-')}-v${v}.pdf`, fileSize: 480000 + v * 20000,
      link: null, topics: extra.topics ?? null, abstract: extra.abstract ?? '', submittedBy: student, submittedAt: tick(1),
      status, workflowStage: extra.stage ?? null, milestone: extra.milestone ?? null,
      supersedes: prev?.id ?? null,
    })
  }
  const review = (d, reviewerId, reviewerRole, decision, comment = '', extra = {}) => add('reviews', {
    id: id('r'), projectId, documentId: d.id, reviewerId, reviewerRole, decision, comment, createdAt: at(), ...extra,
  })

  const sig = (order, role, userId, signed, viaGate = false) =>
    ({ order, role, userId, name: signed ? nameOf(userId) : null, signedAt: signed ? at() : null, viaGate })

  const f2004 = (type, signedAll, defenseId) => add('forms', {
    id: id('form2004'), projectId, formType: FORMS.F2004.code, name: FORMS.F2004.name,
    status: signedAll ? 'Signed' : 'Circulating', createdAt: at(),
    stage: type === 'Proposal' ? 'PROPOSAL_REVISION' : 'FINAL_REVISION',
    payload: { verdict: VERDICTS.MINOR, revisionClass: 'Minor', remarks: 'Tighten the scope statement.', defenseType: type, defenseId },
    signatories: [
      sig(1, P.PANEL_CHAIR, chair, true),
      ...(adviser ? [sig(2, P.ADVISER, adviser, signedAll)] : []),
      ...panelMembers.map(u => sig(3, P.PANEL_MEMBER, u, signedAll)),
    ],
  })

  const defense = (type, extra = {}) => add('defenses', {
    id: id('def'), projectId, type, scheduledAt: tick(1), venue: 'SOC Conference Room, 3rd Floor',
    instructions: '', createdBy: type === 'Proposal' ? coordinator : i2, createdAt: at(),
    verdict: null, revisionClass: null, revisionDeadline: null, revisionStatus: null,
    recordedBy: null, recordedAt: null, remarks: '', ...extra,
  })

  const patch = {
    currentStage: target, status: target === 'ARCHIVED' ? 'Archived' : 'Active',
    archiveResult: null, archivedAt: null, revisionClass: null, revisionDeadline: null, revisionStatus: null,
    milestonesConfirmedAt: null, milestonesConfirmedBy: null, milestones: {}, adviserApprovals: {}, adviserOffices: [],
    readinessConfirmedAt: null, readinessConfirmedBy: null, postDefenseConfirmedAt: null, postDefenseConfirmedBy: null, uroReturns: [],
    topicRegisteredAt: null, topicRegisteredBy: null,
  }

  // --- Walk the stage machine up to the target -------------------------------
  add('workflowHistory', {
    id: id('h'), projectId, fromStage: null, toStage: 'GROUP_FORMATION', actorId: i1,
    action: 'GROUP_CREATED', hat: P.INSTRUCTOR_1, note: 'Group created', at: at(),
  })

  if (past('GROUP_FORMATION')) history('GROUP_FORMATION', 'ADVISER_ASSIGNMENT', i1, 'ENDORSE_ROSTER')
  if (past('ADVISER_ASSIGNMENT')) {
    // NEW-5: an office named as the Adviser sits the approval out.
    patch.adviserOffices = ADVISER_APPROVERS.filter(r => (users[adviser]?.globalRoles ?? []).includes(r))
    history('ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', coordinator, 'ROUTE_ADVISER')
  }
  if (past('ADVISER_APPROVAL')) {
    for (const office of ADVISER_APPROVERS.filter(r => !patch.adviserOffices.includes(r))) {
      const who = office === G.DEAN ? dean : ad
      patch.adviserApprovals[office] = { userId: who, at: tick(1) }
    }
    history('ADVISER_APPROVAL', 'TOPIC_PROPOSAL', ad, 'APPROVE_ADVISER')
  }

  if (past('TOPIC_PROPOSAL')) {
    const title = project.title.startsWith('Untitled') ? (opts.title ?? `Registered topic for ${project.block}`) : project.title
    // S3.1 — five topics in one version; S3.3 — Instructor 1 approves one.
    const topics = [title, ...ALTERNATE_TOPICS]
    const topic = doc(DOC_TYPES.TOPIC_PROPOSAL, DOC_STATUS.APPROVED, { title: 'Five proposed topics', topics })
    review(topic, i1, P.INSTRUCTOR_1, DECISIONS.APPROVE, 'Approved; register it as the title.', { approvedTopic: title })
    // S3.4 — registered before the concept paper; S3.6 — its approval moves the stage.
    patch.title = title
    patch.previousTitles = project.title === title ? (project.previousTitles ?? []) : [...(project.previousTitles ?? []), project.title]
    patch.topicRegisteredAt = tick(1)
    patch.topicRegisteredBy = i1
    const cp = doc(DOC_TYPES.CONCEPT_PAPER, DOC_STATUS.APPROVED)
    review(cp, i1, P.INSTRUCTOR_1, DECISIONS.APPROVE)
    history('TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', i1, 'APPROVE_CONCEPT_PAPER')
  }

  let defended = null
  if (past('PROPOSAL_DEVELOPMENT')) {
    const m1 = doc(DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_STATUS.FOR_REVISION)
    review(m1, adviser, P.ADVISER, DECISIONS.MAJOR, 'Objective 3 is not measurable yet.')
    defended = doc(DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_STATUS.APPROVED)
    review(defended, adviser, P.ADVISER, DECISIONS.APPROVE, 'Ready for the proposal defense.')
    history('PROPOSAL_DEVELOPMENT', 'PANEL_ASSIGNMENT', i1, 'APPROVE_FOR_DEFENSE')
  }
  if (past('PANEL_ASSIGNMENT')) history('PANEL_ASSIGNMENT', 'PROPOSAL_DEFENSE_SCHEDULING', coordinator, 'CONFIRM_PANEL')

  let proposalDefense = null
  if (past('PROPOSAL_DEFENSE_SCHEDULING')) {
    proposalDefense = defense('Proposal', { scheduledAt: new Date(clock + 2 * DAY).toISOString() })
    s.documents[defended.id] = { ...s.documents[defended.id], milestone: 'Proposal Defense' }
    aiSummary(defended, 'Proposal Defense')
    history('PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', coordinator, 'SCHEDULE_PROPOSAL_DEFENSE')
  }
  if (target === 'PROPOSAL_DEFENSE' && opts.privateNoteBy && defended) privateNote(defended, opts.privateNoteBy)

  if (past('PROPOSAL_DEFENSE')) {
    // A countdown still running is set against the real now (below), like the final one.
    const deadline = target === 'PROPOSAL_REVISION'
      ? FINAL_DEADLINE : new Date(clock + REVISION_WINDOW_DAYS.Minor * DAY).toISOString()
    s.defenses[proposalDefense.id] = {
      ...proposalDefense, verdict: VERDICTS.MINOR, revisionClass: 'Minor', revisionDeadline: deadline,
      revisionStatus: 'Pending', recordedBy: chair, recordedAt: tick(), remarks: 'Tighten the scope statement.',
    }
    f2004('Proposal', past('PROPOSAL_REVISION'), proposalDefense.id)
    patch.revisionClass = 'Minor'
    patch.revisionDeadline = deadline
    history('PROPOSAL_DEFENSE', 'PROPOSAL_REVISION', chair, 'RECORD_PROPOSAL_VERDICT')
  }

  if (past('PROPOSAL_REVISION')) {
    const rev = doc(DOC_TYPES.REVISED_MANUSCRIPT, DOC_STATUS.APPROVED)
    review(rev, adviser, P.ADVISER, DECISIONS.APPROVE, 'Revisions verified.')
    s.defenses[proposalDefense.id] = { ...s.defenses[proposalDefense.id], revisionStatus: 'Completed' }
    patch.revisionClass = null
    patch.revisionDeadline = null
    history('PROPOSAL_REVISION', 'IMPLEMENTATION', i1, 'CLOSE_PROPOSAL_REVISION')
  }

  let finalManuscript = null
  if (past('IMPLEMENTATION') || target === 'IMPLEMENTATION') {
    const logs = past('IMPLEMENTATION') ? 2 : 1
    for (let w = 1; w <= logs; w++) {
      add('weeklyLogs', {
        id: id('w'), projectId, weekNo: w, periodStart: at(), periodEnd: tick(2),
        submittedBy: student, submittedAt: at(), activities: `Week ${w}: implemented and tested module ${w}.`,
        status: 'Approved', signedBy: adviser, signedAt: at(), adviserRemarks: 'Signed.',
      })
    }
    if (target === 'IMPLEMENTATION' && opts.pendingLog) {
      add('weeklyLogs', {
        id: id('w'), projectId, weekNo: logs + 1, periodStart: at(), periodEnd: tick(2),
        submittedBy: student, submittedAt: at(), activities: `Week ${logs + 1}: integration testing.`,
        status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
      })
    }
  }
  if (past('IMPLEMENTATION')) {
    finalManuscript = doc(DOC_TYPES.FINAL_MANUSCRIPT, DOC_STATUS.SUBMITTED)
    // S6.5 both milestones, then the S6.7 readiness check (NEW-43).
    patch.milestones = Object.fromEntries(CAPSTONE2_MILESTONES.map(m => [m.key, { at: tick(1), by: i2, note: '' }]))
    patch.milestonesConfirmedAt = at()
    patch.milestonesConfirmedBy = i2
    if (FLAGS.I2_READINESS_CHECK === 'own-step') {
      patch.readinessConfirmedAt = tick(1)
      patch.readinessConfirmedBy = i2
    }
    add('forms', {
      id: id('form2005'), projectId, formType: FORMS.F2005.code, name: FORMS.F2005.name,
      status: 'Signed', createdAt: at(), stage: null, payload: {},
      signatories: [sig(1, P.ADVISER, adviser, true)],
    })
    history('IMPLEMENTATION', 'FINAL_DEFENSE_ENDORSEMENT', adviser, 'RECOMMEND_FINAL_DEFENSE')
  }
  if (past('FINAL_DEFENSE_ENDORSEMENT')) history('FINAL_DEFENSE_ENDORSEMENT', 'FINAL_DEFENSE_SCHEDULING', coordinator, 'ENDORSE_FINAL_DEFENSE')

  let finalDefense = null
  if (past('FINAL_DEFENSE_SCHEDULING')) {
    finalDefense = defense('Final', { scheduledAt: new Date(clock + 2 * DAY).toISOString() })
    s.documents[finalManuscript.id] = { ...s.documents[finalManuscript.id], milestone: 'Final Defense' }
    aiSummary(finalManuscript, 'Final Defense')
    history('FINAL_DEFENSE_SCHEDULING', 'FINAL_DEFENSE', i2, 'SCHEDULE_FINAL_DEFENSE')
  }
  if (target === 'FINAL_DEFENSE' && opts.privateNoteBy && finalManuscript) privateNote(finalManuscript, opts.privateNoteBy)

  if (past('FINAL_DEFENSE')) {
    tick()
    // Set relative to the real "now" after the timeline is shifted (below).
    const deadline = FINAL_DEADLINE
    s.defenses[finalDefense.id] = {
      ...finalDefense, verdict: VERDICTS.MINOR, revisionClass: 'Minor', revisionDeadline: deadline,
      revisionStatus: 'Pending', recordedBy: chair, recordedAt: at(), remarks: 'Add the confusion matrix to the Results.',
    }
    f2004('Final', past('FINAL_REVISION'), finalDefense.id)
    patch.revisionClass = 'Minor'
    patch.revisionDeadline = deadline
    history('FINAL_DEFENSE', 'FINAL_REVISION', chair, 'RECORD_FINAL_VERDICT')
  }

  let sheet = null
  if (past('FINAL_REVISION')) {
    const rev = doc(DOC_TYPES.REVISED_MANUSCRIPT, DOC_STATUS.APPROVED)
    review(rev, adviser, P.ADVISER, DECISIONS.APPROVE, 'Post-defense revisions verified.')
    s.defenses[finalDefense.id] = { ...s.defenses[finalDefense.id], revisionStatus: 'Completed' }
    patch.revisionClass = null
    patch.revisionDeadline = null
    const signedThrough = past('CLEARANCE') ? 3 : opts.approvalSheet === 'panel-signed' ? 2 : 0
    sheet = add('forms', {
      id: id('formApproval'), projectId, formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
      status: 'Circulating', createdAt: at(), stage: 'CLEARANCE', payload: {},
      signatories: [
        sig(1, P.ADVISER, adviser, signedThrough >= 1),
        sig(2, P.PANEL_CHAIR, chair, signedThrough >= 2),
        ...panelMembers.map(u => sig(2, P.PANEL_MEMBER, u, signedThrough >= 2)),
        sig(3, G.COORDINATOR, coordinator, signedThrough >= 3, true),
        ...(FLAGS.URO_SIGNS_APPROVAL_SHEET ? [sig(4, G.URO, uro, past('URO_VERIFICATION'), true)] : []),
        sig(5, G.DEAN, dean, past('FINAL_APPROVAL'), true),
        sig(5, G.ASSOCIATE_DEAN, ad, past('FINAL_APPROVAL'), true),
      ],
    })
    history('FINAL_REVISION', 'CLEARANCE', panelMembers.at(-1) ?? chair, 'COMPLETE_FINAL_REVISION')
  }

  if (past('CLEARANCE') || (target === 'CLEARANCE' && opts.certificates)) {
    doc(DOC_TYPES.EDITORS_CERTIFICATE, DOC_STATUS.SUBMITTED)
    doc(DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_STATUS.SUBMITTED)
  }
  if (past('CLEARANCE')) {
    s.documents[finalManuscript.id] = { ...s.documents[finalManuscript.id], status: DOC_STATUS.APPROVED }
    // S8.5 (NEW-44) — recorded while the post-defense window was open.
    patch.postDefenseConfirmedAt = tick(1)
    patch.postDefenseConfirmedBy = i2
    history('CLEARANCE', 'URO_VERIFICATION', coordinator, 'ENDORSE_TO_URO')
  }
  if (past('URO_VERIFICATION')) history('URO_VERIFICATION', 'FINAL_APPROVAL', uro, 'URO_VERIFY')
  if (past('FINAL_APPROVAL')) {
    s.forms[sheet.id] = { ...s.forms[sheet.id], status: 'Signed' }
    for (const d of Object.values(s.documents).filter(x => x.projectId === projectId && x.status !== DOC_STATUS.SUPERSEDED)) {
      s.documents[d.id] = { ...d, status: DOC_STATUS.ARCHIVED }
    }
    patch.archiveResult = 'Pass'
    patch.archivedAt = at()
    history('FINAL_APPROVAL', 'ARCHIVED', ad, 'FINAL_APPROVE')
  }

  s.projects[projectId] = { ...project, ...patch }

  // The clock above advances by fixed steps and can overshoot today. Shift the
  // whole generated timeline so it ends an hour ago; a running countdown is
  // then set against the real now.
  const shift = clock - (Date.now() - 3600e3)
  const move = (v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && v !== FINAL_DEADLINE
    ? new Date(new Date(v).getTime() - shift).toISOString() : v)
  const moveRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => {
    if (k === 'signatories') return [k, v.map(x => ({ ...x, signedAt: move(x.signedAt) }))]
    if (k === 'adviserApprovals') return [k, Object.fromEntries(Object.entries(v ?? {}).map(([o, a]) => [o, { ...a, at: move(a.at) }]))]
    if (k === 'milestones') return [k, Object.fromEntries(Object.entries(v ?? {}).map(([m, c]) => [m, c && { ...c, at: move(c.at) }]))]
    return [k, move(v)]
  }))
  for (const col of [...PROJECT_COLLECTIONS, 'projectAssignments']) {
    for (const [rid, row] of Object.entries(s[col])) {
      if (row.projectId === projectId && !(col === 'projectAssignments' && store.projectAssignments?.[rid])) s[col][rid] = moveRow(row)
    }
  }
  const { createdAt, ...rest } = s.projects[projectId]
  s.projects[projectId] = { ...moveRow(rest), createdAt }
  const finalDays = opts.revisionDeadlineDays ?? REVISION_WINDOW_DAYS.Minor
  const finalDeadline = new Date(Date.now() + finalDays * DAY).toISOString()
  for (const [rid, row] of Object.entries(s.defenses)) {
    if (row.projectId === projectId && row.revisionDeadline === FINAL_DEADLINE) s.defenses[rid] = { ...row, revisionDeadline: finalDeadline }
  }
  if (s.projects[projectId].revisionDeadline === FINAL_DEADLINE) {
    s.projects[projectId] = { ...s.projects[projectId], revisionDeadline: finalDeadline }
  }
  return s

  // --- helpers that need the closure ----------------------------------------
  function aiSummary(d, milestone) {
    add('aiSummaries', {
      id: id('ai'), projectId, documentId: d.id, documentVersion: d.versionNumber, milestone,
      generatedAt: at(), model: 'Gemini Flash (paid tier) — stubbed in the prototype', label: AI_DISCLOSURE,
      structured: {
        background: 'Stub output.', problemStatement: 'Stub output.', objectives: 'Stub output.',
        methodology: 'Stub output.', expectedOutput: 'Stub output.', scope: 'Stub output.',
        limitations: 'Stub output.', contributions: 'Stub output.',
      },
    })
  }
  function privateNote(d, authorId) {
    const role = holders(P.PANEL_CHAIR).includes(authorId) ? P.PANEL_CHAIR : P.PANEL_MEMBER
    add('annotations', {
      id: id('an'), projectId, documentId: d.id, authorId, authorRole: role,
      anchor: 'p. 14, Sampling', category: 'Methodology Concern', visibility: 'private', releasedAt: null,
      text: 'Ask why purposive sampling was chosen over stratified random sampling.', createdAt: at(),
    })
  }
}
