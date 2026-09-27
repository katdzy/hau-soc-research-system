// Demo dataset. Six projects parked at different points in the life cycle so
// any segment of the workflow can be exercised without replaying the whole
// thing. Reset from Administration → Reset demo data.
//
// NOTE: Espinosa (Instructor 1), Almocera (Program Coordinator, IT) and Tayag
// (Dean, and the team's Adviser) appear with the roles recorded in the project
// documentation. Every other name is invented filler — swap them in this file
// before any demo outside the team.

import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES, DOC_STATUS, DECISIONS, VERDICTS, FORMS, AI_DISCLOSURE,
} from '../domain/constants.js'

const WD = 'BSIT — Web Development'
const NA = 'BSIT — Network Administration'
const TERM = 'AY 2026–2027, 1st Semester'
const days = (n) => new Date(Date.now() + n * 864e5).toISOString()
const keyBy = (rows) => Object.fromEntries(rows.map(r => [r.id, r]))

const user = (id, name, email, globalRoles, extra = {}) => ({
  id, name, email, globalRoles, programScope: [], status: 'Active', emailVerified: true,
  idNumber: '', program: '', yearLevel: '', block: '', createdAt: days(-200), ...extra,
})
const student = (id, name, email, idNumber, program, block) =>
  user(id, name, email, [G.STUDENT], { idNumber, program, yearLevel: '4th Year', block })

const USERS = [
  // --- Students -------------------------------------------------------------
  student('u_adrian', 'Adrian D. Curley', 'adcurley@student.hau.edu.ph', '2022-0114', WD, 'WD-4A'),
  student('u_cedric', 'Cedric Luis R. Dungca', 'clrdungca@student.hau.edu.ph', '2022-0118', WD, 'WD-4A'),
  student('u_karl', 'Karl Andrei T. Dungca', 'katdungca@student.hau.edu.ph', '2022-0119', WD, 'WD-4A'),
  student('u_sofia', 'Sofia Anne T. Sarmiento', 'satsarmiento@student.hau.edu.ph', '2022-0147', WD, 'WD-4A'),
  student('u_ivan', 'Ivan R. Manansala', 'irmanansala@student.hau.edu.ph', '2022-0151', WD, 'WD-4A'),
  student('u_jas', 'Jasmine T. Cruz', 'jtcruz@student.hau.edu.ph', '2022-0156', WD, 'WD-4A'),
  student('u_luis', 'Luis M. Salas', 'lmsalas@student.hau.edu.ph', '2022-0160', WD, 'WD-4A'),
  student('u_mika', 'Mika A. Yambao', 'mayambao@student.hau.edu.ph', '2022-0163', WD, 'WD-4A'),
  student('u_ana', 'Ana Marie L. Bituin', 'amlbituin@student.hau.edu.ph', '2022-0203', WD, 'WD-4B'),
  student('u_ben', 'Benjamin C. Ocampo', 'bcocampo@student.hau.edu.ph', '2022-0211', WD, 'WD-4B'),
  student('u_carmen', 'Carmen S. Vidal', 'csvidal@student.hau.edu.ph', '2022-0222', WD, 'WD-4B'),
  student('u_dina', 'Dina R. Manalili', 'drmanalili@student.hau.edu.ph', '2021-0305', NA, 'NA-4A'),
  student('u_elmo', 'Elmo P. Garcia', 'epgarcia@student.hau.edu.ph', '2021-0309', NA, 'NA-4A'),
  student('u_faye', 'Faye D. Lumanog', 'fdlumanog@student.hau.edu.ph', '2021-0402', WD, 'WD-4C'),
  student('u_gil', 'Gilbert M. Tolentino', 'gmtolentino@student.hau.edu.ph', '2021-0417', WD, 'WD-4C'),
  student('u_hana', 'Hana Beatriz S. Roque', 'hbsroque@student.hau.edu.ph', '2020-0433', WD, 'WD-4D'),

  // --- Faculty and offices ------------------------------------------------------
  // Faculty with no Global Role: every permission they have is project-based.
  user('f_espinosa', 'Asst. Prof. Kevin Aldrin G. Espinosa, MIT', 'kagespinosa@hau.edu.ph', []),
  user('f_lazaro', 'Mr. Joseph T. Lazaro', 'jtlazaro@hau.edu.ph', []),
  user('f_bondoc', 'Engr. Marites C. Bondoc', 'mcbondoc@hau.edu.ph', []),
  user('f_pineda', 'Mr. Ronnie S. Pineda', 'rspineda@hau.edu.ph', []),
  user('f_santos', 'Dr. Helen V. Santos', 'hvsantos@hau.edu.ph', []),
  user('f_dizon', 'Mr. Jomar R. Dizon', 'jrdizon@hau.edu.ph', []),
  user('f_uy', 'Ms. Patricia L. Uy', 'pluy@hau.edu.ph', []),
  // Faculty who also hold an office.
  user('f_almocera', 'Mr. Chris Almocera', 'calmocera@hau.edu.ph', [G.COORDINATOR], { programScope: [WD, NA] }),
  user('f_rivera', 'Dr. Angela P. Rivera', 'aprivera@hau.edu.ph', [G.ASSOCIATE_DEAN]),
  user('f_tayag', 'Dr. Marlon I. Tayag', 'mitayag@hau.edu.ph', [G.DEAN]),
  user('f_castro', 'Ms. Evelyn R. Castro', 'ercastro@hau.edu.ph', [G.URO]),
  user('a_admin', 'Ma. Cristina V. Reyes (ICT Services)', 'mcvreyes@hau.edu.ph', [G.ADMIN]),
]

