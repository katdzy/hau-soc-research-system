// Demo dataset. Seven groups parked at different points in the life cycle so
// any segment of the workflow can be exercised without replaying the whole
// thing. Reset from Administration → Reset demo data.
//
// NOTE: Espinosa (Instructor 1), Almocera (Program Coordinator, IT) and Tayag
// (Dean, and Group 5's Adviser) appear with the roles recorded in the project
// documentation, and Group 5 carries the team's registered title. Every other
// name is invented filler — swap them in this file before any demo outside
// the team.

import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES, DOC_STATUS, DECISIONS, VERDICTS, FORMS, AI_DISCLOSURE,
  ANNOTATION_STATUS as A,
} from '../domain/constants.js'

const WD = 'BSIT — Web Development'
const NA = 'BSIT — Network Administration'
const TERM = 'AY 2026–2027, 1st Semester'
const days = (n) => new Date(Date.now() + n * 864e5).toISOString()
const dateOnly = (n) => days(n).slice(0, 10)
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
  student('u_noel', 'Noel B. Pangan', 'nbpangan@student.hau.edu.ph', '2022-0170', WD, 'WD-4A'),
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

const project = (id, groupName, title, stage, extra = {}) => ({
  id, groupName, title, previousTitles: [], category: 'Capstone', researchArea: extra.researchArea ?? 'Information Systems',
  program: WD, term: TERM, block: 'WD-4A', sectionId: null,
  currentStage: stage, status: 'Active', archiveResult: null,
  revisionClass: null, revisionDeadline: null,
  createdAt: days(-90), ...extra,
})

const PROJECTS = [
  project('p_alpha', 'Group 5',
    'Development of a Web-Based Thesis and Capstone Project Management and Workflow Automation System for HAU-SOC',
    'PROPOSAL_DEVELOPMENT', {
      sectionId: 'sec_wd4a', createdAt: days(-80), researchArea: 'Workflow Automation',
      previousTitles: ['Untitled — Group 5 (WD-4A)'],
    }),
  project('p_zeta', 'Group 2', 'Untitled — Group 2 (WD-4A)', 'ADVISER_APPROVAL', {
    sectionId: 'sec_wd4a', createdAt: days(-9), researchArea: 'Not yet set',
  }),
  project('p_theta', 'Group 7', 'Untitled — Group 7 (WD-4A)', 'GROUP_FORMATION', {
    sectionId: 'sec_wd4a', createdAt: days(-2), researchArea: 'Not yet set',
  }),
  project('p_beta', 'Group 3', 'Smart Queue Management System for University Clinics', 'PROPOSAL_DEFENSE', {
    sectionId: 'sec_wd4b', block: 'WD-4B',
  }),
  project('p_gamma', 'Group 1', 'IoT-Based Laboratory Equipment Tracking for Computing Laboratories', 'IMPLEMENTATION', {
    program: NA, block: 'NA-4A', researchArea: 'Internet of Things', createdAt: days(-150),
  }),
  project('p_delta', 'Group 4', 'Automated Student Feedback Sentiment Analysis for Program Assessment', 'URO_VERIFICATION', {
    block: 'WD-4C', researchArea: 'Data Science', createdAt: days(-200),
  }),
  project('p_epsilon', 'Group 6', 'Barangay Health Records Digitisation Platform', 'ARCHIVED', {
    block: 'WD-4D', researchArea: 'Health Informatics', term: 'AY 2025–2026, 2nd Semester', createdAt: days(-400),
    archiveResult: 'Pass', status: 'Archived', archivedAt: days(-40),
  }),
]

const member = (projectId, userId) => ({ id: `m_${projectId}_${userId}`, projectId, userId, joinedAt: days(-60) })

