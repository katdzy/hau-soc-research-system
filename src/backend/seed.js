// Demo dataset. Five projects parked at different points in the lifecycle so
// any segment of the workflow can be exercised without replaying the whole
// thing. Reset from Administration → Reset demo data.
//
// NOTE: Espinosa, Almocera and Tayag appear with the roles recorded in the
// project documentation. Every other faculty name here is invented filler —
// swap them in this file before any public demo.

import { GLOBAL_ROLES as G, DOC_TYPES, DOC_STATUS, DECISIONS, VERDICTS, FORMS } from '../domain/constants.js'

const WD = 'BSIT — Web Development'
const days = (n) => new Date(Date.now() + n * 864e5).toISOString()

const keyBy = (rows) => Object.fromEntries(rows.map(r => [r.id, r]))

const user = (id, name, email, globalRole, extra = {}) => ({
  id, name, email, globalRole, status: 'Active',
  idNumber: extra.idNumber ?? '', program: extra.program ?? '', yearLevel: extra.yearLevel ?? '',
  createdAt: days(-200), ...extra,
})

const USERS = [
  // --- Students -------------------------------------------------------------
  user('u_adrian', 'Adrian D. Curley', 'adcurley@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0114', program: WD, yearLevel: '4th Year' }),
  user('u_cedric', 'Cedric Luis R. Dungca', 'clrdungca@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0118', program: WD, yearLevel: '4th Year' }),
  user('u_karl', 'Karl Andrei T. Dungca', 'katdungca@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0119', program: WD, yearLevel: '4th Year' }),
  user('u_sofia', 'Sofia Anne T. Sarmiento', 'satsarmiento@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0147', program: WD, yearLevel: '4th Year' }),
  user('u_ana', 'Ana Marie L. Bituin', 'amlbituin@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0203', program: WD, yearLevel: '4th Year' }),
  user('u_ben', 'Benjamin C. Ocampo', 'bcocampo@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0211', program: WD, yearLevel: '4th Year' }),
  user('u_carmen', 'Carmen S. Vidal', 'csvidal@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0222', program: WD, yearLevel: '4th Year' }),
  user('u_dina', 'Dina R. Manalili', 'drmanalili@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0305', program: 'BSCS', yearLevel: '4th Year' }),
  user('u_elmo', 'Elmo P. Garcia', 'epgarcia@student.hau.edu.ph', G.STUDENT, { idNumber: '2022-0309', program: 'BSCS', yearLevel: '4th Year' }),
  user('u_faye', 'Faye D. Lumanog', 'fdlumanog@student.hau.edu.ph', G.STUDENT, { idNumber: '2021-0402', program: WD, yearLevel: '4th Year' }),
  user('u_gil', 'Gilbert M. Tolentino', 'gmtolentino@student.hau.edu.ph', G.STUDENT, { idNumber: '2021-0417', program: WD, yearLevel: '4th Year' }),
  user('u_hana', 'Hana Beatriz S. Roque', 'hbsroque@student.hau.edu.ph', G.STUDENT, { idNumber: '2021-0433', program: WD, yearLevel: '4th Year' }),

  // --- Faculty and administration -------------------------------------------
  user('f_espinosa', 'Asst. Prof. Kevin Aldrin G. Espinosa, MIT', 'kagespinosa@hau.edu.ph', G.INSTRUCTOR_1),
  user('f_lazaro', 'Mr. Joseph T. Lazaro', 'jtlazaro@hau.edu.ph', G.INSTRUCTOR_2),
  user('f_almocera', 'Mr. Chris Almocera', 'calmocera@hau.edu.ph', G.COORDINATOR),
  user('f_rivera', 'Dr. Angela P. Rivera', 'aprivera@hau.edu.ph', G.ASSOCIATE_DEAN),
  user('f_tayag', 'Dr. Marlon I. Tayag', 'mitayag@hau.edu.ph', G.DEAN),
  user('f_castro', 'Ms. Evelyn R. Castro', 'ercastro@hau.edu.ph', G.URO),
  user('f_bondoc', 'Engr. Marites C. Bondoc', 'mcbondoc@hau.edu.ph', G.FACULTY),
  user('f_pineda', 'Mr. Ronnie S. Pineda', 'rspineda@hau.edu.ph', G.FACULTY),
  user('f_santos', 'Dr. Helen V. Santos', 'hvsantos@hau.edu.ph', G.FACULTY),
  user('f_dizon', 'Mr. Jomar R. Dizon', 'jrdizon@hau.edu.ph', G.FACULTY),
  user('f_uy', 'Ms. Patricia L. Uy', 'pluy@hau.edu.ph', G.FACULTY),
  user('a_admin', 'Ma. Cristina V. Reyes (ICT Services)', 'mcvreyes@hau.edu.ph', G.ADMIN),
]

