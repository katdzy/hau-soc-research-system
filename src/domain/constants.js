// Vocabulary shared by the whole prototype. Names follow the finalized proposal
// manuscript (Requirements Documentation, Tables 1–2, Data Dictionary) and the
// preferred terms in the Capstone 2 knowledge base.

import { FLAGS } from './flags.js'

// Global Roles — the user's institutional position. A user may hold several
// (USER_ROLE is many-to-many) or none: a faculty member who is only ever an
// Adviser or Panel Member holds no Global Role at all, and gets every bit of
// their authority from the projects they are assigned to.
export const GLOBAL_ROLES = {
  STUDENT: 'Student',
  COORDINATOR: 'Program Chair/Coordinator',
  ASSOCIATE_DEAN: 'Associate Dean',
  DEAN: 'Dean',
  URO: 'University Research Office',
  ADMIN: 'System Administrator',
  // NEW-1 (flag FACULTY_BASE_IDENTITY): base identity for faculty accounts. It
  // grants nothing by itself — every faculty permission is project-based.
  FACULTY: 'Faculty',
}

// Project-Based Roles — held per project (Instructor 1 and 2 included, per
// Decision #15). The same person can hold different ones on different projects.
export const PROJECT_ROLES = {
  INSTRUCTOR_1: 'Instructor 1',
  INSTRUCTOR_2: 'Instructor 2',
  ADVISER: 'Adviser',
  PANEL_MEMBER: 'Panel Member',
  PANEL_CHAIR: 'Panel Chair',
}

export const PANEL_ROLES = [PROJECT_ROLES.PANEL_CHAIR, PROJECT_ROLES.PANEL_MEMBER]

// Account type follows the registration domain.
export const EMAIL_DOMAINS = {
  STUDENT: '@student.hau.edu.ph',
  FACULTY: '@hau.edu.ph',
}

/** Trim and lower-case — "  Name@HAU.edu.ph " and "name@hau.edu.ph" are one account. */
export const normalizeEmail = (email = '') => String(email ?? '').trim().toLowerCase()

// Exact domain match: rejects look-alikes such as name@evilhau.edu.ph,
// hau.edu.ph.evil.com and name@fake.student.hau.edu.ph.
const INSTITUTIONAL = /^[^\s@]+@(student\.)?hau\.edu\.ph$/

export const accountType = (email = '') => {
  const e = normalizeEmail(email)
  if (!INSTITUTIONAL.test(e)) return null
  return e.endsWith(EMAIL_DOMAINS.STUDENT) ? 'Student' : 'Faculty'
}
export const isInstitutionalEmail = (email) => accountType(email) !== null

// USER.account_status enumeration (Data Dictionary I-1).
export const ACCOUNT_STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Suspended' }

// REVIEW.decision enumeration (Data Dictionary I-9).
export const DECISIONS = {
  APPROVE: 'Approve',
  MINOR: 'Approve with Minor Revisions',
  MAJOR: 'Return for Major Revisions',
  REJECT: 'Reject',
  ENDORSE: 'Endorse to Next Stage',
}

// REVIEW.category enumeration — used for annotations.
export const ANNOTATION_CATEGORIES = [
  'General Comment', 'Technical Concern', 'Methodology Concern', 'Documentation Issue',
  'Formatting Issue', 'Required Revision', 'Recommendation',
]

// The Panel Chair's verdicts and the revision countdown live in flags.js
// (VERDICT_VALUES — OQ#10, REVISION_DAYS) and are re-exported from there.
export const VERDICTS = FLAGS.VERDICT_VALUES
export const REVISION_WINDOW_DAYS = FLAGS.REVISION_DAYS

// DOCUMENT.status enumeration (Data Dictionary I-7).
export const DOC_STATUS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  FOR_REVISION: 'For Revision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
}