const MEMBERS = [
  ...['u_adrian', 'u_cedric', 'u_karl', 'u_sofia'].map(u => member('p_alpha', u)),
  ...['u_ivan', 'u_jas'].map(u => member('p_zeta', u)),
  ...['u_luis', 'u_mika'].map(u => member('p_theta', u)),
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
//   f_tayag    — Dean institution-wide AND Adviser on Groups 5 and 2; he cannot
//                approve his own adviser assignment on Group 2.
//   f_almocera — Program Coordinator for the IT programs AND Adviser on Group 1.
//   f_bondoc   — Adviser on Group 4 AND Panel Member on Group 3: full version
//                history on one, latest version only on the other.
//   f_santos   — Panel Chair on four groups; records a verdict only on the one
//                at its defense, once every panelist has submitted an evaluation.
//   f_espinosa — Instructor 1 on Group 1, whose access ended at Capstone 2.
const ASSIGNMENTS = [
  assign('p_alpha', 'f_espinosa', P.INSTRUCTOR_1),
  assign('p_alpha', 'f_tayag', P.ADVISER),

  assign('p_zeta', 'f_espinosa', P.INSTRUCTOR_1),
  assign('p_zeta', 'f_tayag', P.ADVISER),

  assign('p_theta', 'f_espinosa', P.INSTRUCTOR_1),

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
  fileName: extra.fileName ?? `${docType.replace(/\W+/g, '')}_v${version}.pdf`,
  fileSize: extra.fileSize ?? 480000 + version * 20000,
  link: null, abstract: '', scope: null, versionNote: '', notesToReviewer: '',
  submittedAt: days(-30), status: DOC_STATUS.SUBMITTED, milestone: null, supersedes: null,
  ...extra,
})

const BETA_ABSTRACT =
  'The study develops a queue management system for the university clinic that issues ' +
  'digital priority numbers, estimates waiting times from historical service data, and ' +
  'notifies students when their turn approaches, replacing the current paper logbook.'

const DOCUMENTS = [
  // Group 5 — Proposal Development; v2 came back with annotations
  doc('d_alpha_topic', 'p_alpha', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: Thesis and Capstone Workflow Automation System', submittedBy: 'u_karl',
    submittedAt: days(-62), status: DOC_STATUS.APPROVED, fileName: 'ProposedTopics_Group5.pdf',
  }),
  doc('d_alpha_cp1', 'p_alpha', DOC_TYPES.CONCEPT_PAPER, 1, {
    submittedBy: 'u_sofia', submittedAt: days(-58), status: DOC_STATUS.SUPERSEDED, fileName: 'ConceptPaper_v1.pdf',
  }),
  doc('d_alpha_cp2', 'p_alpha', DOC_TYPES.CONCEPT_PAPER, 2, {
    submittedBy: 'u_sofia', submittedAt: days(-50), status: DOC_STATUS.APPROVED, fileName: 'ConceptPaper_v2.pdf',
    supersedes: 'd_alpha_cp1', versionNote: 'Narrowed the scope to HAU-SOC per Instructor 1.',
  }),
  doc('d_alpha_pm1', 'p_alpha', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_karl', submittedAt: days(-30), status: DOC_STATUS.SUPERSEDED, fileName: 'Ch1-3_Group5_v1.pdf',
    scope: 'Chapter draft', versionNote: 'Introduction and review of related literature, first full draft.',
  }),
  doc('d_alpha_pm2', 'p_alpha', DOC_TYPES.PROPOSAL_MANUSCRIPT, 2, {
    submittedBy: 'u_karl', submittedAt: days(-9), status: DOC_STATUS.FOR_REVISION, fileName: 'Ch1-3_Group5_v2.pdf',
    supersedes: 'd_alpha_pm1', scope: 'Chapter draft',
    versionNote: 'Adds the Method: IID, sampling, instruments. Addresses the v1 comments on the literature review.',
  }),

  // Group 3 — at its proposal defense
  doc('d_beta_topic', 'p_beta', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: Smart Queue Management System', submittedBy: 'u_ana',
    submittedAt: days(-72), status: DOC_STATUS.APPROVED,
  }),
  doc('d_beta_cp', 'p_beta', DOC_TYPES.CONCEPT_PAPER, 1, {
    submittedBy: 'u_ben', submittedAt: days(-70), status: DOC_STATUS.APPROVED,
  }),
  doc('d_beta_m1', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_ana', submittedAt: days(-40), status: DOC_STATUS.SUPERSEDED, abstract: BETA_ABSTRACT,
    scope: 'Chapter draft', versionNote: 'Chapters 1–3 draft.',
  }),
  doc('d_beta_m2', 'p_beta', DOC_TYPES.PROPOSAL_MANUSCRIPT, 2, {
    submittedBy: 'u_ana', submittedAt: days(-18), status: DOC_STATUS.APPROVED,
    supersedes: 'd_beta_m1', milestone: 'Proposal Defense', abstract: BETA_ABSTRACT,
    scope: 'Complete manuscript', versionNote: 'Complete proposal manuscript for the defense.',
  }),

  // Group 1 — implementation
  doc('d_gamma_topic', 'p_gamma', DOC_TYPES.TOPIC_PROPOSAL, 1, {
    title: 'Proposed Topic: IoT-Based Laboratory Equipment Tracking', submittedBy: 'u_dina',
    submittedAt: days(-130), status: DOC_STATUS.APPROVED,
  }),
  doc('d_gamma_m1', 'p_gamma', DOC_TYPES.PROPOSAL_MANUSCRIPT, 1, {
    submittedBy: 'u_dina', submittedAt: days(-95), status: DOC_STATUS.APPROVED, milestone: 'Proposal Defense',
    scope: 'Complete manuscript',
  }),
  doc('d_gamma_rev', 'p_gamma', DOC_TYPES.REVISED_MANUSCRIPT, 1, {
    submittedBy: 'u_dina', submittedAt: days(-76), status: DOC_STATUS.APPROVED, scope: 'Complete manuscript',
  }),
  doc('d_gamma_f1', 'p_gamma', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_elmo', submittedAt: days(-6), status: DOC_STATUS.SUBMITTED, scope: 'Chapter draft',
    versionNote: 'Chapters 4–5 draft with the borrowing-module results.',
  }),

  // Group 4 — final requirements in, waiting on the URO
  doc('d_delta_f1', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 1, {
    submittedBy: 'u_faye', submittedAt: days(-30), status: DOC_STATUS.SUPERSEDED, milestone: 'Final Defense',
    scope: 'Complete manuscript',
  }),
  doc('d_delta_rev', 'p_delta', DOC_TYPES.REVISED_MANUSCRIPT, 1, {
    submittedBy: 'u_faye', submittedAt: days(-16), status: DOC_STATUS.APPROVED, scope: 'Complete manuscript',
  }),
  doc('d_delta_f2', 'p_delta', DOC_TYPES.FINAL_MANUSCRIPT, 2, {
    submittedBy: 'u_faye', submittedAt: days(-10), status: DOC_STATUS.APPROVED, supersedes: 'd_delta_f1',
    scope: 'Complete manuscript',
  }),
  doc('d_delta_ed', 'p_delta', DOC_TYPES.EDITORS_CERTIFICATE, 1, {
    submittedBy: 'u_gil', submittedAt: days(-8), status: DOC_STATUS.SUBMITTED,
  }),
  doc('d_delta_pl', 'p_delta', DOC_TYPES.PLAGIARISM_CERTIFICATE, 1, {
    submittedBy: 'u_gil', submittedAt: days(-8), status: DOC_STATUS.SUBMITTED,
  }),

  // Group 6 — archived
  doc('d_eps_f1', 'p_epsilon', DOC_TYPES.FINAL_MANUSCRIPT, 3, {
    submittedBy: 'u_hana', submittedAt: days(-45), status: DOC_STATUS.ARCHIVED, scope: 'Complete manuscript',
  }),
]