const project = (id, title, stage, extra = {}) => ({
  id, title, previousTitles: [], category: 'Capstone', researchArea: extra.researchArea ?? 'Information Systems',
  program: extra.program ?? WD, term: 'AY 2026–2027, 1st Semester',
  currentStage: stage, status: 'Active', archiveResult: null,
  revisionClass: null, revisionDeadline: null, uroClearedAt: null, publicGallery: false,
  createdAt: days(-90), ...extra,
})

const PROJECTS = [
  project('p_alpha', 'Untitled — Group 5 (BSIT-WD)', 'GROUP_FORMATION', { createdAt: days(-3) }),
  project('p_beta', 'Smart Queue Management System for University Clinics', 'PROPOSAL_DEFENSE'),
  project('p_gamma', 'IoT-Based Laboratory Equipment Tracking for Computing Laboratories', 'IMPLEMENTATION', { program: 'BSCS', researchArea: 'Internet of Things' }),
  project('p_delta', 'Automated Student Feedback Sentiment Analysis for Program Assessment', 'URO_CLEARANCE', { researchArea: 'Data Science' }),
  project('p_epsilon', 'Barangay Health Records Digitisation Platform', 'ARCHIVED', {
    archiveResult: 'Pass', publicGallery: true, status: 'Completed', uroClearedAt: days(-40),
  }),
]

const member = (projectId, userId) => ({ id: `m_${projectId}_${userId}`, projectId, userId, joinedAt: days(-60) })

const MEMBERS = [
  ...['u_adrian', 'u_cedric', 'u_karl', 'u_sofia'].map(u => member('p_alpha', u)),
  ...['u_ana', 'u_ben', 'u_carmen'].map(u => member('p_beta', u)),
  ...['u_dina', 'u_elmo'].map(u => member('p_gamma', u)),
  ...['u_faye', 'u_gil'].map(u => member('p_delta', u)),
  ...['u_hana'].map(u => member('p_epsilon', u)),
]

const assign = (projectId, userId, roleType) => ({
  id: `a_${projectId}_${roleType.replace(/\W/g, '')}_${userId}`,
  projectId, userId, roleType, status: 'Accepted', assignedAt: days(-55),
})

// Two deliberate CAC demonstrations live in this table:
//   f_bondoc  — Adviser on p_alpha AND Panel Member on p_beta
//   f_almocera— Program Coordinator institution-wide AND Adviser on p_gamma
const ASSIGNMENTS = [
  assign('p_alpha', 'f_espinosa', 'Instructor 1'),

  assign('p_beta', 'f_espinosa', 'Instructor 1'),
  assign('p_beta', 'f_pineda', 'Adviser'),
  assign('p_beta', 'f_santos', 'Panel Chair'),
  assign('p_beta', 'f_bondoc', 'Panel Member'),
  assign('p_beta', 'f_dizon', 'Panel Member'),

  assign('p_gamma', 'f_espinosa', 'Instructor 1'),
  assign('p_gamma', 'f_lazaro', 'Instructor 2'),
  assign('p_gamma', 'f_almocera', 'Adviser'),
  assign('p_gamma', 'f_santos', 'Panel Chair'),
  assign('p_gamma', 'f_uy', 'Panel Member'),

  assign('p_delta', 'f_espinosa', 'Instructor 1'),
  assign('p_delta', 'f_lazaro', 'Instructor 2'),
  assign('p_delta', 'f_bondoc', 'Adviser'),
  assign('p_delta', 'f_santos', 'Panel Chair'),
  assign('p_delta', 'f_dizon', 'Panel Member'),
  assign('p_delta', 'f_uy', 'Panel Member'),

  assign('p_epsilon', 'f_pineda', 'Adviser'),
  assign('p_epsilon', 'f_santos', 'Panel Chair'),
  assign('p_epsilon', 'f_uy', 'Panel Member'),
]