// Capstone 1 blocks and who teaches them. Teaching a block is what lets an
// instructor create groups; they become Instructor 1 on each group they create.
const SECTIONS = [
  { id: 'sec_wd4a', course: 'Capstone 1', block: 'WD-4A', program: WD, term: TERM, instructorId: 'f_espinosa' },
  { id: 'sec_wd4b', course: 'Capstone 1', block: 'WD-4B', program: WD, term: TERM, instructorId: 'f_espinosa' },
]

const project = (id, title, stage, extra = {}) => ({
  id, title, previousTitles: [], category: 'Capstone', researchArea: extra.researchArea ?? 'Information Systems',
  program: WD, term: TERM, block: 'WD-4A', sectionId: null,
  currentStage: stage, status: 'Active', archiveResult: null,
  revisionClass: null, revisionDeadline: null, milestonesConfirmedAt: null, milestonesConfirmedBy: null,
  createdAt: days(-90), ...extra,
})

const PROJECTS = [
  project('p_alpha', 'Untitled — Group 5 (WD-4A)', 'GROUP_FORMATION', { sectionId: 'sec_wd4a', createdAt: days(-3), researchArea: 'Not yet set' }),
  project('p_zeta', 'Untitled — Group 2 (WD-4A)', 'ADVISER_APPROVAL', { sectionId: 'sec_wd4a', createdAt: days(-9), researchArea: 'Not yet set' }),
  project('p_beta', 'Smart Queue Management System for University Clinics', 'PROPOSAL_DEFENSE', { sectionId: 'sec_wd4b', block: 'WD-4B' }),
  project('p_gamma', 'IoT-Based Laboratory Equipment Tracking for Computing Laboratories', 'IMPLEMENTATION', {
    program: NA, block: 'NA-4A', researchArea: 'Internet of Things', createdAt: days(-150),
  }),
  project('p_delta', 'Automated Student Feedback Sentiment Analysis for Program Assessment', 'URO_VERIFICATION', {
    block: 'WD-4C', researchArea: 'Data Science', createdAt: days(-200),
    milestonesConfirmedAt: days(-40), milestonesConfirmedBy: 'f_lazaro',
  }),
  project('p_epsilon', 'Barangay Health Records Digitisation Platform', 'ARCHIVED', {
    block: 'WD-4D', researchArea: 'Health Informatics', term: 'AY 2025–2026, 2nd Semester', createdAt: days(-400),
    archiveResult: 'Pass', status: 'Archived', archivedAt: days(-40),
  }),
]

