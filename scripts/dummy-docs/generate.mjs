#!/usr/bin/env node
// Generates the dummy documents for testing submissions and deliverables of
// every role: topic proposals, concept papers, proposal and final manuscripts
// for each phase, deployment information, certificates, and the FM-AAC-SOC
// forms (filled and blank). Names come from the app's seed (§6 personas + NPCs),
// so a file for G2 lists G2's real members, Adviser and panel.
//
//   node scripts/dummy-docs/generate.mjs            → test-fixtures/dummy-documents/
//   node scripts/dummy-docs/generate.mjs --only p_g2
//
// Needs Google Chrome (headless print to PDF; override with CHROME_PATH).
// On macOS it also merges each manuscript's front matter (roman page numbers)
// with its body (arabic) and fills the table of contents with real page
// numbers, using PDFKit through osascript. Elsewhere the two parts are kept as
// separate PDFs and the table of contents shows "-".

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

import { buildSeed, SEED_ROLES } from '../../src/backend/seed.js'
import { PROJECT_ROLES as P, GLOBAL_ROLES as G, programInfo, capstone2SectionOf } from '../../src/domain/constants.js'
import { PROJECTS } from './content.js'
import * as T from './templates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const OUT = join(ROOT, 'test-fixtures', 'dummy-documents')
const TMP = join(tmpdir(), `hausoc-dummy-docs-${process.pid}`)
const CHROME = process.env.CHROME_PATH ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync)
const MAC = process.platform === 'darwin'
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

if (!CHROME) {
  console.error('Google Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.')
  process.exit(1)
}

// --- Assets ----------------------------------------------------------------------

const dataUri = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null)
const sealSrc = { hau: dataUri(join(HERE, 'assets', 'hau-seal.png')), soc: dataUri(join(HERE, 'assets', 'soc-seal.png')) }

// --- Printing ----------------------------------------------------------------------

let seq = 0
function printPdf(html, outFile) {
  const src = join(TMP, `doc-${seq++}.html`)
  writeFileSync(src, html)
  mkdirSync(dirname(outFile), { recursive: true })
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--hide-scrollbars',
    `--print-to-pdf=${outFile}`, `file://${src}`,
  ], { stdio: 'ignore' })
  if (!existsSync(outFile)) throw new Error(`Chrome did not write ${outFile}`)
}