const doc = (id, projectId, docType, version, extra = {}) => ({
  id, projectId, docType, versionNumber: version,
  title: extra.title ?? `${docType} v${version}`,
  fileName: extra.fileName ?? `${docType.toLowerCase().replace(/\W+/g, '-')}-v${version}.pdf`,
  fileSize: extra.fileSize ?? 480000 + version * 20000,
  abstract: extra.abstract ?? '',
  submittedBy: extra.submittedBy, submittedAt: extra.submittedAt ?? days(-30),
  status: extra.status ?? DOC_STATUS.SUBMITTED,
  milestone: extra.milestone ?? null,
  supersedes: extra.supersedes ?? null,
  ...extra,
})

const BETA_ABSTRACT =
  'The study develops a queue management system for the university clinic that issues ' +
  'digital priority numbers, estimates waiting times from historical service data, and ' +
  'notifies students when their turn approaches, replacing the current paper logbook.'

const DOCUMENTS = [
  // p_beta — topic approved, two proposal manuscript versions, ready to defend
  doc('d_beta_topic', 'p_beta', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: Smart Queue Management System', submittedBy: 'u_ana',
    submittedAt: days(-70), status: DOC_STATUS.APPROVED,
  }),
  doc('d_beta_m1', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_ana', submittedAt: days(-40), status: DOC_STATUS.SUPERSEDED,
    abstract: BETA_ABSTRACT,
  }),
  doc('d_beta_m2', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 2, {
    submittedBy: 'u_ana', submittedAt: days(-18), status: DOC_STATUS.APPROVED,
    supersedes: 'd_beta_m1', milestone: 'Proposal Defense', abstract: BETA_ABSTRACT,
  }),

  // p_gamma — in implementation
  doc('d_gamma_topic', 'p_gamma', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    submittedBy: 'u_dina', submittedAt: days(-120), status: DOC_STATUS.APPROVED,
  }),
  doc('d_gamma_m1', 'p_gamma', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_dina', submittedAt: days(-95), status: DOC_STATUS.APPROVED,
    milestone: 'Proposal Defense',
  }),
  doc('d_gamma_f1', 'p_gamma', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_elmo', submittedAt: days(-6), status: DOC_STATUS.SUBMITTED,
  }),

  // p_delta — all final requirements uploaded, waiting on URO
  doc('d_delta_f1', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_faye', submittedAt: days(-30), status: DOC_STATUS.SUPERSEDED,
  }),
  doc('d_delta_rev', 'p_delta', DOC_TYPES.REVISED_MANUSCRIPT, 2, {
    submittedBy: 'u_faye', submittedAt: days(-12), status: DOC_STATUS.APPROVED,
    supersedes: 'd_delta_f1', milestone: 'Final Defense',
  }),
  doc('d_delta_f2', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 2, {
    submittedBy: 'u_faye', submittedAt: days(-10), status: DOC_STATUS.APPROVED,
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
    abstract: 'A records digitisation platform for barangay health centres, covering patient registration, immunisation tracking and monthly reporting to the municipal health office.',
  }),
]

const REVIEWS = [
  {
    id: 'r_beta_1', projectId: 'p_beta', documentId: 'd_beta_m1', reviewerId: 'f_pineda',
    reviewerRole: 'Adviser', decision: DECISIONS.MAJOR,
    comment: 'Chapter 2 needs at least five more recent local studies. Objectives are not yet measurable — rewrite objective 3 so it names the metric.',
    createdAt: days(-32),
  },
  {
    id: 'r_beta_2', projectId: 'p_beta', documentId: 'd_beta_m2', reviewerId: 'f_pineda',
    reviewerRole: 'Adviser', decision: DECISIONS.ENDORSE,
    comment: 'Revisions addressed. Endorsing for panel assignment.',
    createdAt: days(-15),
  },
]

