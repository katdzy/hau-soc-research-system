// Demo dataset — the CAAC test personas from WORKFLOWS.md §6. Every name is a
// placeholder. Groups sit at different stages so the §5 queues have data:
//
//   G1  Conceptualization     WD-401  I1 Bravo · Adviser Alpha            (early stage, 3 students)
//   G2  Proposal Defense      WD-401  I1 Bravo · Adviser Charlie · Panel Chair Alpha · Panel Member Echo
//   G3  Final Revision        CS-301 → CS-401  Adviser Delta (the Dean) · I2 Charlie · Panel Chair Foxtrot · Panel Member Bravo
//   G4  Group Formation       WD-401  I1 Bravo · no adviser yet
//   Whiskey — a WD-401 student with no group (T14)
//   + NPC accounts (npcs.js): G1–G4 topped up to four members, and NW, EMC, CYB
//     three groups each and CS two more, spread over the stages
//
// The term is AY 2026–2027, 1st Semester. WD's 4th years are in Capstone 1;
// G3 is a Computer Science group, which took Capstone 1 in CS-301 (3rd year,
// 2nd semester of AY 2025–2026) and is in Capstone 2 now as CS-401.
//
// §6 also lists Prof. Charlie as a Panel Member of G1. A panel only exists from
// Panel Assignment (S5.1), so the seed leaves G1 without one; the dev tools'
// "Load scenario T4 / T5 / T16" put G1 at a panel stage with Charlie on it.
//
// Reset from Dev tools → Reset seed. If you change this file or the store
// shape, bump the key in localAdapter.js.

import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES, DOC_STATUS, COURSES, programByCode, parseSection, yearLevelOf,
} from '../domain/constants.js'
import { applyStage, ALTERNATE_TOPICS } from './stageBuilder.js'
import {
  NPC_FACULTY, NPC_STUDENTS, NPC_SECTIONS, NPC_PROJECTS, NPC_MEMBERS, NPC_ROLES, NPC_STAGES,
} from './npcs.js'

const WD = programByCode('WD').name
const CS = programByCode('CS').name
const TERM = 'AY 2026–2027, 1st Semester'
const LAST_TERM = 'AY 2025–2026, 2nd Semester'
const days = (n) => new Date(Date.now() + n * 864e5).toISOString()
const keyBy = (rows) => Object.fromEntries(rows.map(r => [r.id, r]))

const user = (id, name, email, globalRoles, extra = {}) => ({
  id, name, email, globalRoles, programScope: [], status: 'Active', emailVerified: true, verifyToken: null,
  idNumber: '', program: '', yearLevel: '', block: '', createdAt: days(-200), ...extra,
})
const student = (id, name, email, idNumber, block) =>
  user(id, name, email, [G.STUDENT], { idNumber, program: parseSection(block).program, yearLevel: yearLevelOf(block), block })

// Faculty accounts carry the base `Faculty` identity (NEW-1, flag FACULTY_BASE_IDENTITY).
const F = G.FACULTY

const USERS = [
  // --- Faculty and offices (§6) ------------------------------------------------
  user('f_alpha', 'Prof. Alpha', 'alpha@hau.edu.ph', [F, G.COORDINATOR], { programScope: [WD, CS] }),
  user('f_bravo', 'Prof. Bravo', 'bravo@hau.edu.ph', [F]),
  user('f_charlie', 'Prof. Charlie', 'charlie@hau.edu.ph', [F]),
  user('f_delta', 'Dean Delta', 'delta@hau.edu.ph', [F, G.DEAN]),
  user('f_echo', 'AD Echo', 'echo@hau.edu.ph', [F, G.ASSOCIATE_DEAN]),
  user('o_uniform', 'URO Uniform', 'uniform@hau.edu.ph', [F, G.URO]),
  user('a_sierra', 'Admin Sierra', 'sierra@hau.edu.ph', [F, G.ADMIN]),
  // Not in §6: G3 needs a Panel Chair and §6 names none.
  user('f_foxtrot', 'Prof. Foxtrot', 'foxtrot@hau.edu.ph', [F]),
  // A registration that verified its email and waits for the System Administrator (S0.3).
  user('f_papa', 'Prof. Papa', 'papa@hau.edu.ph', [F], { status: 'Inactive', createdAt: days(-1) }),

  // --- Students ------------------------------------------------------------------
  student('s_kilo', 'Kilo Student', 'kilo@student.hau.edu.ph', '2022-0101', 'WD-401'),
  student('s_lima', 'Lima Student', 'lima@student.hau.edu.ph', '2022-0102', 'WD-401'),
  student('s_mike', 'Mike Student', 'mike@student.hau.edu.ph', '2022-0103', 'WD-401'),
  student('s_november', 'November Student', 'november@student.hau.edu.ph', '2022-0104', 'WD-401'),
  student('s_oscar', 'Oscar Student', 'oscar@student.hau.edu.ph', '2022-0105', 'WD-401'),
  student('s_quebec', 'Quebec Student', 'quebec@student.hau.edu.ph', '2021-0201', 'CS-401'),
  student('s_romeo', 'Romeo Student', 'romeo@student.hau.edu.ph', '2021-0202', 'CS-401'),
  student('s_tango', 'Tango Student', 'tango@student.hau.edu.ph', '2022-0106', 'WD-401'),
  student('s_victor', 'Victor Student', 'victor@student.hau.edu.ph', '2022-0107', 'WD-401'),
  student('s_whiskey', 'Whiskey Student', 'whiskey@student.hau.edu.ph', '2022-0108', 'WD-401'),

  // --- NPC accounts (npcs.js): three groups of four per program ----------------
  ...NPC_FACULTY,
  ...NPC_STUDENTS,
]