const member = (projectId, userId) => ({ id: `m_${projectId}_${userId}`, projectId, userId, joinedAt: days(-60) })

const MEMBERS = [
  ...['u_adrian', 'u_cedric', 'u_karl', 'u_sofia'].map(u => member('p_alpha', u)),
  ...['u_ivan', 'u_jas'].map(u => member('p_zeta', u)),
  ...['u_ana', 'u_ben', 'u_carmen'].map(u => member('p_beta', u)),
  ...['u_dina', 'u_elmo'].map(u => member('p_gamma', u)),
  ...['u_faye', 'u_gil'].map(u => member('p_delta', u)),
  member('p_epsilon', 'u_hana'),
]

const assign = (projectId, userId, roleType) => ({
  id: `a_${projectId}_${roleType.replace(/\W/g, '')}_${userId}`,
  projectId, userId, roleType, status: 'Accepted', assignedAt: days(-55),
})

// CAAC demonstrations built into this table:
//   f_tayag    — Dean institution-wide AND Adviser on p_zeta, so he cannot
//                approve his own adviser assignment there.
//   f_almocera — Program Coordinator for the IT programs AND Adviser on p_gamma.
//   f_bondoc   — Adviser on p_delta AND Panel Member on p_beta: full version
//                history on one, latest version only on the other.
//   f_santos   — Panel Chair on three projects; can record a verdict only on
//                the one that is at its defense.
//   f_espinosa — Instructor 1 on p_gamma, whose access ended when the project
//                moved to Capstone 2.
const ASSIGNMENTS = [
  assign('p_alpha', 'f_espinosa', P.INSTRUCTOR_1),

  assign('p_zeta', 'f_espinosa', P.INSTRUCTOR_1),
  assign('p_zeta', 'f_tayag', P.ADVISER),

  assign('p_beta', 'f_espinosa', P.INSTRUCTOR_1),
  assign('p_beta', 'f_pineda', P.ADVISER),
  assign('p_beta', 'f_santos', P.PANEL_CHAIR),
  assign('p_beta', 'f_bondoc', P.PANEL_MEMBER),
  assign('p_beta', 'f_dizon', P.PANEL_MEMBER),

  assign('p_gamma', 'f_espinosa', P.INSTRUCTOR_1),
  assign('p_gamma', 'f_lazaro', P.INSTRUCTOR_2),
  assign('p_gamma', 'f_almocera', P.ADVISER),
  assign('p_gamma', 'f_santos', P.PANEL_CHAIR),
  assign('p_gamma', 'f_uy', P.PANEL_MEMBER),

  assign('p_delta', 'f_lazaro', P.INSTRUCTOR_2),
  assign('p_delta', 'f_bondoc', P.ADVISER),
  assign('p_delta', 'f_santos', P.PANEL_CHAIR),
  assign('p_delta', 'f_dizon', P.PANEL_MEMBER),
  assign('p_delta', 'f_uy', P.PANEL_MEMBER),

  assign('p_epsilon', 'f_pineda', P.ADVISER),
  assign('p_epsilon', 'f_santos', P.PANEL_CHAIR),
  assign('p_epsilon', 'f_uy', P.PANEL_MEMBER),
]

const doc = (id, projectId, docType, version, extra = {}) => ({
  id, projectId, docType, versionNumber: version,
  title: extra.title ?? `${docType} v${version}`,
  fileName: extra.fileName ?? `${docType.toLowerCase().replace(/\W+/g, '-')}-v${version}.pdf`,
  fileSize: extra.fileSize ?? 480000 + version * 20000,
  link: null, abstract: '',
  submittedAt: days(-30), status: DOC_STATUS.SUBMITTED, milestone: null, supersedes: null,
  ...extra,
})