const review = (id, projectId, documentId, reviewerId, reviewerRole, decision, comment, createdAt) =>
  ({ id, projectId, documentId, reviewerId, reviewerRole, decision, comment, createdAt })

const REVIEWS = [
  review('r_alpha_topic', 'p_alpha', 'd_alpha_topic', 'f_espinosa', P.INSTRUCTOR_1, DECISIONS.APPROVE,
    'Topic 3 approved: workflow automation for thesis and capstone projects.', days(-60)),
  review('r_alpha_cp1', 'p_alpha', 'd_alpha_cp1', 'f_espinosa', P.INSTRUCTOR_1, DECISIONS.MAJOR,
    'The scope reads as all of HAU. Limit it to the School of Computing.', days(-56)),
  review('r_alpha_cp2', 'p_alpha', 'd_alpha_cp2', 'f_espinosa', P.INSTRUCTOR_1, DECISIONS.APPROVE, '', days(-48)),
  review('r_alpha_pm1', 'p_alpha', 'd_alpha_pm1', 'f_tayag', P.ADVISER, DECISIONS.MINOR,
    'Good start. Tighten the literature synthesis before adding the Method.', days(-26)),
  review('r_alpha_pm2', 'p_alpha', 'd_alpha_pm2', 'f_tayag', P.ADVISER, DECISIONS.MAJOR,
    'The sampling design does not yet match the population you describe, and the instruments need their validation steps. See the annotations.',
    days(-4)),
  review('r_beta_1', 'p_beta', 'd_beta_m1', 'f_pineda', P.ADVISER, DECISIONS.MAJOR,
    'The review of related literature needs at least five more recent local studies. Objective 3 is not measurable yet — name the metric.',
    days(-32)),
  review('r_beta_2', 'p_beta', 'd_beta_m2', 'f_pineda', P.ADVISER, DECISIONS.APPROVE,
    'Revisions addressed. Ready for Instructor 1 to approve for the proposal defense.', days(-16)),
]

