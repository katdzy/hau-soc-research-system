// NPC accounts: filler students and faculty so every program has three
// capstone groups of four (flag GROUP_SIZE). They are not §6 personas and no
// §7 scenario depends on them; they give the queues, reports and rosters
// realistic volume. Every name is a placeholder.
//
// The term is AY 2026–2027, 1st Semester, so:
//   WD, NW, EMC, CYB  4th year, Capstone 1 — groups spread over the Capstone 1 stages
//   CS                4th year, Capstone 2 — CS took Capstone 1 last term (CS-301/302),
//                     so its groups are in Capstone 2 now (CS-401/402)
//
// WD's three groups are the persona groups G1, G2 and G4, and CS's first is G3;
// NPC students top those up to four members.

import { GLOBAL_ROLES as G, PROJECT_ROLES as P, COURSES, programByCode, yearLevelOf } from '../domain/constants.js'

const days = (n) => new Date(Date.now() + n * 864e5).toISOString()
const TERM = 'AY 2026–2027, 1st Semester'
const LAST_TERM = 'AY 2025–2026, 2nd Semester'

const FIRST = [
  'Angelo', 'Bea', 'Carlo', 'Danica', 'Enzo', 'Francine', 'Gabriel', 'Hannah', 'Ivan', 'Janelle',
  'Kristoff', 'Lianne', 'Marco', 'Nicole', 'Oliver', 'Patricia', 'Rafael', 'Samantha', 'Tristan', 'Venice',
  'Warren', 'Ysabel', 'Zach', 'Alyssa', 'Bryan', 'Czarina',
]
const LAST = [
  'Aquino', 'Bautista', 'Castillo', 'Dela Cruz', 'Estrada', 'Flores', 'Garcia', 'Hernandez', 'Ignacio',
  'Jimenez', 'Lacson', 'Manalo', 'Navarro', 'Ocampo', 'Pangilinan', 'Quiambao', 'Reyes', 'Santos',
  'Tolentino', 'Villanueva', 'Yap', 'Zamora', 'Mercado', 'Salazar', 'Gutierrez', 'Dizon',
]
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '')

let studentSeq = 0
function npcStudent(section) {
  const i = studentSeq++
  const first = FIRST[i % FIRST.length]
  const last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]
  const code = section.split('-')[0].toLowerCase()
  return {
    id: `s_npc_${code}_${String(i + 1).padStart(2, '0')}`,
    name: `${first} ${last}`,
    email: `${slug(first)}.${slug(last)}${i + 1}@student.hau.edu.ph`,
    globalRoles: [G.STUDENT], programScope: [], status: 'Active', emailVerified: true, verifyToken: null,
    idNumber: `2022-${String(3001 + i)}`, program: programByCode(code).name, yearLevel: yearLevelOf(section),
    block: section, createdAt: days(-200), npc: true,
  }
}

function npcFaculty(id, name, globalRoles = [], extra = {}) {
  const [first, ...rest] = name.replace(/^Prof\. /, '').split(' ')
  return {
    id, name, email: `${slug(first)}.${slug(rest.join(''))}@hau.edu.ph`,
    globalRoles: [G.FACULTY, ...globalRoles], programScope: [], status: 'Active', emailVerified: true,
    verifyToken: null, idNumber: '', program: '', yearLevel: '', block: '', createdAt: days(-400), npc: true, ...extra,
  }
}

// Four faculty per program: [0] teaches the Capstone 1 section (Instructor 1;
// Instructor 2 for CS), [1] coordinates the program (CS is Prof. Alpha's),
// [2] and [3] advise and sit on panels.
const FACULTY = {
  NW: ['Prof. Ramon Dizon', 'Prof. Teresa Lim', 'Prof. Arnel Cruz', 'Prof. Joy Valdez'],
  EMC: ['Prof. Paolo Serrano', 'Prof. Grace Tan', 'Prof. Miguel Ramos', 'Prof. Ella Cabrera'],
  CYB: ['Prof. Victor Soriano', 'Prof. Liza Fernandez', 'Prof. Noel Pascual', 'Prof. Rina Aguilar'],
  CS: ['Prof. Dennis Uy', 'Prof. Maricel Robles', 'Prof. Jomar Enriquez', 'Prof. Katrina Sy'],
}
const fid = (code, n) => `f_npc_${code.toLowerCase()}${n}`

export const NPC_FACULTY = Object.entries(FACULTY).flatMap(([code, names]) => names.map((name, n) => {
  const coordinates = n === 1 && code !== 'CS'
  return npcFaculty(fid(code, n), name, coordinates ? [G.COORDINATOR] : [],
    coordinates ? { programScope: [programByCode(code).name] } : {})
}))