const BETA_ABSTRACT =
  'The study develops a queue management system for the university clinic that issues ' +
  'digital priority numbers, estimates waiting times from historical service data, and ' +
  'notifies students when their turn approaches, replacing the current paper logbook.'

const DOCUMENTS = [
  // p_beta — at its proposal defense
  doc('d_beta_topic', 'p_beta', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: Smart Queue Management System', submittedBy: 'u_ana',
    submittedAt: days(-72), status: DOC_STATUS.APPROVED,
  }),
  doc('d_beta_cp', 'p_beta', DOC_TYPES.CONCEPT_PAPER, 1, {
    submittedBy: 'u_ben', submittedAt: days(-70), status: DOC_STATUS.APPROVED,
  }),
  doc('d_beta_m1', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_ana', submittedAt: days(-40), status: DOC_STATUS.SUPERSEDED, abstract: BETA_ABSTRACT,
  }),
  doc('d_beta_m2', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 2, {
    submittedBy: 'u_ana', submittedAt: days(-18), status: DOC_STATUS.APPROVED,
    supersedes: 'd_beta_m1', milestone: 'Proposal Defense', abstract: BETA_ABSTRACT,
  }),

  // p_gamma — implementation
  doc('d_gamma_topic', 'p_gamma', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: IoT-Based Laboratory Equipment Tracking', submittedBy: 'u_dina',
    submittedAt: days(-130), status: DOC_STATUS.APPROVED,
  }),
  doc('d_gamma_m1', 'p_gamma', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_dina', submittedAt: days(-95), status: DOC_STATUS.APPROVED, milestone: 'Proposal Defense',
  }),
  doc('d_gamma_rev', 'p_gamma', DOC_TYPES.REVISED_MANUSCRIPT, 1, {
    submittedBy: 'u_dina', submittedAt: days(-76), status: DOC_STATUS.APPROVED,
  }),
  doc('d_gamma_f1', 'p_gamma', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_elmo', submittedAt: days(-6), status: DOC_STATUS.SUBMITTED,
  }),

  // p_delta — final requirements in, waiting on the URO
  doc('d_delta_f1', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_faye', submittedAt: days(-30), status: DOC_STATUS.SUPERSEDED, milestone: 'Final Defense',
  }),
  doc('d_delta_rev', 'p_delta', DOC_TYPES.REVISED_MANUSCRIPT, 1, {
    submittedBy: 'u_faye', submittedAt: days(-16), status: DOC_STATUS.APPROVED,
  }),
  doc('d_delta_f2', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 2, {
    submittedBy: 'u_faye', submittedAt: days(-10), status: DOC_STATUS.APPROVED, supersedes: 'd_delta_f1',
  }),
  doc('d_delta_ed', 'p_delta', DOC_TYPES.EDITORS_CERTIFICATE, 1, {
    submittedBy: 'u_gil', submittedAt: days(-8), status: DOC_STATUS.SUBMITTED,
  }),
  doc('d_delta_pl', 'p_delta', DOC_TYPES.PLAGIARISM_CERTIFICATE, 1, {
    submittedBy: 'u_gil', submittedAt: days(-8), status: DOC_STATUS.SUBMITTED,
  }),

  // p_epsilon — archived
  doc('d_eps_f1', 'p_epsilon', DOC_TYPES.FINAL_MANUSCRIPT, 3, {
    submittedBy: 'u_hana', submittedAt: days(-45), status: DOC_STATUS.ARCHIVED,
  }),
]