const ANNOTATIONS = [
  {
    id: 'an_1', projectId: 'p_beta', documentId: 'd_beta_m2', authorId: 'f_santos',
    authorRole: 'Panel Chair', anchor: 'p. 14, §3.2 Sampling', visibility: 'private',
    stageAtCreation: 'PROPOSAL_DEFENSE',
    text: 'Ask during deliberation why purposive sampling was chosen over stratified random for the student respondents.',
    createdAt: days(-4),
  },
  {
    id: 'an_2', projectId: 'p_beta', documentId: 'd_beta_m2', authorId: 'f_bondoc',
    authorRole: 'Panel Member', anchor: 'p. 9, Conceptual Framework', visibility: 'private',
    stageAtCreation: 'PROPOSAL_DEFENSE',
    text: 'The IPO diagram lists an output that never appears in the objectives. Flag this.',
    createdAt: days(-3),
  },
  {
    id: 'an_3', projectId: 'p_beta', documentId: 'd_beta_m1', authorId: 'f_pineda',
    authorRole: 'Adviser', anchor: 'p. 22, §2.4', visibility: 'shared',
    text: 'Citation format is inconsistent from here onward — APA 7th, not 6th.',
    createdAt: days(-33),
  },
]

const AI_SUMMARIES = [{
  id: 'ai_beta', projectId: 'p_beta', documentId: 'd_beta_m2', milestone: 'Proposal Defense',
  generatedAt: days(-14), model: 'Gemini Flash (external service)',
  label: 'AI-generated summary. Not an official academic evaluation — verify against the manuscript before relying on it.',
  structured: {
    background: 'University clinic operations rely on a paper logbook, producing unpredictable waiting times and no record of service throughput.',
    problemStatement: 'There is no mechanism to sequence, track or communicate patient queues, so students wait without information and staff cannot measure service load.',
    objectives: 'Develop a digital queueing system with priority-number issuance, waiting-time estimation and SMS/push notification; evaluate it against ISO/IEC 25010.',
    methodology: 'Iterative and Incremental Development across four increments, evaluated with SUS and an expert ISO/IEC 25010 checklist.',
    expectedOutput: 'A deployed web application plus a comparative report on waiting-time reduction.',
    scope: 'University clinic only; walk-in consultations; does not cover medical records or prescriptions.',
    limitations: 'Waiting-time estimation is based on one semester of historical data; no integration with the university ID system.',
    contributions: 'A replicable queueing model for small institutional health services.',
  },
}]

const WEEKLY_LOGS = [
  {
    id: 'w_g1', projectId: 'p_gamma', weekNo: 1, periodStart: days(-28), periodEnd: days(-22),
    submittedBy: 'u_dina', submittedAt: days(-21),
    activities: 'Set up the RFID reader prototype and confirmed tag read range at 40cm. Drafted the equipment schema.',
    status: 'Signed', signedBy: 'f_almocera', signedAt: days(-20), adviserRemarks: 'Good progress. Document the read-range test properly.',
  },
  {
    id: 'w_g2', projectId: 'p_gamma', weekNo: 2, periodStart: days(-21), periodEnd: days(-15),
    submittedBy: 'u_elmo', submittedAt: days(-14),
    activities: 'Implemented check-out/check-in endpoints and the borrowing history view. Started the overdue notification job.',
    status: 'Signed', signedBy: 'f_almocera', signedAt: days(-13), adviserRemarks: 'Proceed to integration testing.',
  },
  {
    id: 'w_g3', projectId: 'p_gamma', weekNo: 3, periodStart: days(-14), periodEnd: days(-8),
    submittedBy: 'u_dina', submittedAt: days(-7),
    activities: 'Completed integration testing for the borrowing module and fixed the duplicate-tag defect found in week 2.',
    status: 'Submitted', signedBy: null, signedAt: null, adviserRemarks: '',
  },
]