export const DOC_TYPES = {
  TOPIC_PROPOSAL: 'Topic Proposal',
  CONCEPT_PAPER: 'Concept Paper',
  PROPOSAL_MANUSCRIPT: 'Proposal Manuscript',
  FINAL_MANUSCRIPT: 'Final Manuscript',
  REVISED_MANUSCRIPT: 'Revised Manuscript',
  EDITORS_CERTIFICATE: "Editor's Certificate",
  PLAGIARISM_CERTIFICATE: 'Plagiarism Clearance Certificate',
  DEPLOYMENT_INFO: 'Deployment Information',
  // Videos are never stored — students submit a link to an external host.
  PRESENTATION_VIDEO: 'Presentation Video (link)',
}

export const LINK_TYPES = [DOC_TYPES.PRESENTATION_VIDEO]

// S3.1 — the group proposes five topics in one Topic Proposal version.
export const TOPIC_COUNT = 5

// Upload checks shared by the form and the service, so both say the same thing.
export const MAX_PDF_MB = 25
export const isPdfFile = (name = '', type = '') =>
  /\.pdf$/i.test(String(name).trim()) && (!type || type === 'application/pdf')

/** A full http(s) link to a named host, e.g. https://youtu.be/abc — not "https://x". */
export function isVideoLink(value = '') {
  try {
    const u = new URL(String(value).trim())
    return ['http:', 'https:'].includes(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname)
  } catch {
    return false
  }
}

/** Why a set of proposed topics is not acceptable, or null. */
export function topicsProblem(topics) {
  const list = (topics ?? []).map(t => String(t ?? '').trim())
  if (list.length !== TOPIC_COUNT || list.some(t => !t)) return `Propose all ${TOPIC_COUNT} topics.`
  if (new Set(list.map(t => t.toLowerCase())).size !== list.length) return 'Each proposed topic must be different.'
  if (list.some(t => t.length > 200)) return 'Keep each topic under 200 characters.'
  return null
}

// Certificates, deployment information and video links are verified at
// clearance; only these types go through annotation and a review decision.
export const REVIEWABLE_TYPES = [
  DOC_TYPES.TOPIC_PROPOSAL, DOC_TYPES.CONCEPT_PAPER,
  DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT,
]

// AI summaries are generated only for the complete manuscript at these two
// milestones (FR "AI-assisted manuscript summaries").
export const AI_MILESTONES = {
  Proposal: { milestone: 'Proposal Defense', docType: DOC_TYPES.PROPOSAL_MANUSCRIPT },
  Final: { milestone: 'Final Defense', docType: DOC_TYPES.FINAL_MANUSCRIPT },
}
export const AI_DISCLOSURE =
  'AI-generated summary (Gemini Flash). Machine-generated and for decision support only — ' +
  'it is not an evaluation and does not replace reading the manuscript.'

// S6.5 — the Capstone 2 milestones Instructor 2 confirms, one flag each.
export const CAPSTONE2_MILESTONES = [
  { key: 'revisedManuscript', label: 'Revised manuscript' },
  { key: 'systemComponents', label: 'System components' },
]

export const FORMS = {
  F2003: { code: 'FM-AAC-SOC-2003', name: 'Attendance Monitoring and Activity Sheet' },
  F2004: { code: 'FM-AAC-SOC-2004', name: 'Capstone Revision Form' },
  F2005: { code: 'FM-AAC-SOC-2005', name: 'Capstone Recommendation Form' },
  APPROVAL: { code: 'Approval Sheet', name: 'Approval Sheet' },
}

// --- Programs, courses and sections -----------------------------------------
// The School of Computing's five programs, with the year level and semester in
// which each takes Capstone 1 and Capstone 2. Every program takes both in 4th
// year (1st, then 2nd semester) — except Computer Science, which starts
// Capstone 1 in 3rd year 2nd semester and takes Capstone 2 in 4th year 1st semester.

export const COURSES = { C1: 'Capstone 1', C2: 'Capstone 2' }

const IN_4TH_YEAR = { [COURSES.C1]: { year: 4, semester: 1 }, [COURSES.C2]: { year: 4, semester: 2 } }