const REVIEWS = [
  {
    id: 'r_beta_1', projectId: 'p_beta', documentId: 'd_beta_m1', reviewerId: 'f_pineda',
    reviewerRole: P.ADVISER, decision: DECISIONS.MAJOR,
    comment: 'The review of related literature needs at least five more recent local studies. Objective 3 is not measurable yet — name the metric.',
    createdAt: days(-32),
  },
  {
    id: 'r_beta_2', projectId: 'p_beta', documentId: 'd_beta_m2', reviewerId: 'f_pineda',
    reviewerRole: P.ADVISER, decision: DECISIONS.APPROVE,
    comment: 'Revisions addressed. Ready for Instructor 1 to approve for the proposal defense.',
    createdAt: days(-16),
  },
]

const ANNOTATIONS = [
  {
    id: 'an_1', projectId: 'p_beta', documentId: 'd_beta_m2', authorId: 'f_santos',
    authorRole: P.PANEL_CHAIR, anchor: 'p. 14, Sampling', category: 'Methodology Concern',
    visibility: 'private', releasedAt: null,
    text: 'Ask during deliberation why purposive sampling was chosen over stratified random for the student respondents.',
    createdAt: days(-4),
  },
  {
    id: 'an_2', projectId: 'p_beta', documentId: 'd_beta_m2', authorId: 'f_bondoc',
    authorRole: P.PANEL_MEMBER, anchor: 'p. 9, Conceptual Framework', category: 'Documentation Issue',
    visibility: 'private', releasedAt: null,
    text: 'The IPO diagram lists an output that never appears in the objectives.',
    createdAt: days(-3),
  },
  {
    id: 'an_3', projectId: 'p_beta', documentId: 'd_beta_m1', authorId: 'f_pineda',
    authorRole: P.ADVISER, anchor: 'p. 22', category: 'Formatting Issue',
    visibility: 'shared', releasedAt: null,
    text: 'Citation format is inconsistent from here onward — use APA 7th.',
    createdAt: days(-33),
  },
]

const AI_SUMMARIES = [{
  id: 'ai_beta', projectId: 'p_beta', documentId: 'd_beta_m2', documentVersion: 2, milestone: 'Proposal Defense',
  generatedAt: days(-10), model: 'Gemini Flash (paid tier)', label: AI_DISCLOSURE,
  structured: {
    background: 'University clinic operations rely on a paper logbook, producing unpredictable waiting times and no record of service throughput.',
    problemStatement: 'There is no way to sequence, track or communicate patient queues, so students wait without information and staff cannot measure service load.',
    objectives: 'Develop a digital queueing system with priority-number issuance, waiting-time estimation and notifications; evaluate it against ISO/IEC 25010.',
    methodology: 'Iterative and Incremental Development across four increments, evaluated with SUS and an expert ISO/IEC 25010 form.',
    expectedOutput: 'A deployed web application and its evaluation results.',
    scope: 'University clinic only; walk-in consultations; excludes medical records and prescriptions.',
    limitations: 'Waiting-time estimation uses one semester of historical data; no integration with the university ID system.',
    contributions: 'A replicable queueing model for small institutional health services.',
  },
}]

const WEEKLY_LOGS = [
  {
    id: 'w_g1', projectId: 'p_gamma', weekNo: 1, periodStart: days(-28), periodEnd: days(-22),
    submittedBy: 'u_dina', submittedAt: days(-21),
    activities: 'Set up the RFID reader prototype and confirmed tag read range at 40 cm. Drafted the equipment schema.',
    status: 'Approved', signedBy: 'f_almocera', signedAt: days(-20), adviserRemarks: 'Good progress. Document the read-range test properly.',
  },
  {
    id: 'w_g2', projectId: 'p_gamma', weekNo: 2, periodStart: days(-21), periodEnd: days(-15),
    submittedBy: 'u_elmo', submittedAt: days(-14),
    activities: 'Implemented check-out and check-in endpoints and the borrowing history view. Started the overdue notification job.',
    status: 'Approved', signedBy: 'f_almocera', signedAt: days(-13), adviserRemarks: 'Proceed to integration testing.',
  },
  {
    id: 'w_g3', projectId: 'p_gamma', weekNo: 3, periodStart: days(-14), periodEnd: days(-8),
    submittedBy: 'u_dina', submittedAt: days(-7),
    activities: 'Completed integration testing for the borrowing module and fixed the duplicate-tag defect found in week 2.',
    status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
  },
]