const DEFENSES = [
  {
    id: 'def_beta', projectId: 'p_beta', type: 'Proposal',
    scheduledAt: days(1), venue: 'SOC Conference Room, 3rd Floor PGN Building',
    createdBy: 'f_almocera', createdAt: days(-10),
    verdict: null, revisionClass: null, revisionDeadline: null, recordedBy: null, recordedAt: null,
    remarks: '',
  },
  {
    id: 'def_gamma', projectId: 'p_gamma', type: 'Proposal',
    scheduledAt: days(-80), venue: 'SOC Conference Room',
    createdBy: 'f_almocera', createdAt: days(-88),
    verdict: VERDICTS.PASSED_MINOR, revisionClass: 'Minor', revisionDeadline: days(-73),
    recordedBy: 'f_santos', recordedAt: days(-80),
    remarks: 'Tighten the scope statement and correct the ERD cardinalities.',
  },
  {
    id: 'def_delta', projectId: 'p_delta', type: 'Final',
    scheduledAt: days(-20), venue: 'SOC Conference Room',
    createdBy: 'f_lazaro', createdAt: days(-28),
    verdict: VERDICTS.PASSED_MINOR, revisionClass: 'Minor', revisionDeadline: days(-13),
    recordedBy: 'f_santos', recordedAt: days(-20),
    remarks: 'Add the confusion matrix to Chapter 4 and correct the respondent count in Table 3.',
  },
]

const signatory = (role, userId, name, signedAt = null) => ({ role, userId, name, signedAt })

const FORMS_DATA = [
  {
    id: 'form_delta_approval', projectId: 'p_delta', formType: FORMS.APPROVAL.code,
    name: FORMS.APPROVAL.name, status: 'Circulating', createdAt: days(-11),
    signatories: [
      signatory('Adviser', 'f_bondoc', 'Engr. Marites C. Bondoc', days(-11)),
      signatory('Panel Member', 'f_dizon', 'Mr. Jomar R. Dizon', days(-11)),
      signatory('Panel Member', 'f_uy', 'Ms. Patricia L. Uy', days(-10)),
      signatory('Panel Chair', 'f_santos', 'Dr. Helen V. Santos', days(-10)),
      signatory('Program Chair/Coordinator', 'f_almocera', 'Mr. Chris Almocera', days(-9)),
      signatory('University Research Office', 'f_castro', 'Ms. Evelyn R. Castro'),
      signatory('Dean', 'f_tayag', 'Dr. Marlon I. Tayag'),
    ],
  },
  {
    id: 'form_delta_2004', projectId: 'p_delta', formType: FORMS.F2004.code,
    name: FORMS.F2004.name, status: 'Completed', createdAt: days(-20),
    payload: { verdict: VERDICTS.PASSED_MINOR, revisionClass: 'Minor' },
    signatories: [
      signatory('Panel Chair', 'f_santos', 'Dr. Helen V. Santos', days(-13)),
      signatory('Panel Member', 'f_dizon', 'Mr. Jomar R. Dizon', days(-13)),
      signatory('Panel Member', 'f_uy', 'Ms. Patricia L. Uy', days(-12)),
    ],
  },
  {
    id: 'form_eps_approval', projectId: 'p_epsilon', formType: FORMS.APPROVAL.code,
    name: FORMS.APPROVAL.name, status: 'Completed', createdAt: days(-50),
    signatories: [
      signatory('Adviser', 'f_pineda', 'Mr. Ronnie S. Pineda', days(-48)),
      signatory('Panel Member', 'f_uy', 'Ms. Patricia L. Uy', days(-47)),
      signatory('Panel Chair', 'f_santos', 'Dr. Helen V. Santos', days(-46)),
      signatory('Program Chair/Coordinator', 'f_almocera', 'Mr. Chris Almocera', days(-44)),
      signatory('University Research Office', 'f_castro', 'Ms. Evelyn R. Castro', days(-42)),
      signatory('Dean', 'f_tayag', 'Dr. Marlon I. Tayag', days(-40)),
    ],
  },
]

const hist = (projectId, from, to, actorId, action, at) => ({
  id: `h_${projectId}_${to}`, projectId, fromStage: from, toStage: to,
  actorId, action, note: '', at,
})