// Capstone 1 sections taught this term (CS has none: its Capstone 1 was last term).
export const NPC_SECTIONS = ['NW', 'EMC', 'CYB'].map(code => ({
  id: `sec_${code.toLowerCase()}401`, course: COURSES.C1, block: `${code}-401`, program: programByCode(code).name,
  yearLevel: yearLevelOf(`${code}-401`), term: TERM, instructorId: fid(code, 0),
}))

const roles = (code, adviser, chair, member) => ({
  [P.INSTRUCTOR_1]: fid(code, 0),
  [P.ADVISER]: fid(code, adviser),
  [P.PANEL_CHAIR]: fid(code, chair),
  [P.PANEL_MEMBER]: [fid(code, member)],
  [P.INSTRUCTOR_2]: fid(code, 0),
})

/**
 * The NPC groups: id, program code, Capstone 1 section, the section its
 * students are in now, the stage, the title (null = not registered yet) and
 * who holds each project role.
 */
const GROUPS = [
  ['p_nw1', 'NW', 'NW-401', 'NW-401', 'PROPOSAL_DEVELOPMENT', 'Network Traffic Anomaly Dashboard for Campus Wi-Fi', roles('NW', 2, 3, 1)],
  ['p_nw2', 'NW', 'NW-401', 'NW-401', 'ADVISER_ASSIGNMENT', null, roles('NW', 3, 2, 1)],
  ['p_nw3', 'NW', 'NW-401', 'NW-401', 'PANEL_ASSIGNMENT', 'Automated VLAN Provisioning Tool for Computer Laboratories', roles('NW', 3, 2, 1)],
  ['p_emc1', 'EMC', 'EMC-401', 'EMC-401', 'TOPIC_PROPOSAL', null, roles('EMC', 2, 3, 1)],
  ['p_emc2', 'EMC', 'EMC-401', 'EMC-401', 'PROPOSAL_DEFENSE_SCHEDULING', 'Augmented Reality Campus Heritage Tour', roles('EMC', 3, 2, 1)],
  ['p_emc3', 'EMC', 'EMC-401', 'EMC-401', 'PROPOSAL_REVISION', 'Serious Game for Kapampangan Language Learning', roles('EMC', 2, 3, 1)],
  ['p_cyb1', 'CYB', 'CYB-401', 'CYB-401', 'ADVISER_APPROVAL', null, roles('CYB', 2, 3, 1)],
  ['p_cyb2', 'CYB', 'CYB-401', 'CYB-401', 'PROPOSAL_DEVELOPMENT', 'Phishing Awareness Simulator for University Staff', roles('CYB', 3, 2, 1)],
  ['p_cyb3', 'CYB', 'CYB-401', 'CYB-401', 'GROUP_FORMATION', null, roles('CYB', 2, 3, 1)],
  ['p_cs2', 'CS', 'CS-301', 'CS-401', 'IMPLEMENTATION', 'Handwritten Filipino Text Recognition Using CNNs', roles('CS', 2, 3, 1)],
  ['p_cs3', 'CS', 'CS-302', 'CS-402', 'FINAL_DEFENSE_SCHEDULING', 'Course Recommendation Engine Using Collaborative Filtering', roles('CS', 3, 2, 1)],
]

const groupNumber = (id) => Number(id.replace(/\D/g, ''))

export const NPC_PROJECTS = GROUPS.map(([id, code, block, , , title]) => ({
  id, block, program: programByCode(code).name, term: code === 'CS' ? LAST_TERM : TERM,
  sectionId: code === 'CS' ? null : `sec_${code.toLowerCase()}401`,
  title: title ?? `Untitled — Group ${groupNumber(id)} (${block})`,
  researchArea: title ? ({ NW: 'Networking', EMC: 'Multimedia and Games', CYB: 'Information Security', CS: 'Machine Learning' })[code] : 'Not yet set',
}))

export const NPC_ROLES = Object.fromEntries(GROUPS.map(g => [g[0], g[6]]))
export const NPC_STAGES = Object.fromEntries(GROUPS.map(g => [g[0], g[4]]))

// Four students per NPC group, in the section they are in now…
const groupStudents = GROUPS.map(([id, , , now]) => [id, [0, 1, 2, 3].map(() => npcStudent(now))])
// …and enough to bring the persona groups to four (G1 has 3; G2, G3, G4 have 2).
const TOP_UPS = [['p_g1', 'WD-401', 1], ['p_g2', 'WD-401', 2], ['p_g3', 'CS-401', 2], ['p_g4', 'WD-401', 2]]
const topUpStudents = TOP_UPS.map(([id, now, n]) => [id, Array.from({ length: n }, () => npcStudent(now))])

export const NPC_STUDENTS = [...groupStudents, ...topUpStudents].flatMap(([, list]) => list)
export const NPC_MEMBERS = [...groupStudents, ...topUpStudents].flatMap(([projectId, list]) =>
  list.map(u => ({ id: `m_${projectId}_${u.id}`, projectId, userId: u.id, joinedAt: days(-60) })))