const defense = (id, projectId, type, extra) => ({
  id, projectId, type, venue: 'SOC Conference Room, 3rd Floor', instructions: '',
  verdict: null, revisionClass: null, revisionDeadline: null, revisionStatus: null,
  recordedBy: null, recordedAt: null, remarks: '', ...extra,
})

const DEFENSES = [
  defense('def_beta', 'p_beta', 'Proposal', {
    scheduledAt: days(1), createdBy: 'f_almocera', createdAt: days(-10),
    instructions: 'Bring three printed copies of the manuscript. Presentation limited to 20 minutes.',
  }),
  defense('def_gamma', 'p_gamma', 'Proposal', {
    scheduledAt: days(-80), createdBy: 'f_almocera', createdAt: days(-88),
    verdict: VERDICTS.MINOR, revisionClass: 'Minor', revisionDeadline: days(-73), revisionStatus: 'Completed',
    recordedBy: 'f_santos', recordedAt: days(-80),
    remarks: 'Tighten the scope statement and correct the ERD cardinalities.',
  }),
  defense('def_delta', 'p_delta', 'Final', {
    scheduledAt: days(-20), createdBy: 'f_lazaro', createdAt: days(-28),
    verdict: VERDICTS.MINOR, revisionClass: 'Minor', revisionDeadline: days(-13), revisionStatus: 'Completed',
    recordedBy: 'f_santos', recordedAt: days(-20),
    remarks: 'Add the confusion matrix to the Results and correct the respondent count in Table 3.',
  }),
]

const sig = (order, role, userId, name, signedAt = null, viaGate = false) =>
  ({ order, role, userId, name, signedAt, viaGate })

const FORMS_DATA = [
  {
    id: 'form_gamma_2004', projectId: 'p_gamma', formType: FORMS.F2004.code, name: FORMS.F2004.name,
    status: 'Signed', createdAt: days(-80), stage: 'PROPOSAL_REVISION',
    payload: { verdict: VERDICTS.MINOR, revisionClass: 'Minor', defenseType: 'Proposal', defenseId: 'def_gamma', remarks: 'Tighten the scope statement and correct the ERD cardinalities.' },
    signatories: [
      sig(1, P.PANEL_CHAIR, 'f_santos', 'Dr. Helen V. Santos', days(-80)),
      sig(2, P.ADVISER, 'f_almocera', 'Mr. Chris Almocera', days(-75)),
      sig(3, P.PANEL_MEMBER, 'f_uy', 'Ms. Patricia L. Uy', days(-74)),
    ],
  },
  {
    id: 'form_delta_2004', projectId: 'p_delta', formType: FORMS.F2004.code, name: FORMS.F2004.name,
    status: 'Signed', createdAt: days(-20), stage: 'FINAL_REVISION',
    payload: { verdict: VERDICTS.MINOR, revisionClass: 'Minor', defenseType: 'Final', defenseId: 'def_delta', remarks: 'Add the confusion matrix to the Results and correct the respondent count in Table 3.' },
    signatories: [
      sig(1, P.PANEL_CHAIR, 'f_santos', 'Dr. Helen V. Santos', days(-20)),
      sig(2, P.ADVISER, 'f_bondoc', 'Engr. Marites C. Bondoc', days(-15)),
      sig(3, P.PANEL_MEMBER, 'f_dizon', 'Mr. Jomar R. Dizon', days(-14)),
      sig(3, P.PANEL_MEMBER, 'f_uy', 'Ms. Patricia L. Uy', days(-14)),
    ],
  },
  {
    id: 'form_delta_approval', projectId: 'p_delta', formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
    status: 'Circulating', createdAt: days(-12), stage: 'CLEARANCE', payload: {},
    signatories: [
      sig(1, P.ADVISER, 'f_bondoc', 'Engr. Marites C. Bondoc', days(-11)),
      sig(2, P.PANEL_CHAIR, 'f_santos', 'Dr. Helen V. Santos', days(-10)),
      sig(2, P.PANEL_MEMBER, 'f_dizon', 'Mr. Jomar R. Dizon', days(-10)),
      sig(2, P.PANEL_MEMBER, 'f_uy', 'Ms. Patricia L. Uy', days(-10)),
      sig(3, G.COORDINATOR, 'f_almocera', 'Mr. Chris Almocera', days(-7), true),
      sig(4, G.URO, 'f_castro', null, null, true),
      sig(5, G.DEAN, 'f_tayag', null, null, true),
      sig(5, G.ASSOCIATE_DEAN, 'f_rivera', null, null, true),
    ],
  },
  {
    id: 'form_eps_approval', projectId: 'p_epsilon', formType: FORMS.APPROVAL.code, name: FORMS.APPROVAL.name,
    status: 'Signed', createdAt: days(-52), stage: 'CLEARANCE', payload: {},
    signatories: [
      sig(1, P.ADVISER, 'f_pineda', 'Mr. Ronnie S. Pineda', days(-50)),
      sig(2, P.PANEL_CHAIR, 'f_santos', 'Dr. Helen V. Santos', days(-49)),
      sig(2, P.PANEL_MEMBER, 'f_uy', 'Ms. Patricia L. Uy', days(-49)),
      sig(3, G.COORDINATOR, 'f_almocera', 'Mr. Chris Almocera', days(-46), true),
      sig(4, G.URO, 'f_castro', 'Ms. Evelyn R. Castro', days(-43), true),
      sig(5, G.DEAN, 'f_tayag', 'Dr. Marlon I. Tayag', days(-41), true),
      sig(5, G.ASSOCIATE_DEAN, 'f_rivera', 'Dr. Angela P. Rivera', days(-40), true),
    ],
  },
]