// WD-401 Capstone 1 — Prof. Bravo teaches it, which lets Bravo create its
// groups and makes Bravo Instructor 1 on each (G1, G2, G4).
const SECTIONS = [
  { id: 'sec_wd401', course: COURSES.C1, block: 'WD-401', program: WD, yearLevel: yearLevelOf('WD-401'), term: TERM, instructorId: 'f_bravo' },
  ...NPC_SECTIONS,
]

const project = (id, title, block, extra = {}) => ({
  id, title, previousTitles: [], category: 'Capstone', researchArea: extra.researchArea ?? 'Information Systems',
  program: parseSection(block).program, term: extra.term ?? TERM, block, sectionId: block === 'WD-401' ? 'sec_wd401' : null,
  currentStage: 'GROUP_FORMATION', status: 'Active', archiveResult: null,
  revisionClass: null, revisionDeadline: null, revisionStatus: null,
  milestonesConfirmedAt: null, milestonesConfirmedBy: null, milestones: {}, adviserApprovals: {},
  readinessConfirmedAt: null, readinessConfirmedBy: null, postDefenseConfirmedAt: null, postDefenseConfirmedBy: null, uroReturns: [],
  createdAt: days(-120), ...extra,
})

const PROJECTS = [
  project('p_g1', 'Untitled — Group 1 (WD-401)', 'WD-401', { researchArea: 'Not yet set' }),
  project('p_g2', 'Smart Queue Management System for University Clinics', 'WD-401'),
  // Capstone 1 section and term; sectionNow() gives CS-401, AY 2026–2027 1st Semester.
  project('p_g3', 'IoT-Based Laboratory Equipment Tracking for Computing Laboratories', 'CS-301', { researchArea: 'Internet of Things', term: LAST_TERM }),
  project('p_g4', 'Untitled — Group 4 (WD-401)', 'WD-401', { researchArea: 'Not yet set', createdAt: days(-2) }),
  ...NPC_PROJECTS.map(({ id, title, block, ...extra }) => project(id, title, block, extra)),
]

const member = (projectId, userId) => ({ id: `m_${projectId}_${userId}`, projectId, userId, joinedAt: days(-60) })

const MEMBERS = [
  ...['s_kilo', 's_lima', 's_mike'].map(u => member('p_g1', u)),
  ...['s_november', 's_oscar'].map(u => member('p_g2', u)),
  ...['s_quebec', 's_romeo'].map(u => member('p_g3', u)),
  ...['s_tango', 's_victor'].map(u => member('p_g4', u)),
  ...NPC_MEMBERS,
]

/** Base store: people, blocks, groups and members — no workflow history yet. */
export function baseStore() {
  return {
    users: keyBy(USERS),
    sections: keyBy(SECTIONS),
    projects: keyBy(PROJECTS),
    projectMembers: keyBy(MEMBERS),
    projectAssignments: {},
    documents: {}, annotations: {}, reviews: {}, aiSummaries: {}, weeklyLogs: {},
    defenses: {}, forms: {}, workflowHistory: {}, auditLogs: {}, outbox: {},
    permissionOverrides: {}, settings: {},
  }
}

// Who holds which project role in each group (§6).
export const SEED_ROLES = {
  p_g1: { [P.INSTRUCTOR_1]: 'f_bravo', [P.ADVISER]: 'f_alpha', [P.PANEL_CHAIR]: 'f_foxtrot', [P.PANEL_MEMBER]: ['f_charlie'], [P.INSTRUCTOR_2]: 'f_foxtrot' },
  p_g2: { [P.INSTRUCTOR_1]: 'f_bravo', [P.ADVISER]: 'f_charlie', [P.PANEL_CHAIR]: 'f_alpha', [P.PANEL_MEMBER]: ['f_echo'], [P.INSTRUCTOR_2]: 'f_foxtrot' },
  p_g3: { [P.INSTRUCTOR_1]: 'f_foxtrot', [P.ADVISER]: 'f_delta', [P.PANEL_CHAIR]: 'f_foxtrot', [P.PANEL_MEMBER]: ['f_bravo'], [P.INSTRUCTOR_2]: 'f_charlie' },
  p_g4: { [P.INSTRUCTOR_1]: 'f_bravo' },
  ...NPC_ROLES,
}

export const SEED_STAGES = {
  p_g1: 'TOPIC_PROPOSAL',
  p_g2: 'PROPOSAL_DEFENSE',
  p_g3: 'FINAL_REVISION',
  p_g4: 'GROUP_FORMATION',
  ...NPC_STAGES,
}

export function buildSeed() {
  let s = baseStore()
  for (const [projectId, stage] of Object.entries(SEED_STAGES)) {
    s = applyStage(s, projectId, stage, {
      roles: SEED_ROLES[projectId],
      // G2's panelist has a private pre-defense note (T4-style isolation on G2).
      privateNoteBy: projectId === 'p_g2' ? 'f_echo' : undefined,
      // G3's countdown is running with a few days left (T18 expires it).
      revisionDeadlineDays: projectId === 'p_g3' ? 3 : undefined,
    })
  }
  // G1 is early: its five proposed topics wait for Instructor 1 and the Adviser (S3.1).
  s.documents.d_g1_topic = {
    id: 'd_g1_topic', projectId: 'p_g1', docType: DOC_TYPES.TOPIC_PROPOSAL, versionNumber: 1,
    title: 'Five proposed topics', fileName: 'topic-proposal-v1.pdf', fileSize: 210000,
    link: null, topics: [...ALTERNATE_TOPICS, 'Thesis Adviser Consultation Scheduler'],
    abstract: '', submittedBy: 's_kilo', submittedAt: days(-1), status: DOC_STATUS.SUBMITTED,
    workflowStage: 'TOPIC_PROPOSAL', milestone: null, supersedes: null,
  }
  return s
}