const WORKFLOW_HISTORY = [
  hist('p_beta', null, 'GROUP_FORMATION', 'f_espinosa', 'Group created', days(-88)),
  hist('p_beta', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-85)),
  hist('p_beta', 'ADVISER_ASSIGNMENT', 'ADVISER_ENDORSEMENT', 'f_almocera', 'ROUTE_ADVISER', days(-82)),
  hist('p_beta', 'ADVISER_ENDORSEMENT', 'TOPIC_PROPOSAL', 'f_rivera', 'APPROVE_ADVISER', days(-78)),
  hist('p_beta', 'TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'f_espinosa', 'REGISTER_TOPIC', days(-68)),
  hist('p_beta', 'PROPOSAL_DEVELOPMENT', 'PANEL_ASSIGNMENT', 'f_pineda', 'ENDORSE_FOR_PANEL', days(-15)),
  hist('p_beta', 'PANEL_ASSIGNMENT', 'PROPOSAL_DEFENSE_SCHEDULING', 'f_almocera', 'CONFIRM_PANEL', days(-12)),
  hist('p_beta', 'PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'f_almocera', 'OPEN_PROPOSAL_DEFENSE', days(-10)),

  hist('p_gamma', null, 'GROUP_FORMATION', 'f_espinosa', 'Group created', days(-140)),
  hist('p_gamma', 'PROPOSAL_DEFENSE', 'PROPOSAL_REVISION', 'f_santos', 'RECORD_PROPOSAL_VERDICT', days(-80)),
  hist('p_gamma', 'PROPOSAL_REVISION', 'IMPLEMENTATION', 'f_santos', 'CONFIRM_PROPOSAL_REVISION', days(-70)),

  hist('p_delta', 'FINAL_DEFENSE', 'FINAL_REVISION', 'f_santos', 'RECORD_FINAL_VERDICT', days(-20)),
  hist('p_delta', 'FINAL_REVISION', 'URO_CLEARANCE', 'f_santos', 'CONFIRM_FINAL_REVISION', days(-11)),

  hist('p_epsilon', 'URO_CLEARANCE', 'DEAN_APPROVAL', 'f_castro', 'GRANT_URO_CLEARANCE', days(-42)),
  hist('p_epsilon', 'DEAN_APPROVAL', 'ARCHIVED', 'f_tayag', 'DEAN_SIGN', days(-40)),
]

const NOTIFICATIONS = [
  {
    id: 'n_1', userId: 'f_santos', projectId: 'p_beta', type: 'Defense assignment',
    title: 'Proposal defense tomorrow — Smart Queue Management System',
    body: 'You are the Panel Chair. The manuscript under evaluation and its AI summary are available in the project workspace.',
    read: false, at: days(-1),
  },
  {
    id: 'n_2', userId: 'f_almocera', projectId: 'p_gamma', type: 'Weekly log',
    title: 'Week 3 accomplishment log awaiting your signature',
    body: 'Dina R. Manalili submitted the week 3 log for IoT-Based Laboratory Equipment Tracking.',
    read: false, at: days(-7),
  },
  {
    id: 'n_3', userId: 'f_castro', projectId: 'p_delta', type: 'URO clearance',
    title: 'Project routed for URO clearance',
    body: 'Automated Student Feedback Sentiment Analysis has completed post-defense revisions and is awaiting clearance.',
    read: false, at: days(-11),
  },
]

const AUDIT_LOGS = [
  { id: 'l_1', actorId: 'f_santos', action: 'VERDICT_RECORDED', entityType: 'defenses', entityId: 'def_delta', projectId: 'p_delta', at: days(-20), meta: { verdict: VERDICTS.PASSED_MINOR } },
  { id: 'l_2', actorId: 'f_castro', action: 'URO_CLEARANCE_GRANTED', entityType: 'projects', entityId: 'p_epsilon', projectId: 'p_epsilon', at: days(-42), meta: {} },
  { id: 'l_3', actorId: 'f_tayag', action: 'DEAN_SIGNED', entityType: 'projects', entityId: 'p_epsilon', projectId: 'p_epsilon', at: days(-40), meta: { archiveResult: 'Pass' } },
]

export function buildSeed() {
  return {
    users: keyBy(USERS),
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