const hist = (projectId, from, to, actorId, action, at) => ({
  id: `h_${projectId}_${to}`, projectId, fromStage: from, toStage: to, actorId, action, note: '', at,
})

const WORKFLOW_HISTORY = [
  hist('p_alpha', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-3)),

  hist('p_zeta', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-9)),
  hist('p_zeta', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-7)),
  hist('p_zeta', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-2)),

  hist('p_beta', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-88)),
  hist('p_beta', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-85)),
  hist('p_beta', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-82)),
  hist('p_beta', 'ADVISER_APPROVAL', 'TOPIC_PROPOSAL', 'f_rivera', 'APPROVE_ADVISER', days(-78)),
  hist('p_beta', 'TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'f_espinosa', 'REGISTER_TOPIC', days(-68)),
  hist('p_beta', 'PROPOSAL_DEVELOPMENT', 'PANEL_ASSIGNMENT', 'f_espinosa', 'APPROVE_FOR_DEFENSE', days(-15)),
  hist('p_beta', 'PANEL_ASSIGNMENT', 'PROPOSAL_DEFENSE_SCHEDULING', 'f_almocera', 'CONFIRM_PANEL', days(-12)),
  hist('p_beta', 'PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'f_almocera', 'SCHEDULE_PROPOSAL_DEFENSE', days(-10)),

  hist('p_gamma', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-150)),
  hist('p_gamma', 'PROPOSAL_DEFENSE', 'PROPOSAL_REVISION', 'f_santos', 'RECORD_PROPOSAL_VERDICT', days(-80)),
  hist('p_gamma', 'PROPOSAL_REVISION', 'IMPLEMENTATION', 'f_espinosa', 'CLOSE_PROPOSAL_REVISION', days(-72)),

  hist('p_delta', 'FINAL_DEFENSE', 'FINAL_REVISION', 'f_santos', 'RECORD_FINAL_VERDICT', days(-20)),
  hist('p_delta', 'FINAL_REVISION', 'CLEARANCE', 'f_lazaro', 'CLOSE_FINAL_REVISION', days(-12)),
  hist('p_delta', 'CLEARANCE', 'URO_VERIFICATION', 'f_almocera', 'ENDORSE_TO_URO', days(-7)),

  hist('p_epsilon', 'URO_VERIFICATION', 'FINAL_APPROVAL', 'f_castro', 'URO_VERIFY', days(-43)),
  hist('p_epsilon', 'FINAL_APPROVAL', 'ARCHIVED', 'f_rivera', 'FINAL_APPROVE', days(-40)),
]