export const PROGRAM_INFO = [
  { code: 'WD', name: 'Bachelor of Science Major in Information Technology with area of specialization in Web Development', capstone: IN_4TH_YEAR },
  { code: 'NW', name: 'Bachelor of Science Major in Information Technology with area of specialization in Network Administration', capstone: IN_4TH_YEAR },
  {
    code: 'CS', name: 'Bachelor of Science Major in Computer Science',
    capstone: { [COURSES.C1]: { year: 3, semester: 2 }, [COURSES.C2]: { year: 4, semester: 1 } },
  },
  { code: 'EMC', name: 'Bachelor of Science Major in Entertainment and Multimedia Computing', capstone: IN_4TH_YEAR },
  { code: 'CYB', name: 'Bachelor of Science Major in Cybersecurity', capstone: IN_4TH_YEAR },
]

export const PROGRAMS = PROGRAM_INFO.map(p => p.name)
export const programInfo = (name) => PROGRAM_INFO.find(p => p.name === name) ?? null
export const programByCode = (code) => PROGRAM_INFO.find(p => p.code === String(code ?? '').toUpperCase()) ?? null
/** Short label for tight spots: "WD", "CS"… (the full name stays the stored value). */
export const programCode = (name) => programInfo(name)?.code ?? name

const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
export const yearLabel = (year) => `${ORDINAL[year] ?? year} Year`
export const semesterLabel = (semester) => `${ORDINAL[semester] ?? semester} Semester`

/** When a program takes a course, e.g. "4th Year, 1st Semester". */
export function courseSchedule(program, course) {
  const at = programInfo(program)?.capstone[course]
  return at ? `${yearLabel(at.year)}, ${semesterLabel(at.semester)}` : ''
}

// Sections are named program code - year level - two-digit number: WD-401,
// WD-402 … and CS-301 (Capstone 1) → CS-401 (Capstone 2).
const SECTION = /^([A-Z]+)-([1-4])(\d{2})$/

export const normalizeSection = (value = '') => String(value ?? '').trim().toUpperCase()

export function parseSection(value) {
  const m = SECTION.exec(normalizeSection(value))
  const info = m && programByCode(m[1])
  return info ? { code: info.code, program: info.name, year: Number(m[2]), number: m[3] } : null
}

/**
 * Why a section name does not fit, or null. With a course, the section's year
 * level must be the year the program takes that course; without one, either
 * capstone year is accepted.
 */
export function sectionProblem(value, program, course = null) {
  const s = parseSection(value)
  const example = `${programInfo(program)?.code ?? 'WD'}-${programInfo(program)?.capstone[COURSES.C1].year ?? 4}01`
  if (!s) return `Enter the section as program code, year level and number, e.g. ${example}.`
  if (program && s.program !== program) return `${normalizeSection(value)} is not a ${programInfo(program)?.code ?? program} section.`
  const years = Object.entries(programInfo(s.program).capstone)
    .filter(([c]) => !course || c === course).map(([, at]) => at.year)
  if (!years.includes(s.year)) {
    return `${s.code} students take ${course ?? 'the capstone courses'} in ${[...new Set(years)].map(yearLabel).join(' or ')}.`
  }
  return null
}

/** Year level implied by a section: WD-401 → "4th Year". */
export const yearLevelOf = (value) => (parseSection(value) ? yearLabel(parseSection(value).year) : '')

/** The Capstone 2 section that follows a Capstone 1 section: same number, at the program's Capstone 2 year (CS-301 → CS-401). */
export function capstone2SectionOf(value) {
  const s = parseSection(value)
  if (!s) return normalizeSection(value)
  const year = programInfo(s.program).capstone[COURSES.C2].year
  return `${s.code}-${year}${s.number}`
}

/** "AY 2025–2026, 2nd Semester" → "AY 2026–2027, 1st Semester"; 1st → 2nd within the year. */
export function nextSemester(term = '') {
  const m = /^AY (\d{4})–(\d{4}), (1st|2nd) Semester$/.exec(term)
  if (!m) return term
  const [from, to] = [Number(m[1]), Number(m[2])]
  return m[3] === '1st' ? `AY ${from}–${to}, 2nd Semester` : `AY ${from + 1}–${to + 1}, 1st Semester`
}