function screenshotJpg(html, outFile) {
  const src = join(TMP, `shot-${seq++}.html`)
  const png = join(TMP, `shot-${seq++}.png`)
  writeFileSync(src, html)
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=816,1056', `--screenshot=${png}`, `file://${src}`], { stdio: 'ignore' })
  if (MAC) execFileSync('sips', ['-s', 'format', 'jpeg', png, '--out', outFile], { stdio: 'ignore' })
  else writeFileSync(outFile.replace(/\.jpg$/, '.png'), readFileSync(png))
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
const pdfkit = (...args) => execFileSync('osascript', ['-l', 'JavaScript', join(HERE, 'pdfkit.js'), ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim()

/** Front matter + body as one PDF, with the TOC's page numbers read from the printed body. */
function printManuscript(ctx, outFile) {
  const first = T.manuscriptParts(ctx)
  const bodyPdf = join(TMP, `body-${seq++}.pdf`)
  printPdf(first.body, bodyPdf)
  if (!MAC) {
    printPdf(first.front, outFile.replace(/\.pdf$/, '_FrontMatter.pdf'))
    printPdf(first.body, outFile)
    return
  }
  const pages = pdfkit('text', bodyPdf).split('\f')
  const tocPages = Object.fromEntries(first.markers.map(id => [id, String(pages.findIndex(t => t.includes(`§${id}§`)) + 1 || '-')]))
  const frontPdf = join(TMP, `front-${seq++}.pdf`)
  printPdf(T.manuscriptParts(ctx, tocPages).front, frontPdf)
  // A long table of contents runs onto a second page; the Summary of Revisions follows it.
  const revAt = pdfkit('text', frontPdf).split('\f').findIndex(t => t.includes('§REV§'))
  if (revAt >= 0 && ROMAN[revAt] !== 'v') printPdf(T.manuscriptParts(ctx, tocPages, { rev: ROMAN[revAt] }).front, frontPdf)
  mkdirSync(dirname(outFile), { recursive: true })
  pdfkit('merge', outFile, frontPdf, bodyPdf)
}

// --- Profiles from the seed ----------------------------------------------------------

const seed = buildSeed()
const nameOf = (id) => seed.users[id]?.name ?? id
const officeHolder = (role, program) => Object.values(seed.users).find(u =>
  (u.globalRoles ?? []).includes(role) && (role !== G.COORDINATOR || (u.programScope ?? []).includes(program)))?.name

function profile(pid) {
  const project = seed.projects[pid]
  const roles = SEED_ROLES[pid]
  const info = programInfo(project.program)
  const members = Object.values(seed.projectMembers).filter(m => m.projectId === pid)
    .map(m => seed.users[m.userId]).map(u => ({ name: u.name, idNumber: u.idNumber }))
  const n = Number(pid.replace(/\D/g, ''))
  const c2Section = capstone2SectionOf(project.block)
  return {
    pid, n, members,
    degree: project.program.replace('Major in ', 'in ').replace('area of specialization', 'Area of Specialization'),
    programShort: info.code === 'CS' ? 'Computer Science' : 'Information Technology',
    section: `${project.block} (Capstone 1) → ${c2Section} (Capstone 2)`,
    term: project.term,
    prefix: `${c2Section.replace('-', '')}_Group${String(n).padStart(2, '0')}`,
    groupLabel: `Group ${n}`,
    faculty: {
      instructor1: nameOf(roles[P.INSTRUCTOR_1]),
      instructor2: nameOf(roles[P.INSTRUCTOR_2]),
      adviser: nameOf(roles[P.ADVISER]),
      panelChair: nameOf(roles[P.PANEL_CHAIR]),
      panelMembers: [roles[P.PANEL_MEMBER]].flat().filter(Boolean).map(nameOf),
      coordinator: officeHolder(G.COORDINATOR, project.program),
      dean: officeHolder(G.DEAN), associateDean: officeHolder(G.ASSOCIATE_DEAN), uro: officeHolder(G.URO),
    },
  }
}

// --- Calendar: Capstone 1 then Capstone 2, one date per deliverable -------------------

const lcFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1)
const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const monthYear = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
function calendar(pid) {
  // G3 (CS) took Capstone 1 last term; the WD groups take it this term.
  const c1 = pid === 'p_g3' ? new Date('2026-01-12') : new Date('2026-08-10')
  const c2 = pid === 'p_g3' ? new Date('2026-08-10') : new Date('2027-01-11')
  const w = (start, weeks) => new Date(start.getTime() + weeks * 7 * 864e5)
  return {
    topics: w(c1, 5), concept1: w(c1, 7), concept2: w(c1, 8), draft: w(c1, 10), proposal: w(c1, 12), proposalDefense: w(c1, 13), proposalRevised: w(c1, 14),
    logs: [1, 2, 3, 4, 5, 6].map(k => w(c2, k)), finalDraft: w(c2, 8), deploy: w(c2, 10), recommend: w(c2, 11), final: w(c2, 12),
    finalDefense: w(c2, 13), finalRevised: w(c2, 14), editor: w(c2, 15), plagiarism: w(c2, 15.3), approval: w(c2, 15.6),
  }
}

// --- Documents -----------------------------------------------------------------------

const index = [] // rows for the README
function emit(p, folder, name, meta, make) {
  const file = join(OUT, `G${p.n}`, folder, `${p.prefix}_${name}`)
  make(file)
  index.push({ group: `G${p.n}`, path: file.slice(OUT.length + 1), ...meta })
  process.stdout.write('.')
}

function generateGroup(pid) {
  const p = profile(pid)
  const x = PROJECTS[pid]
  const cal = calendar(pid)
  const slug = x.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const base = { p, x, sealSrc, slug, letterDate: fmt(cal.topics) }
  const ms = (phase, date, extra = {}) => ({ ...base, phase, date: monthYear(date), ...extra })

  const P1 = '1-conceptualization', P2 = '2-proposal-development', P3 = '3-proposal-defense',
    P4 = '4-implementation', P5 = '5-final-defense', P6 = '6-final-revision', P7 = '7-clearance'

  emit(p, P1, 'TopicProposal.pdf', { stage: 'Topic Proposal', step: 'S3.1', role: 'Student uploads', type: 'Topic Proposal', note: 'Type the five topics into the form; attach this PDF.' },
    f => printPdf(T.topicProposal({ ...base, date: fmt(cal.topics) }), f))
  emit(p, P1, 'ConceptPaper_v1.pdf', { stage: 'Topic Proposal', step: 'S3.5', role: 'Student uploads', type: 'Concept Paper', note: 'After the topic is registered. Return it (I1/Adviser) to test the version loop.' },
    f => printPdf(T.conceptPaper({ ...base, version: 1 }), f))
  emit(p, P1, 'ConceptPaper_v2_Revised.pdf', { stage: 'Topic Proposal', step: 'S3.6', role: 'Student uploads', type: 'Concept Paper', note: 'v2 after a return; v1 becomes Superseded. I1 approval moves the stage.' },
    f => printPdf(T.conceptPaper({ ...base, version: 2 }), f))

  emit(p, P2, 'ProposalManuscript_v1_Draft.pdf', { stage: 'Proposal Development', step: 'S4.1', role: 'Student uploads', type: 'Proposal Manuscript', note: 'Chapters to the Conceptual Framework. Return it (Adviser or I1).' },
    f => printManuscript(ms('proposal-draft', cal.draft), f))
  emit(p, P2, 'ProposalManuscript_v2.pdf', { stage: 'Proposal Development / Proposal Defense', step: 'S4.1, S5.3', role: 'Student uploads', type: 'Proposal Manuscript', note: 'Complete proposal (Introduction to Method). Adviser approves; also the defense copy after scheduling.' },
    f => printManuscript(ms('proposal', cal.proposal), f))

  emit(p, P3, 'FM-AAC-SOC-2004_ProposalDefense.pdf', { stage: 'Proposal Defense', step: 'S5.6', role: 'Panel Chair (reference)', type: '— (form)', note: 'Paper version of the verdict the Panel Chair records digitally: Minor revisions, Chair signed.' },
    f => printPdf(T.fm2004({ ...base, type: 'Proposal', verdict: 'Minor', defenseDate: fmt(cal.proposalDefense), room: 'SOC Conference Room' }), f))
  emit(p, P3, 'RevisedManuscript_Proposal.pdf', { stage: 'Proposal Defense · Revisions', step: 'S5.7', role: 'Student uploads', type: 'Revised Manuscript', note: 'With a Summary of Revisions. Adviser approves, then signs FM-2004.' },
    f => printManuscript(ms('proposal-revised', cal.proposalRevised, { defenseDate: fmt(cal.proposalDefense) }), f))

  emit(p, P4, 'FM-AAC-SOC-2003_MonitoringForm.pdf', { stage: 'Implementation', step: 'S6.1–S6.2', role: 'Student / Adviser (reference)', type: '— (form)', note: 'Six weekly entries signed by the Adviser — use the entries as weekly-log text.' },
    f => printPdf(T.fm2003({ ...base, logs: cal.logs.map((d, i) => ({ date: fmt(d), signed: true, text: i < x.frs.length ? `Sprint ${Math.floor(i / 2) + 1}: worked on ${x.frs[i][0]} — ${lcFirst(x.frs[i][2])}. Demonstrated to the Adviser; next: ${x.frs[i + 1] ? lcFirst(x.frs[i + 1][2]) : 'testing and documentation'}.` : 'Testing with the functionality checklist; fixed the defects found.' })) }), f))
  emit(p, P4, 'FinalManuscript_v1_Draft.pdf', { stage: 'Implementation', step: 'S6.3', role: 'Student uploads', type: 'Final Manuscript', note: 'Capstone 2 draft with partial Results. Adviser returns or approves.' },
    f => printManuscript(ms('final-draft', cal.finalDraft), f))
  emit(p, P4, 'DeploymentInformation.pdf', { stage: 'Implementation', step: 'S6.6', role: 'Student uploads', type: 'Deployment Information', note: 'Placeholder URLs only.' },
    f => printPdf(T.deploymentInfo({ ...base, date: fmt(cal.deploy) }), f))
  emit(p, P4, 'FM-AAC-SOC-2005_Recommended.pdf', { stage: 'Implementation', step: 'S6.7', role: 'Adviser (reference)', type: '— (form)', note: 'Paper version of the Adviser’s digital FM-2005.' },
    f => printPdf(T.fm2005({ ...base, recommended: true }), f))
  emit(p, P4, 'FM-AAC-SOC-2005_NotRecommended.pdf', { stage: 'Implementation', step: 'S6.7', role: 'Adviser (reference)', type: '— (form)', note: 'Negative case: not recommended, with reasons and the group’s acknowledgment.' },
    f => printPdf(T.fm2005({ ...base, recommended: false }), f))

  emit(p, P5, 'FinalManuscript_v2.pdf', { stage: 'Implementation / Final Defense', step: 'S6.3, S7.4', role: 'Student uploads', type: 'Final Manuscript', note: 'Complete, with abstract, Results, Discussion, Conclusion and Recommendations. The defense copy after scheduling.' },
    f => printManuscript(ms('final', cal.final), f))
  emit(p, P5, 'FM-AAC-SOC-2004_FinalDefense.pdf', { stage: 'Final Defense', step: 'S7.6', role: 'Panel Chair (reference)', type: '— (form)', note: 'Verdict: Minor revisions, Chair signed.' },
    f => printPdf(T.fm2004({ ...base, type: 'Final', verdict: 'Minor', defenseDate: fmt(cal.finalDefense), room: 'SOC Conference Room' }), f))

  emit(p, P6, 'RevisedManuscript_Final.pdf', { stage: 'Final Revision', step: 'S8.1', role: 'Student uploads', type: 'Revised Manuscript', note: 'With a Summary of Revisions against the final FM-2004. Adviser approves, then the panel signs.' },
    f => printManuscript(ms('final-revised', cal.finalRevised, { defenseDate: fmt(cal.finalDefense) }), f))
  emit(p, P6, 'FM-AAC-SOC-2004_FinalDefense_SignedOff.pdf', { stage: 'Final Revision', step: 'S8.3–S8.4', role: 'Adviser, Panel (reference)', type: '— (form)', note: 'Same form after the Adviser and panel verified the revisions.' },
    f => printPdf(T.fm2004({ ...base, type: 'Final', verdict: 'Minor', defenseDate: fmt(cal.finalDefense), room: 'SOC Conference Room', panelSigned: true }), f))

  emit(p, P7, 'EditorsCertificate.pdf', { stage: 'Final Requirements (and URO return)', step: 'S9.1', role: 'Student uploads', type: 'Editor’s Certificate', note: 'Upload twice to test a URO return (v1 → v2).' },
    f => printPdf(T.editorsCertificate({ ...base, date: fmt(cal.editor) }), f))
  emit(p, P7, 'PlagiarismClearanceCertificate.pdf', { stage: 'Final Requirements (and URO return)', step: 'S9.2', role: 'Student uploads', type: 'Plagiarism Clearance Certificate', note: '' },
    f => printPdf(T.plagiarismCertificate({ ...base, date: fmt(cal.plagiarism), ref: `${p.prefix}-${cal.plagiarism.getFullYear()}` }), f))
  emit(p, P7, 'ApprovalSheet.pdf', { stage: 'Final Requirements → Final Approval', step: 'S9.3–S9.5', role: 'Adviser, Panel, PC, Dean/AD (reference)', type: '— (form)', note: 'Unsigned, with this group’s names. The app signs it digitally.' },
    f => printPdf(T.approvalSheet({ ...base, defenseDate: fmt(cal.finalDefense) }), f))
  emit(p, P7, 'EditorsCertificate_scan.jpg', { stage: 'Final Requirements', step: 'S9.1 (negative)', role: 'Student uploads', type: 'Editor’s Certificate', note: 'Not a PDF — the upload must be rejected.' },
    f => screenshotJpg(T.editorsCertificate({ ...base, date: fmt(cal.editor) }), f))
}

function generateBlanks() {
  const blank = { p: { members: [], faculty: { panelMembers: [] } }, x: null, sealSrc }
  const out = (name) => join(OUT, 'blank-forms', name)
  const add = (name, html, note) => { printPdf(html, out(name)); index.push({ group: 'Blank', path: `blank-forms/${name}`, stage: '—', step: '—', role: 'Any (printable)', type: '— (form)', note }); process.stdout.write('.') }
  add('FM-AAC-SOC-2003_MonitoringForm_BLANK.pdf', T.fm2003(blank, false), 'Capstone-Thesis Monitoring Form')
  add('FM-AAC-SOC-2004_RevisionForm_BLANK.pdf', T.fm2004(blank, false), 'Capstone Revision Form')
  add('FM-AAC-SOC-2005_RecommendationForm_BLANK.pdf', T.fm2005(blank, false), 'Capstone Recommendation Form')
}

function writeReadme() {
  const groups = ['p_g1', 'p_g2', 'p_g3'].map(profile)
  const table = (rows) => ['| File | Stage | Step | Who | Upload as | Notes |', '|---|---|---|---|---|---|',
    ...rows.map(r => `| \`${r.path}\` | ${r.stage} | ${r.step} | ${r.role} | ${r.type} | ${r.note} |`)].join('\n')
  const md = `# Dummy documents for testing

Generated by \`node scripts/dummy-docs/generate.mjs\` from the app's seed, so every
file names the right group members, Adviser, panel and offices. Layouts follow the
SOC Research Manual (May 2025) and the FM-AAC-SOC forms in Appendix C of the
proposal manuscript. **All content is placeholder; every page says so, and forms
and certificates carry a "DUMMY — FOR TESTING" watermark.**

## Groups

${groups.map(p => `- **G${p.n} — ${PROJECTS[p.pid].title}** (${p.section}). Members: ${p.members.map(m => m.name).join(', ')}. Instructor 1 ${p.faculty.instructor1} · Adviser ${p.faculty.adviser} · Panel Chair ${p.faculty.panelChair} · Panel Member ${p.faculty.panelMembers.join(', ')} · Instructor 2 ${p.faculty.instructor2}.`).join('\n')}

Use **Dev tools → Set project to stage** to put a group at the stage in the table,
then sign in as a member of that group and upload the file under **Documents**.

## Presentation video links (S5.3, S7.4)

Videos are never uploaded; paste one of these as the "Presentation Video (link)":

${groups.map(p => `- G${p.n}: \`https://youtu.be/dummy-g${p.n}-proposal\` (proposal) · \`https://youtu.be/dummy-g${p.n}-final\` (final)`).join('\n')}

Negative case: \`https://x\` is rejected ("Enter the full link…").

## Files

${['G1', 'G2', 'G3', 'Blank'].map(g => `### ${g === 'Blank' ? 'Blank forms' : g}\n\n${table(index.filter(r => r.group === g))}`).join('\n\n')}

## Forms in the app vs these PDFs

The app issues FM-AAC-SOC-2004, FM-AAC-SOC-2005 and the Approval Sheet as digital
forms and records weekly logs (FM-AAC-SOC-2003) as entries, so the form PDFs are
references for what each role fills in and signs — they are not uploaded. The
student uploads are the topic proposal, concept papers, manuscripts, deployment
information and the two certificates.
`
  writeFileSync(join(OUT, 'README.md'), md)
}

// --- Run ---------------------------------------------------------------------------------

mkdirSync(TMP, { recursive: true })
try {
  if (!only) rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const pid of only ? [only] : ['p_g1', 'p_g2', 'p_g3']) generateGroup(pid)
  if (!only) { generateBlanks(); writeReadme() }
  console.log(`\n${index.length} files in ${OUT}${sealSrc.hau ? '' : ' (no seal images: add scripts/dummy-docs/assets/*.png)'}`)
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