const NOTIFICATIONS = [
  {
    id: 'n_1', userId: 'f_santos', projectId: 'p_beta', type: 'Defense scheduled',
    title: 'Proposal defense tomorrow — Smart Queue Management System',
    body: 'You are the Panel Chair. The manuscript under evaluation and its AI summary are in the project workspace.',
    read: false, at: days(-1),
  },
  {
    id: 'n_2', userId: 'f_almocera', projectId: 'p_gamma', type: 'Weekly log',
    title: 'Week 3 log awaiting your review',
    body: 'Dina R. Manalili submitted the week 3 log for IoT-Based Laboratory Equipment Tracking.',
    read: false, at: days(-7),
  },
  {
    id: 'n_3', userId: 'f_castro', projectId: 'p_delta', type: 'Workflow',
    title: 'Automated Student Feedback Sentiment Analysis moved to URO Verification',
    body: 'Mr. Chris Almocera endorsed the project and signed the Approval Sheet.',
    read: false, at: days(-7),
  },
  {
    id: 'n_4', userId: 'f_rivera', projectId: 'p_zeta', type: 'New assignment',
    title: 'Adviser assignment awaiting approval — Group 2 (WD-4A)',
    body: 'Mr. Chris Almocera assigned Dr. Marlon I. Tayag as Adviser.',
    read: false, at: days(-2),
  },
]

const AUDIT_LOGS = [
  { id: 'l_1', actorId: 'f_santos', action: 'VERDICT_RECORDED', entityType: 'defenses', entityId: 'def_delta', projectId: 'p_delta', at: days(-20), meta: { verdict: VERDICTS.MINOR } },
  { id: 'l_2', actorId: 'f_almocera', action: 'SIGNATURE_APPLIED', entityType: 'forms', entityId: 'form_delta_approval', projectId: 'p_delta', at: days(-7), meta: { role: G.COORDINATOR } },
  { id: 'l_3', actorId: 'f_rivera', action: 'STAGE_FINAL_APPROVE', entityType: 'projects', entityId: 'p_epsilon', projectId: 'p_epsilon', at: days(-40), meta: { from: 'FINAL_APPROVAL', to: 'ARCHIVED' } },
  { id: 'l_4', actorId: 'f_almocera', action: 'ROLE_ASSIGNED', entityType: 'projectAssignments', entityId: 'a_p_zeta_Adviser_f_tayag', projectId: 'p_zeta', at: days(-3), meta: { userId: 'f_tayag', roleType: P.ADVISER } },
]

export function buildSeed() {
  return {
    users: keyBy(USERS),
    sections: keyBy(SECTIONS),
    projects: keyBy(PROJECTS),
    projectMembers: keyBy(MEMBERS),
    projectAssignments: keyBy(ASSIGNMENTS),
    documents: keyBy(DOCUMENTS),
    annotations: keyBy(ANNOTATIONS),
    reviews: keyBy(REVIEWS),
    aiSummaries: keyBy(AI_SUMMARIES),
    weeklyLogs: keyBy(WEEKLY_LOGS),
    defenses: keyBy(DEFENSES),
    forms: keyBy(FORMS_DATA),
    workflowHistory: keyBy(WORKFLOW_HISTORY),
    notifications: keyBy(NOTIFICATIONS),
    auditLogs: keyBy(AUDIT_LOGS),
  }
}