const note = (id, projectId, documentId, authorId, authorRole, anchor, category, text, extra = {}) => ({
  id, projectId, documentId, authorId, authorRole, anchor, category, text,
  visibility: 'shared', status: A.OPEN, releasedAt: null, sentAt: extra.createdAt ?? days(-4),
  studentResponse: '', respondedBy: null, respondedAt: null, createdAt: days(-4), ...extra,
})

const ANNOTATIONS = [
  // Group 5 — sent with the v2 "Return for major revisions" feedback
  note('an_a1', 'p_alpha', 'd_alpha_pm2', 'f_tayag', P.ADVISER, 'p. 41 · Sampling', 'Methodology Concern',
    'Cochran’s formula gives 264 students, but the text says “all fourth-year students”. Pick one and justify it.'),
  note('an_a2', 'p_alpha', 'd_alpha_pm2', 'f_tayag', P.ADVISER, 'p. 44 · Instruments', 'Required Revision',
    'State who content-validates the functional checklist and how the approval is recorded.'),
  note('an_a3', 'p_alpha', 'd_alpha_pm2', 'f_tayag', P.ADVISER, 'p. 12 · Scope and Delimitations', 'Documentation Issue',
    'The scope still lists the Colloquium Gallery. Remove it — it is not in the requirements.', {
      status: A.RESOLVED, studentResponse: 'Removed the gallery from Scope; the archive is the records table only.',
      respondedBy: 'u_sofia', respondedAt: days(-2),
    }),
  note('an_a0', 'p_alpha', 'd_alpha_cp1', 'f_espinosa', P.INSTRUCTOR_1, 'p. 2 · Scope', 'Required Revision',
    'Limit the scope to the School of Computing.', {
      createdAt: days(-56), sentAt: days(-56), status: A.RESOLVED,
      studentResponse: 'Scope limited to HAU-SOC in v2.', respondedBy: 'u_sofia', respondedAt: days(-51),
    }),

  // Group 3 — private panel notes before the defense
  note('an_1', 'p_beta', 'd_beta_m2', 'f_santos', P.PANEL_CHAIR, 'p. 14 · Sampling', 'Methodology Concern',
    'Ask during deliberation why purposive sampling was chosen over stratified random for the student respondents.',
    { visibility: 'private', sentAt: null }),
  note('an_2', 'p_beta', 'd_beta_m2', 'f_bondoc', P.PANEL_MEMBER, 'p. 9 · Conceptual Framework', 'Documentation Issue',
    'The IPO diagram lists an output that never appears in the objectives.',
    { visibility: 'private', sentAt: null, createdAt: days(-3) }),
  note('an_3', 'p_beta', 'd_beta_m1', 'f_pineda', P.ADVISER, 'p. 22', 'Formatting Issue',
    'Citation format is inconsistent from here onward — use APA 7th.', {
      createdAt: days(-33), sentAt: days(-32), status: A.RESOLVED,
      studentResponse: 'Converted every citation to APA 7th.', respondedBy: 'u_ana', respondedAt: days(-20),
    }),
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

const log = (id, weekNo, submittedBy, ago, accomplishments, nextTasks, status, remarks = '') => ({
  id, projectId: 'p_gamma', weekNo, consultationDate: dateOnly(-ago), consultationMode: weekNo % 2 ? 'Face-to-face' : 'Online',
  accomplishments, nextTasks, submittedBy, submittedAt: days(-ago),
  status, signedBy: status === 'Approved' ? 'f_almocera' : null, signedAt: status === 'Approved' ? days(-ago + 1) : null,
  adviserRemarks: remarks,
})

const WEEKLY_LOGS = [
  log('w_g1', 1, 'u_dina', 21, 'Set up the RFID reader prototype and confirmed tag read range at 40 cm. Drafted the equipment schema.',
    'Implement the check-out and check-in endpoints.', 'Approved', 'Good progress. Document the read-range test properly.'),
  log('w_g2', 2, 'u_elmo', 14, 'Implemented check-out and check-in endpoints and the borrowing history view. Started the overdue notification job.',
    'Integration testing for the borrowing module.', 'Approved', 'Proceed to integration testing.'),
  log('w_g3', 3, 'u_dina', 7, 'Completed integration testing for the borrowing module and fixed the duplicate-tag defect found in week 2.',
    'Start the reports module and draft Chapter 4.', 'Submitted'),
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

// Group 3: the Chair and one member have evaluated; Engr. Bondoc has not, so
// the verdict is still locked.
const EVALUATIONS = [
  {
    id: 'ev_beta_santos', projectId: 'p_beta', defenseId: 'def_beta', panelistId: 'f_santos', submittedAt: days(-1),
    content: { recommendation: 'Minor revisions', strengths: 'Clear problem statement grounded in clinic data.', revisions: 'Justify the sampling method.' },
  },
  {
    id: 'ev_beta_dizon', projectId: 'p_beta', defenseId: 'def_beta', panelistId: 'f_dizon', submittedAt: days(-1),
    content: { recommendation: 'Minor revisions', strengths: 'Realistic scope.', revisions: 'Align the IPO outputs with the objectives.' },
  },
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
    id: 'form_delta_2005', projectId: 'p_delta', formType: FORMS.F2005.code, name: FORMS.F2005.name,
    status: 'Signed', createdAt: days(-35), stage: null, payload: {},
    signatories: [sig(1, P.ADVISER, 'f_bondoc', 'Engr. Marites C. Bondoc', days(-35))],
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
  hist('p_alpha', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-80)),
  hist('p_alpha', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-78)),
  hist('p_alpha', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-72)),
  hist('p_alpha', 'ADVISER_APPROVAL', 'TOPIC_PROPOSAL', 'f_rivera', 'APPROVE_ADVISER', days(-68)),
  hist('p_alpha', 'TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'f_espinosa', 'REGISTER_TOPIC', days(-45)),

  hist('p_zeta', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-9)),
  hist('p_zeta', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-7)),
  hist('p_zeta', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-2)),

  hist('p_theta', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-2)),

  hist('p_beta', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-88)),
  hist('p_beta', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-85)),
  hist('p_beta', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-82)),
  hist('p_beta', 'ADVISER_APPROVAL', 'TOPIC_PROPOSAL', 'f_rivera', 'APPROVE_ADVISER', days(-78)),
  hist('p_beta', 'TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'f_espinosa', 'REGISTER_TOPIC', days(-68)),
  hist('p_beta', 'PROPOSAL_DEVELOPMENT', 'PANEL_ASSIGNMENT', 'f_espinosa', 'APPROVE_FOR_DEFENSE', days(-15)),
  hist('p_beta', 'PANEL_ASSIGNMENT', 'PROPOSAL_DEFENSE_SCHEDULING', 'f_almocera', 'CONFIRM_PANEL', days(-12)),
  hist('p_beta', 'PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'f_almocera', 'SCHEDULE_PROPOSAL_DEFENSE', days(-10)),

  hist('p_gamma', null, 'GROUP_FORMATION', 'f_espinosa', 'GROUP_CREATED', days(-150)),
  hist('p_gamma', 'GROUP_FORMATION', 'ADVISER_ASSIGNMENT', 'f_espinosa', 'ENDORSE_ROSTER', days(-148)),
  hist('p_gamma', 'ADVISER_ASSIGNMENT', 'ADVISER_APPROVAL', 'f_almocera', 'ROUTE_ADVISER', days(-145)),
  hist('p_gamma', 'ADVISER_APPROVAL', 'TOPIC_PROPOSAL', 'f_rivera', 'APPROVE_ADVISER', days(-140)),
  hist('p_gamma', 'TOPIC_PROPOSAL', 'PROPOSAL_DEVELOPMENT', 'f_espinosa', 'REGISTER_TOPIC', days(-125)),
  hist('p_gamma', 'PROPOSAL_DEVELOPMENT', 'PANEL_ASSIGNMENT', 'f_espinosa', 'APPROVE_FOR_DEFENSE', days(-92)),
  hist('p_gamma', 'PANEL_ASSIGNMENT', 'PROPOSAL_DEFENSE_SCHEDULING', 'f_almocera', 'CONFIRM_PANEL', days(-90)),
  hist('p_gamma', 'PROPOSAL_DEFENSE_SCHEDULING', 'PROPOSAL_DEFENSE', 'f_almocera', 'SCHEDULE_PROPOSAL_DEFENSE', days(-88)),
  hist('p_gamma', 'PROPOSAL_DEFENSE', 'PROPOSAL_REVISION', 'f_santos', 'RECORD_PROPOSAL_VERDICT', days(-80)),
  hist('p_gamma', 'PROPOSAL_REVISION', 'IMPLEMENTATION', 'f_espinosa', 'CLOSE_PROPOSAL_REVISION', days(-72)),

  hist('p_delta', 'FINAL_DEFENSE', 'FINAL_REVISION', 'f_santos', 'RECORD_FINAL_VERDICT', days(-20)),
  hist('p_delta', 'FINAL_REVISION', 'CLEARANCE', 'f_lazaro', 'CLOSE_FINAL_REVISION', days(-12)),
  hist('p_delta', 'CLEARANCE', 'URO_VERIFICATION', 'f_almocera', 'ENDORSE_TO_URO', days(-7)),

  hist('p_epsilon', 'URO_VERIFICATION', 'FINAL_APPROVAL', 'f_castro', 'URO_VERIFY', days(-43)),
  hist('p_epsilon', 'FINAL_APPROVAL', 'ARCHIVED', 'f_rivera', 'FINAL_APPROVE', days(-40)),
]

const email = (id, userId, projectId, template, subject, body, sentAt, extra = {}) =>
  ({ id, userId, projectId, template, subject, body, lines: [], link: null, sentAt, ...extra })

// The send record — what Resend delivered. Read only by the System Administrator.
const EMAILS = [
  ...['u_adrian', 'u_cedric', 'u_karl', 'u_sofia'].map(u => email(
    `e_alpha_ret_${u}`, u, 'p_alpha', 'Returned with annotations',
    'Proposal Manuscript v2 returned — return for major revisions',
    'Dr. Marlon I. Tayag (Adviser) reviewed Proposal Manuscript v2 of your project.\n\nRequired changes: The sampling design does not yet match the population you describe, and the instruments need their validation steps. See the annotations.\n\nAdd a resolution note to each annotation, then submit v3.',
    days(-4), {
      lines: [
        'p. 41 · Sampling — Methodology Concern: Cochran’s formula gives 264 students, but the text says “all fourth-year students”.',
        'p. 44 · Instruments — Required Revision: State who content-validates the functional checklist.',
        'p. 12 · Scope and Delimitations — Documentation Issue: The scope still lists the Colloquium Gallery.',
      ],
      link: '/feedback?v=d_alpha_pm2',
    })),
  email('e_beta_def', 'f_santos', 'p_beta', 'Defense scheduled', 'Proposal defense scheduled — Group 3',
    'Tomorrow · SOC Conference Room, 3rd Floor. The defense pack and AI summary are in Assigned Panels.', days(-10)),
  email('e_gamma_log', 'f_almocera', 'p_gamma', 'Weekly log', 'Group 1: week 3 log awaiting your signature',
    'Dina R. Manalili submitted the week 3 accomplishment report.', days(-7), { link: '/logs' }),
]

const AUDIT_LOGS = [
  { id: 'l_1', actorId: 'f_santos', action: 'VERDICT_RECORDED', entityType: 'defenses', entityId: 'def_delta', projectId: 'p_delta', at: days(-20), meta: { verdict: VERDICTS.MINOR } },
  { id: 'l_2', actorId: 'f_almocera', action: 'SIGNATURE_APPLIED', entityType: 'forms', entityId: 'form_delta_approval', projectId: 'p_delta', at: days(-7), meta: { role: G.COORDINATOR } },
  { id: 'l_3', actorId: 'f_rivera', action: 'STAGE_FINAL_APPROVE', entityType: 'projects', entityId: 'p_epsilon', projectId: 'p_epsilon', at: days(-40), meta: { from: 'FINAL_APPROVAL', to: 'ARCHIVED' } },
  { id: 'l_4', actorId: 'f_almocera', action: 'ROLE_ASSIGNED', entityType: 'projectAssignments', entityId: 'a_p_zeta_Adviser_f_tayag', projectId: 'p_zeta', at: days(-3), meta: { userId: 'f_tayag', roleType: P.ADVISER } },
  { id: 'l_5', actorId: 'f_tayag', action: 'FEEDBACK_SENT', entityType: 'reviews', entityId: 'r_alpha_pm2', projectId: 'p_alpha', at: days(-4), meta: { decision: DECISIONS.MAJOR, annotationsReleased: 3 } },
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
    evaluations: keyBy(EVALUATIONS),
    forms: keyBy(FORMS_DATA),
    workflowHistory: keyBy(WORKFLOW_HISTORY),
    emails: keyBy(EMAILS),
    auditLogs: keyBy(AUDIT_LOGS),
  }
}
