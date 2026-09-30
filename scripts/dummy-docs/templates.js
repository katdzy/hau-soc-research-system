// HTML builders for the dummy documents. Headless Chrome prints them to PDF
// (generate.mjs). Layout follows the HAU-SOC templates: the bordered manuscript
// page (APA 7, Times New Roman 12, double-spaced, 1.5-inch left margin) and the
// FM-AAC-SOC form letterhead with its form-code box. Every page says it is a
// dummy; forms and certificates also carry a "DUMMY — FOR TESTING" watermark.

import { REVISIONS, REFERENCES } from './content.js'

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const paras = (list) => list.map(t => `<p>${esc(t)}</p>`).join('')

const BASE_CSS = `
:root { --maroon: #7b1113; --orange: #c8621b; --ink: #111; --rule: #333; }
* { box-sizing: border-box; }
html, body { margin: 0; color: var(--ink); background: #fff; }
body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; }
table { border-collapse: collapse; width: 100%; }
.watermark { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg);
  font: bold 44pt Arial, sans-serif; color: rgba(123, 17, 19, .08); white-space: nowrap; letter-spacing: 4px; z-index: 0; }
.dummy-note { font-size: 8pt; font-style: italic; color: #666; text-align: center; }
.marker { font-size: 1px; color: #fff; line-height: 0; }
`

// --- Manuscript pages ----------------------------------------------------------

// Page margins (inches). The frame is drawn as the @page background, which
// Chrome paints from the content box's corner without clipping, so it is
// offset by the margins to land on the whole sheet.
const M = { top: 1.3, right: 1.05, bottom: 1.3, left: 1.35 }

/** The bordered HAU page: side rules, the maroon header band and the orange footer band with the SOC seal. */
function frameSvg(socSeal) {
  const pt = (inch) => Math.round(inch * 72 * 10) / 10
  const W = 612, H = 792, L = pt(1.1), R = W - pt(1.0), mid = (L + R) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<g stroke="#7b1113" stroke-width="1.6"><line x1="${L}" y1="0" x2="${L}" y2="${H}"/><line x1="${R}" y1="0" x2="${R}" y2="${H}"/>
<line x1="0" y1="${pt(0.72)}" x2="${W}" y2="${pt(0.72)}"/><line x1="0" y1="${pt(1.0)}" x2="${W}" y2="${pt(1.0)}"/>
<line x1="0" y1="${H - pt(0.9)}" x2="${W}" y2="${H - pt(0.9)}"/><line x1="0" y1="${H - pt(0.38)}" x2="${W}" y2="${H - pt(0.38)}"/></g>
<text x="${mid}" y="${pt(0.93)}" font-family="Times New Roman" font-weight="bold" font-size="15" fill="#7b1113" text-anchor="middle">HOLY ANGEL UNIVERSITY</text>
<text x="${mid}" y="${H - pt(0.56)}" font-family="Times New Roman" font-weight="bold" font-size="15" fill="#c8621b" text-anchor="middle">SCHOOL OF COMPUTING</text>
${socSeal ? `<image x="${W - pt(0.74)}" y="${H - pt(0.87)}" width="${pt(0.46)}" height="${pt(0.46)}" xlink:href="${socSeal}"/>` : ''}
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const MANUSCRIPT_CSS = (numbering, sealSrc) => `${BASE_CSS}
@page { size: 8.5in 11in; margin: ${M.top}in ${M.right}in ${M.bottom}in ${M.left}in;
  background: url("${frameSvg(sealSrc.soc)}") no-repeat -${M.left}in -${M.top}in / 8.5in 11in;
  @top-right { content: counter(page${numbering === 'roman' ? ', lower-roman' : ''}); font: bold 11pt 'Times New Roman';
    vertical-align: bottom; padding-bottom: 0.6in; margin-right: -0.55in; } }
@page cover { @top-right { content: none; } }
main { position: relative; z-index: 2; line-height: 2; }
main p { margin: 0; text-indent: 0.5in; text-align: left; }
main p.noindent, main .center p { text-indent: 0; }
h1, h2, h3 { font-size: 12pt; margin: 0; line-height: 2; }
h1, h2, h3, .tbl-cap { break-after: avoid; }
.figure { break-inside: avoid; }
h1 { text-align: center; }
h2 { text-align: left; }
h3 { font-style: italic; }
.page { break-after: page; }
.page:last-child { break-after: auto; }
.center { text-align: center; }
.cover { page: cover; text-align: center; line-height: 1.35; }
.cover .title { margin-top: 0.45in; font-size: 13pt; text-transform: uppercase; }
.cover .seal-img { width: 2.25in; margin: 0.25in auto; display: block; }
.cover .block { margin-top: 0.3in; }
.cover .note { margin-top: 0.35in; font-size: 9pt; font-style: italic; color: #555; }
.tbl-cap { margin-top: 12pt; line-height: 1.4; }
.tbl-cap b { display: block; }
.tbl-cap i { display: block; }
table.apa { font-size: 10.5pt; line-height: 1.3; margin: 4pt 0 12pt; }
table.apa th, table.apa td { border: 0.75pt solid var(--rule); padding: 4pt 6pt; text-align: left; vertical-align: top; }
table.apa th { background: #efefef; }
ol.objectives { margin: 0 0 0 0.5in; padding-left: 0.3in; }
.toc { line-height: 1.55; }
.toc .row { display: flex; align-items: baseline; }
.toc .row .dots { flex: 1; border-bottom: 1.2pt dotted #444; margin: 0 4pt; transform: translateY(-3pt); }
.toc .sub { padding-left: 0.4in; }
.sig { margin-top: 0.45in; text-align: center; line-height: 1.3; }
.sig .line { width: 2.8in; border-top: 1pt solid #000; margin: 0 auto; }
.sig-row { display: flex; justify-content: space-between; gap: 0.4in; }
.sig-row .sig { flex: 1; }
.rule { border-top: 1pt solid #000; margin: 14pt 0; }
.ipo { display: flex; align-items: stretch; gap: 0.3in; margin: 12pt 0; font-size: 10pt; line-height: 1.35; text-align: center; }
.ipo div { flex: 1; border: 1pt solid #000; padding: 12pt 8pt; }
.ipo b { display: block; margin-bottom: 8pt; }
.ipo span { display: block; margin-bottom: 6pt; }
.flow { display: flex; flex-direction: column; align-items: center; gap: 14pt; margin-top: 12pt; font-size: 10pt; line-height: 1.3; }
.flow div { border: 1pt solid #000; padding: 8pt 18pt; min-width: 2.6in; text-align: center; }
.references p { text-indent: -0.5in; padding-left: 0.5in; }
.letter { line-height: 1.45; }
.letter p { text-indent: 0; margin-bottom: 10pt; }
.status-note { border: 1pt dashed #999; padding: 6pt 10pt; font-size: 10pt; line-height: 1.4; font-style: italic; margin: 10pt 0; }
`

function manuscriptShell(pages, { numbering, sealSrc }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${MANUSCRIPT_CSS(numbering, sealSrc)}</style></head><body>
<main>${pages.join('\n')}</main></body></html>`
}

const PHASE_NOTE = {
  'proposal-draft': 'Proposal manuscript — draft (Introduction to Conceptual Framework). Later sections follow in the complete proposal.',
  proposal: 'Proposal manuscript — complete (Introduction to Method), for the proposal defense.',
  'proposal-revised': 'Proposal manuscript — revised after the proposal defense (see Summary of Revisions).',
  'final-draft': 'Final manuscript — Capstone 2 draft. Results are still being collected.',
  final: 'Final manuscript — complete, for the final oral defense.',
  'final-revised': 'Final manuscript — revised after the final oral defense (see Summary of Revisions).',
}
const isFinal = (phase) => phase.startsWith('final')

function coverPage(ctx) {
  const { p, x, date, sealSrc, phase, docLabel } = ctx
  return `<section class="page cover">
  <div class="title">${esc(x.title)}</div>
  <div class="block">A Capstone Project<br>Presented to the Faculty of the<br>School of Computing<br>Holy Angel University</div>
  ${sealSrc.hau ? `<img class="seal-img" src="${sealSrc.hau}" alt="">` : ''}
  <div class="block">In Partial Fulfillment<br>of the Requirements for the Degree<br>${esc(p.degree)}</div>
  <div class="block">${p.members.map(m => esc(m.name)).join('<br>')}</div>
  <div class="block">${esc(date)}</div>
  <div class="note">${esc(docLabel ?? PHASE_NOTE[phase] ?? '')}<br>Dummy document generated for testing the HAU-SOC Thesis &amp; Capstone prototype. All names, data and references are placeholders.</div>
</section>`
}

export function approvalSheetPage(ctx) {
  const { p, x } = ctx
  const members = p.faculty.panelMembers.length ? p.faculty.panelMembers : ['[Name of Panel Member]']
  return `<section class="page">
  <h1>APPROVAL SHEET</h1>
  <p>This capstone entitled <b>“${esc(x.title.toUpperCase())}”</b>, prepared and submitted in partial fulfillment of the requirements for the degree ${esc(p.degree)} has been examined and is recommended for acceptance and oral examination.</p>
  <div class="sig" style="margin-left:3in"><div class="line"></div><b>${esc(p.faculty.adviser)}</b><br>Adviser</div>
  <div class="rule"></div>
  <h1>ORAL EXAMINATION</h1>
  <div class="center" style="line-height:1.4">Approved by the committee of oral examiners on<br>${esc(ctx.defenseDate ?? '[Date of defense]')}</div>
  <div class="sig"><div class="line"></div><b>${esc(p.faculty.panelChair)}</b><br>Panel Chair</div>
  <div class="sig-row">${[...members, ...(members.length < 2 ? ['[Name of Panel Member]'] : [])].slice(0, 2).map(n => `<div class="sig"><div class="line"></div><b>${esc(n)}</b><br>Panel Member</div>`).join('')}</div>
  <div class="rule"></div>
  <h1>APPROVAL</h1>
  <div class="center" style="line-height:1.4">Accepted and approved in partial fulfillment of the requirements for the degree ${esc(p.degree)}.</div>
  <div class="sig-row">
    <div class="sig"><div class="line"></div><b>${esc(p.faculty.coordinator)}</b><br>Program Chair/Coordinator,<br>${esc(p.programShort)}</div>
    <div class="sig"><div class="line"></div><b>${esc(p.faculty.dean)}</b><br>Dean, School of Computing</div>
  </div>
</section>`
}

function tocPage(ctx, entries) {
  const row = (label, page, sub) => `<div class="row${sub ? ' sub' : ''}"><span>${esc(label)}</span><span class="dots"></span><span>${esc(page)}</span></div>`
  return `<section class="page toc"><h1>Table of Contents</h1><div style="text-align:right"><b>Page</b></div>
  ${entries.map(e => row(e.label, e.page, e.sub)).join('')}</section>`
}

/** The body sections in order; each carries a marker so the TOC can find its page. */
function bodySections(ctx) {
  const { p, x, phase } = ctx
  const cs = Boolean(x.csMethod)
  const final = isFinal(phase)
  const draft = phase === 'proposal-draft'
  const out = []
  // The marker goes inside the section's first heading or paragraph: it adds no
  // line of its own and prints on the page where the section starts.
  const add = (label, html, sub = false) => {
    const id = `H${out.length}`
    const marked = html.replace('§MARK§', '').replace(/(<(?:h1|h2|h3|p|div class="status-note")[^>]*>)/, `$1<span class="marker">§${id}§</span>`)
    out.push({ id, label, sub, html: marked })
  }

  add('Title Page', `<section class="page center" style="line-height:1.4">§MARK§
    <p class="noindent" style="margin-top:0.6in"><b>${esc(x.title)}</b></p>
    <p class="noindent" style="margin-top:14pt">${p.members.map(m => esc(m.name)).join(', ')}</p>
    <p class="noindent" style="margin-top:14pt">Holy Angel University<br>${esc(p.programShort)}</p>
    <p class="noindent" style="margin-top:0.4in"><b>Abstract</b></p>
    ${final && phase !== 'final-draft'
      ? `<p style="text-align:justify">${esc(`This study aimed to ${x.general}. ${x.problem} ${x.conclusion} ${x.results.extra[1]}`)}</p><p class="noindent" style="margin-top:8pt"><i>Keywords:</i> capstone, web application, ISO/IEC 25010, usability</p>`
      : '<p class="noindent"><i>The abstract is written after the study is completed and is left blank at the proposal stage.</i></p>'}
  </section>`)

  add('Introduction', `<section>§MARK§<h1>${esc(x.title.toUpperCase())}</h1><h2>Introduction</h2>${paras(x.background)}
    <p>The problem this study addresses is the following: ${esc(x.problem.charAt(0).toLowerCase() + x.problem.slice(1))} This capstone project therefore proposes ${esc(x.short)}.</p></section>`)
  add('Review of Related Literature', `<section>§MARK§<h2>Review of Related Literature</h2><p>This section reviews studies and existing systems related to ${esc(x.short)} and the methods used to evaluate it.</p></section>`)
  for (const [head, text] of x.rrl) add(head, `<section>§MARK§<h3>${esc(head)}</h3><p>${esc(text)}</p></section>`, true)
  add('Synthesis', `<section>§MARK§<h3>Synthesis</h3><p>The reviewed studies show that the problem is common and that a focused, web-based solution can address it at low cost. None of the systems reviewed fits the setting of this study exactly, which is the gap ${esc(x.short)} fills.</p></section>`, true)
  add('Conceptual Framework', `<section>§MARK§<h2>Conceptual Framework</h2><p>The study follows the Input–Process–Output model shown in Figure 1.</p>
    <div class="figure"><div class="tbl-cap"><b>Figure 1</b><i>Conceptual Framework of the Study</i></div>
    <div class="ipo"><div><b>INPUT</b>${x.ipo.input.map(t => `<span>${esc(t)}</span>`).join('')}</div><div><b>PROCESS</b>${x.ipo.process.map(t => `<span>${esc(t)}</span>`).join('')}</div><div><b>OUTPUT</b>${x.ipo.output.map(t => `<span>${esc(t)}</span>`).join('')}</div></div></div></section>`)
  if (draft) {
    add('Objectives of the Study', `<section>§MARK§<div class="status-note">Draft: Objectives of the Study, Scope and Delimitations and Method are being written and will be in the complete proposal manuscript.</div></section>`)
    return out
  }
  add('Objectives of the Study', `<section>§MARK§<h2>Objectives of the Study</h2><p>The general objective of the study is to ${esc(x.general)}. Specifically, the study aims to:</p><ol class="objectives">${x.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ol></section>`)
  add('Scope and Delimitations', `<section>§MARK§<h2>Scope and Delimitations</h2>${paras(x.scope)}</section>`)
  add('Method', `<section>§MARK§<h2>Method</h2><p>This section describes how ${esc(x.short)} will be ${cs ? 'designed, built, measured and evaluated' : 'analyzed, specified, designed, developed, tested and evaluated'}.</p></section>`)
  const frTable = `<div class="tbl-cap"><b>Table 1</b><i>Functional Requirements</i></div><table class="apa"><tr><th>ID</th><th>User</th><th>Requirement</th></tr>${x.frs.map(r => `<tr><td>${r.map(esc).join('</td><td>')}</td></tr>`).join('')}</table>`
  const nfrTable = `<div class="tbl-cap"><b>Table 2</b><i>Non-Functional Requirements</i></div><table class="apa"><tr><th>Characteristic</th><th>Requirement</th></tr>${x.nfrs.map(r => `<tr><td>${r.map(esc).join('</td><td>')}</td></tr>`).join('')}</table>`
  const respTable = `<div class="tbl-cap"><b>Table 3</b><i>Respondents of the Study</i></div><table class="apa"><tr><th>Respondent group</th><th>Number</th><th>Instrument</th></tr>${x.respondents.map(r => `<tr><td>${r.map(esc).join('</td><td>')}</td></tr>`).join('')}</table>`
  if (cs) {
    const m = x.csMethod
    add('Research Design', `<section>§MARK§<h3>Research Design</h3><p>${esc(m.design)}</p>${frTable}${nfrTable}</section>`, true)
    add('Sources of Data', `<section>§MARK§<h3>Sources of Data</h3><p>${esc(m.data)}</p></section>`, true)
    add('Participants', `<section>§MARK§<h3>Participants</h3><p>${esc(m.participants)}</p>${respTable}</section>`, true)
    add('Instruments', `<section>§MARK§<h3>Instruments</h3><p>${esc(m.instruments)}</p></section>`, true)
    add('Data Collection', `<section>§MARK§<h3>Data Collection</h3><p>After approval from the Laboratory Supervisor, the researchers install the gateways, tag the items, and collect readings for two weeks while recording controlled moves.</p></section>`, true)
    add('Data Analysis', `<section>§MARK§<h3>Data Analysis</h3><p>${esc(m.analysis)}</p></section>`, true)
  } else {
    add('Requirement Analysis', `<section>§MARK§<h3>Requirement Analysis</h3><p>The researchers observed the current process and interviewed its users. The current process is shown in Appendix B.</p></section>`, true)
    add('Requirements Documentation', `<section>§MARK§<h3>Requirements Documentation</h3><p>The functional requirements are grouped by user in Table 1; the non-functional requirements follow in Table 2.</p>${frTable}${nfrTable}</section>`, true)
    add('Design of Software, System, Product and Process', `<section>§MARK§<h3>Design of Software, System, Product and Process</h3><p>The system uses a client–server architecture: a React client, Firebase Authentication restricted to university accounts, Cloud Functions for every write, Firestore for data and a mail service for notifications. The main entities are ${esc(x.entities.join(', '))}.</p></section>`, true)
    add('Development and Testing', `<section>§MARK§<h3>Development and Testing</h3><p>Development follows Scrum with two-week sprints. Testing proceeds from unit tests to integration tests on the Firebase Emulator Suite to acceptance testing with the functionality checklist (Appendix C).</p></section>`, true)
    add('Sample and Setting', `<section>§MARK§<h3>Sample and Setting</h3><p>Respondents are selected by purposive sampling as shown in Table 3.</p>${respTable}</section>`, true)
    add('Data Analysis Plan', `<section>§MARK§<h3>Data Analysis Plan</h3><p>SUS scores are computed per respondent and interpreted with the adjective scale. ISO/IEC 25010 ratings are summarized by weighted mean (4.21–5.00 Strongly Agree; 3.41–4.20 Agree; 2.61–3.40 Neutral; 1.81–2.60 Disagree; 1.00–1.80 Strongly Disagree).</p></section>`, true)
  }
  add('Ethical Consideration', `<section>§MARK§<h3>Ethical Consideration</h3><p>Participation is voluntary and respondents may withdraw at any time. Responses are anonymous, kept for the duration of the study and destroyed after the final defense, in accordance with the Data Privacy Act of 2012.</p></section>`, true)

  if (final) {
    const r = x.results
    const draftNote = phase === 'final-draft' ? '<div class="status-note">Draft: the evaluation below covers the first test session only; the complete results follow in the final manuscript.</div>' : ''
    add('Results', `<section>§MARK§<h2>Results</h2>${draftNote}
      <div class="tbl-cap"><b>Table 4</b><i>Functionality Checklist Results</i></div><table class="apa"><tr><th>Function</th><th>Result</th></tr>${r.checklist.map(([f, ok]) => `<tr><td>${esc(f)}</td><td>${ok ? 'Working' : 'Not working'}</td></tr>`).join('')}</table>
      ${phase === 'final-draft' ? '' : `<div class="tbl-cap"><b>Table 5</b><i>ISO/IEC 25010 Evaluation</i></div><table class="apa"><tr><th>Characteristic</th><th>Weighted mean</th><th>Interpretation</th></tr>${r.iso.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${v.toFixed(2)}</td><td>${v >= 4.21 ? 'Strongly Agree' : 'Agree'}</td></tr>`).join('')}</table>
      ${r.sus != null ? `<p>The mean SUS score was ${r.sus.toFixed(1)}, which is above the benchmark of 68.</p>` : ''}
      <p><b>${esc(r.extra[0])}.</b> ${esc(r.extra[1])}</p>`}</section>`)
    if (phase !== 'final-draft') {
      add('Discussion', `<section>§MARK§<h2>Discussion</h2><p>${esc(x.discussion)}</p></section>`)
      add('Conclusion', `<section>§MARK§<h2>Conclusion</h2><p>${esc(x.conclusion)}</p></section>`)
      add('Recommendations', `<section>§MARK§<h2>Recommendations</h2><ol class="objectives">${x.recommendations.map(t => `<li>${esc(t)}</li>`).join('')}</ol></section>`)
    }
  }

  add('References', `<section class="page references" style="break-before:page">§MARK§<h1>References</h1>${REFERENCES.map(r => `<p>${esc(r)}</p>`).join('')}</section>`)
  add('Appendix A Cover Letter to Host/Locale', `<section class="page letter" style="break-before:page">§MARK§<h1>Appendix A</h1><h1>Cover Letter to Host/Locale</h1>
    <p>${esc(ctx.letterDate)}</p><p>${esc(x.host.head)}<br>${esc(x.host.office)}<br>Holy Angel University</p><p>${esc(x.host.salutation)}</p>
    <p>We are students of the School of Computing working on our capstone project entitled “${esc(x.title)}.” We respectfully ask permission to observe the current process at your office, interview your staff, and conduct a test session of the system. This letter is a placeholder for the dummy manuscript.</p>
    <p>Respectfully yours,</p><p>${p.members.map(m => esc(m.name)).join('<br>')}</p><p>Noted by:<br>${esc(p.faculty.adviser)}, Adviser</p></section>`, true)
  add('Appendix B Current Process Flowchart', `<section class="page" style="break-before:page">§MARK§<h1>Appendix B</h1><h1>Current Process Flowchart</h1>
    <div class="flow">${['Request is made by message or on paper', 'Staff checks availability manually', 'Request is confirmed or declined', 'Activity takes place', 'Record is kept on paper, if at all'].map(t => `<div>${esc(t)}</div>`).join('')}</div></section>`, true)
  add('Appendix C Functionality Checklist', `<section class="page" style="break-before:page">§MARK§<h1>Appendix C</h1><h1>Functionality Checklist</h1>
    <table class="apa"><tr><th>Function</th><th>Working</th><th>Not working</th><th>Remarks</th></tr>${x.results.checklist.map(([f]) => `<tr><td>${esc(f)}</td><td></td><td></td><td></td></tr>`).join('')}</table></section>`, true)
  const sus = ['I think that I would like to use this system frequently.', 'I found the system unnecessarily complex.', 'I thought the system was easy to use.', 'I think that I would need the support of a technical person to be able to use this system.', 'I found the various functions in this system were well integrated.', 'I thought there was too much inconsistency in this system.', 'I would imagine that most people would learn to use this system very quickly.', 'I found the system very cumbersome to use.', 'I felt very confident using the system.', 'I needed to learn a lot of things before I could get going with this system.']
  add('Appendix D System Usability Scale Questionnaire', `<section class="page" style="break-before:page">§MARK§<h1>Appendix D</h1><h1>System Usability Scale Questionnaire</h1>
    <p class="noindent">1 – Strongly Disagree, 2 – Disagree, 3 – Neutral, 4 – Agree, 5 – Strongly Agree</p>
    <table class="apa"><tr><th>Statement</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>${sus.map((s, i) => `<tr><td>${i + 1}. ${esc(s)}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</table></section>`, true)
  add('Appendix E ISO/IEC 25010 Software Quality Evaluation Form', `<section class="page" style="break-before:page">§MARK§<h1>Appendix E</h1><h1>ISO/IEC 25010 Software Quality Evaluation Form</h1>
    <table class="apa"><tr><th>Criteria</th><th>5</th><th>4</th><th>3</th><th>2</th><th>1</th></tr>${x.results.iso.map(([c]) => `<tr><td colspan="6" style="background:#f4f1ef"><b>${esc(c)}</b></td></tr><tr><td>The system meets the ${esc(c.toLowerCase())} requirements.</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</table></section>`, true)
  return out
}

function revisionSummaryPage(ctx) {
  const type = ctx.phase === 'proposal-revised' ? 'Proposal' : 'Final'
  return `<section class="page"><h1><span class="marker">§REV§</span>Summary of Revisions</h1>
  <p>The following revisions were made in response to the panel’s recommendations recorded in the Capstone Revision Form (FM-AAC-SOC-2004) after the ${type.toLowerCase()} defense on ${esc(ctx.defenseDate)}.</p>
  <table class="apa"><tr><th>Panel recommendation</th><th>Action taken</th><th>Section</th></tr>
  ${REVISIONS[type].map(r => `<tr><td>${r.map(esc).join('</td><td>')}</td></tr>`).join('')}</table>
  <p class="noindent" style="margin-top:12pt">Checked by: ______________________ ${esc(ctx.p.faculty.adviser)}, Adviser</p></section>`
}

/** Front matter (roman page numbers) and body (arabic), printed separately and merged. */
export function manuscriptParts(ctx, tocPages = {}, frontPages = {}) {
  const sections = bodySections(ctx)
  const entries = [
    { label: 'Cover Page', page: 'i' }, { label: 'Approval Sheet', page: 'ii' }, { label: 'Acknowledgment', page: 'iii' },
    { label: 'Table of Contents', page: 'iv' },
    ...(ctx.phase.endsWith('revised') ? [{ label: 'Summary of Revisions', page: frontPages.rev ?? 'v' }] : []),
    ...sections.map(s => ({ label: s.label, page: tocPages[s.id] ?? '-', sub: s.sub })),
  ]
  const front = [
    coverPage(ctx),
    approvalSheetPage(ctx),
    `<section class="page"><h1>Acknowledgment</h1><p>The researchers extend their sincere gratitude to everyone who supported this capstone project. This page is placeholder text: a real manuscript thanks the Adviser, the panel, the instructors, the host office and the families who made the work possible.</p><p>The group is especially grateful to ${esc(ctx.p.faculty.adviser)} for patient guidance through every revision.</p></section>`,
    tocPage(ctx, entries),
    ...(ctx.phase.endsWith('revised') ? [revisionSummaryPage(ctx)] : []),
  ]
  return {
    front: manuscriptShell(front, { numbering: 'roman', sealSrc: ctx.sealSrc }),
    body: manuscriptShell(sections.map(s => s.html), { numbering: 'arabic', sealSrc: ctx.sealSrc }),
    markers: sections.map(s => s.id),
  }
}

/** A short manuscript-framed document (concept paper), one part. */
export function conceptPaper(ctx) {
  const { p, x, version } = ctx
  const pages = [
    `<section>
      <h1>${esc(x.title.toUpperCase())}</h1>
      <p class="noindent center" style="line-height:1.4">Concept Paper${version > 1 ? ` — Revised (version ${version})` : ''}<br>${p.members.map(m => esc(m.name)).join(', ')}<br>${esc(p.section)} · Adviser: ${esc(p.faculty.adviser)} · Instructor 1: ${esc(p.faculty.instructor1)}</p>
      ${version > 1 ? `<div class="status-note">Revisions in this version: the problem statement was narrowed to the setting of the study, and the objectives were rewritten to be measurable, as asked by the Instructor 1 and the Adviser on the first version.</div>` : ''}
      <h2>Background of the Study</h2>${paras(x.background)}
      <h2>Statement of the Problem</h2><p>${esc(x.problem)}</p>
      <h2>Objectives</h2><p>The study aims to ${esc(x.general)}. Specifically, it aims to:</p><ol class="objectives">${x.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
      <h2>Scope and Delimitations</h2>${paras(x.scope.slice(0, version > 1 ? 2 : 1))}
      <h2>Proposed Method</h2><p>The group will ${x.csMethod ? 'design the sensing network and location algorithm, build a prototype, measure its accuracy and evaluate it with ISO/IEC 25010' : 'gather requirements from the intended users, develop the system in two-week Scrum sprints, and evaluate it with ISO/IEC 25010 and the System Usability Scale'}.</p>
      <h2>Expected Output</h2><p>${esc(x.ipo.output.join(' and '))}.</p>
      <h2 style="margin-top:8pt">References</h2><div class="references">${REFERENCES.slice(0, 4).map(r => `<p>${esc(r)}</p>`).join('')}</div>
      <p class="dummy-note" style="text-indent:0;margin-top:12pt">Dummy concept paper for testing the HAU-SOC prototype. All content is placeholder.</p>
    </section>`,
  ]
  return manuscriptShell(pages, { numbering: 'arabic', sealSrc: ctx.sealSrc })
}

// --- Forms and letterhead documents --------------------------------------------

const FORM_CSS = `${BASE_CSS}
@page { size: 8.5in 11in; margin: 0.6in 0.85in 0.75in 0.85in; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
.letterhead { display: flex; align-items: center; justify-content: center; gap: 10pt; position: relative; margin-bottom: 10pt; }
.letterhead.has-code { padding-right: 1.85in; }
.letterhead img { height: 0.62in; }
.letterhead .names { display: flex; align-items: center; gap: 8pt; font-family: 'Trajan Pro', 'Times New Roman', serif; color: #444; }
.letterhead .names .hau { line-height: 1.05; letter-spacing: 1px; }
.letterhead .names .hau b { display: block; font-weight: normal; font-size: 14pt; }
.letterhead .names .hau span { font-size: 9pt; letter-spacing: 3.5px; }
.letterhead .names .div { width: 1pt; height: 0.42in; background: #444; }
.letterhead .names .soc { font-size: 12.5pt; line-height: 1.05; }
.codebox { position: absolute; right: 0; top: 4pt; border: 0.8pt solid #000; padding: 4pt 8pt; font-size: 7.5pt; line-height: 1.35; text-align: left; font-weight: bold; }
.form-title { text-align: center; font-weight: bold; font-size: 11pt; margin: 6pt 0 14pt; }
.field { margin: 8pt 0; }
.field .label { font-weight: bold; }
.fill { font-family: 'Courier New', monospace; color: #0b3d91; }
.sigmark { font-family: 'Snell Roundhand', 'Brush Script MT', cursive; color: #0b3d91; font-size: 13pt; }
.line-fill { border-bottom: 0.8pt solid #000; display: inline-block; min-width: 1.4in; min-height: 15pt; padding: 0 4pt; vertical-align: bottom; }
table.form th, table.form td { border: 0.8pt solid #000; padding: 4pt 6pt; text-align: left; vertical-align: top; }
table.form th { font-weight: bold; text-align: center; }
.dotted { border-bottom: 1.2pt dotted #333; min-height: 16pt; margin: 2pt 0.4in; padding: 2pt 0; }
.lined { border-bottom: 0.8pt solid #000; min-height: 16pt; padding: 2pt 0; }
.check { display: inline-block; width: 10pt; height: 10pt; border: 0.8pt solid #000; margin-right: 6pt; vertical-align: -1pt; text-align: center; line-height: 9pt; font-size: 9pt; font-weight: bold; }
.footer-addr { margin-top: 24pt; border-top: 1pt solid #8c2a2a; padding-top: 6pt; text-align: center; font-size: 7.5pt; color: #666; line-height: 1.4; }
.cert { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; }
.cert h1 { text-align: center; font-size: 16pt; letter-spacing: 1px; margin: 18pt 0 4pt; }
.cert .sub { text-align: center; font-size: 10.5pt; color: #444; margin-bottom: 20pt; }
.cert p { text-indent: 0.5in; margin: 0 0 10pt; text-align: justify; }
.cert table.kv td { padding: 3pt 6pt; border-bottom: 0.6pt solid #ccc; font-size: 11pt; }
.cert table.kv td:first-child { width: 2.2in; color: #444; }
.signblock { margin-top: 36pt; width: 3in; text-align: center; line-height: 1.35; }
.signblock .line { border-top: 1pt solid #000; margin-bottom: 2pt; }
`

function letterhead(sealSrc, code) {
  return `<div class="letterhead${code ? ' has-code' : ''}">
    ${sealSrc.hau ? `<img src="${sealSrc.hau}" alt="">` : ''}
    <div class="names"><div class="hau"><b>HOLY ANGEL</b><span>UNIVERSITY</span></div><div class="div"></div><div class="soc">SCHOOL OF<br>COMPUTING</div></div>
    ${sealSrc.soc ? `<img src="${sealSrc.soc}" alt="">` : ''}
    ${code ? `<div class="codebox">${esc(code)}<br>Revision: 0<br>Effectivity Date: May 1, 2025</div>` : ''}
  </div>`
}
const ADDRESS = `<div class="footer-addr">#1 HOLY ANGEL AVENUE, STO. ROSARIO, ANGELES CITY, PHILIPPINES 2009<br>TEL. NOS.: (045) 888-8691 | EMAIL: HAU@HAU.EDU.PH | WWW.HAU.EDU.PH<br><i>Dummy form generated for testing the HAU-SOC Thesis &amp; Capstone prototype. Not an official record.</i></div>`
const formShell = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${FORM_CSS}</style></head><body><div class="watermark">DUMMY — FOR TESTING</div>${inner}${ADDRESS}</body></html>`
const f = (v, filled) => (filled && v ? `<span class="fill">${esc(v)}</span>` : '')
const sign = (name, filled) => (filled && name ? `<span class="sigmark">${esc(name)}</span>` : '')

/** FM-AAC-SOC-2003 — Capstone-Thesis Monitoring Form (weekly logs, S6.1–S6.2). */
export function fm2003(ctx, filled = true) {
  const { p, x, logs = [] } = ctx
  const rows = filled ? logs : Array.from({ length: 6 }, () => ({}))
  return formShell(`${letterhead(ctx.sealSrc, 'FM-AAC-SOC-2003')}
  <div class="form-title">Capstone-Thesis Monitoring Form</div>
  <div class="field"><span class="label">Project/Thesis Title:</span><div style="border:0.8pt solid #000;min-height:0.45in;padding:6pt">${f(x?.title, filled)}</div></div>
  <table class="form" style="margin-top:10pt"><tr><th rowspan="2" style="width:1.1in">DATE</th><th rowspan="2">WORK UPDATES/STATUS<br><span style="font-weight:normal">(Please include details)</span></th><th colspan="2">SIGNATURES</th></tr><tr><th style="width:1.15in">Advisees</th><th style="width:1.15in">Adviser</th></tr>
  ${rows.map(l => `<tr style="height:${filled ? 'auto' : '0.95in'}"><td>${f(l.date, filled)}</td><td>${f(l.text, filled)}</td><td>${filled ? p.members.slice(0, 2).map(m => sign(m.name.split(' ')[0], true)).join('<br>') : ''}</td><td>${sign(l.signed ? p.faculty.adviser : '', filled)}</td></tr>`).join('')}
  </table>`)
}

/** FM-AAC-SOC-2004 — Capstone Revision Form (verdict, S5.6 / S7.6; sign-off, S5.7 / S8.4). */
export function fm2004(ctx, filled = true) {
  const { p, x, type = 'Final', verdict = 'Minor', defenseDate, room } = ctx
  const items = filled ? REVISIONS[type].map(r => r[0]) : []
  const lines = [...items, ...Array(Math.max(0, 10 - items.length)).fill('')]
  const box = (on) => `<span class="check">${filled && on ? '✓' : ''}</span>`
  const members = p.faculty.panelMembers
  return formShell(`${letterhead(ctx.sealSrc, 'FM-AAC-SOC-2004')}
  <div class="form-title">Capstone Revision Form${filled ? ` — ${type} Defense` : ''}</div>
  <div class="field"><span class="label">Project/Thesis Title:</span> <span class="line-fill" style="min-width:5in">${f(x?.title, filled)}</span></div>
  <div class="field"><span class="label">Proponents:</span></div>
  <table class="form" style="width:92%;margin:0 auto"><tr><th style="width:1.2in">Student #</th><th>Name</th><th style="width:1.6in">Signature</th></tr>
  ${Array.from({ length: 6 }, (_, i) => p.members[i]).map(m => `<tr style="height:16pt"><td>${f(m?.idNumber, filled)}</td><td>${f(m?.name, filled)}</td><td>${sign(m ? m.name.split(' ')[0] : '', filled)}</td></tr>`).join('')}</table>
  <div class="field" style="display:flex;gap:0.4in;margin-top:14pt"><span><b>Date:</b> <span class="line-fill">${f(defenseDate, filled)}</span></span><span><b>Time:</b> <span class="line-fill" style="min-width:0.9in">${f(filled ? '1:00 PM' : '', filled)}</span></span><span><b>Room:</b> <span class="line-fill" style="min-width:1in">${f(room, filled)}</span></span></div>
  <div class="field"><span class="label">Topic Recommendations:</span></div>
  ${lines.map(t => `<div class="dotted">${f(t, filled)}</div>`).join('')}
  <div class="field" style="margin-top:14pt"><span class="label">Remarks:</span></div>
  <div style="margin-left:0.3in;line-height:1.8">
    <div>${box(verdict === 'Minor')}Approved with Minor Revisions</div>
    <div>${box(verdict === 'Major')}Approved with Major Revisions</div>
    <div style="display:flex;justify-content:space-between"><span>${box(verdict === 'Change Topic' || verdict === 'Re-defense')}${type === 'Proposal' ? 'Change Topic' : 'Re-defense'}</span><span>Schedule of Re-defense on: <span class="line-fill" style="min-width:1.2in"></span></span></div>
  </div>
  <div style="margin:14pt 0 0 0.3in;display:flex;justify-content:space-between"><span>Panel Chair: <span class="line-fill" style="min-width:2.2in">${f(p.faculty.panelChair, filled)}</span></span><span>Signature: <span class="line-fill">${sign(p.faculty.panelChair, filled)}</span></span></div>
  <div style="margin:6pt 0 0 0.3in">Members of the Panel:</div>
  ${[0, 1, 2].map(i => `<div style="margin:4pt 0 0 1.2in;display:flex;justify-content:space-between"><span class="line-fill" style="min-width:2.8in">${f(members[i], filled)}</span><span class="line-fill">${sign(ctx.panelSigned ? members[i] : '', filled)}</span></div>`).join('')}
  ${filled ? `<div style="margin:10pt 0 0 0.3in;display:flex;justify-content:space-between"><span>Adviser (revisions verified): <span class="line-fill" style="min-width:2in">${f(p.faculty.adviser, filled)}</span></span><span>Signature: <span class="line-fill">${sign(ctx.panelSigned ? p.faculty.adviser : '', filled)}</span></span></div>` : ''}`)
}

/** FM-AAC-SOC-2005 — Capstone Recommendation Form (S6.7). */
export function fm2005(ctx, filled = true) {
  const { p, x, recommended = true } = ctx
  const pairs = [0, 2, 4].map(i => [p.members[i], p.members[i + 1]])
  const reasons = filled && !recommended ? [
    'Only 1 of the required weekly logs has been signed this term.',
    'The final manuscript has no Results section yet.',
    'The system is not deployed on a live server for alpha testing.',
  ] : []
  return formShell(`${letterhead(ctx.sealSrc, 'FM-AAC-SOC-2005')}
  <div class="form-title">Capstone Recommendation Form</div>
  <div class="field"><span class="label">Project/Thesis Title:</span><div class="lined" style="margin-top:10pt">${f(x?.title, filled)}</div></div>
  <div class="field"><span class="label">Proponents:</span></div>
  <table class="form"><tr><th>Student #</th><th>Name</th><th>Student #</th><th>Name</th></tr>
  ${pairs.map(([a, b]) => `<tr style="height:16pt"><td>${f(a?.idNumber, filled)}</td><td>${f(a?.name, filled)}</td><td>${f(b?.idNumber, filled)}</td><td>${f(b?.name, filled)}</td></tr>`).join('')}</table>
  <div style="margin:14pt 0 0 0.2in;line-height:1.8">
    <div>[<span class="fill">${filled && recommended ? 'X' : '&nbsp;&nbsp;'}</span>] Recommended</div>
    <div>[<span class="fill">${filled && !recommended ? 'X' : '&nbsp;&nbsp;'}</span>] Not Recommended</div>
    <div>Reason(s) for non-recommendation:</div>
  </div>
  <div style="margin-left:0.2in">${[...reasons, ...Array(8 - reasons.length).fill('')].map(t => `<div class="lined">${f(t, filled)}</div>`).join('')}</div>
  <div style="margin:28pt 0 0 0.2in"><span class="line-fill" style="min-width:2.6in">${sign(p.faculty.adviser, filled)}</span><br><i>Adviser</i>${filled ? ` — <span class="fill">${esc(p.faculty.adviser)}</span>` : ''}</div>
  <div style="margin:14pt 0 0 0.2in">Noted by:</div>
  <div style="margin:20pt 0 0 0.2in"><span class="line-fill" style="min-width:2.6in"></span><br><i>Program Chairperson/Coordinator,</i> <span class="line-fill" style="min-width:1in">${f(filled ? p.programShort : '', filled)}</span></div>
  ${filled && !recommended ? '<p style="margin-top:14pt;font-size:9pt">Group members’ signatures (acknowledging the non-recommendation): ' + p.members.map(m => sign(m.name.split(' ')[0], true)).join(' · ') + '</p>' : ''}`)
}

/** The Approval Sheet on its own (S9.3), on the manuscript frame. */
export function approvalSheet(ctx) {
  return manuscriptShell([approvalSheetPage(ctx)], { numbering: 'roman', sealSrc: ctx.sealSrc })
}

/** S3.1 — the five proposed topics. */
export function topicProposal(ctx) {
  const { p, x, date } = ctx
  return formShell(`${letterhead(ctx.sealSrc)}
  <div class="form-title">Capstone/Thesis Topic Proposal</div>
  <table class="form"><tr><td style="width:1.6in"><b>Group</b></td><td>${esc(p.groupLabel)}</td></tr>
  <tr><td><b>Section · Term</b></td><td>${esc(p.section)} · ${esc(p.term)}</td></tr>
  <tr><td><b>Program</b></td><td>${esc(p.degree)}</td></tr>
  <tr><td><b>Proponents</b></td><td>${p.members.map(m => `${esc(m.name)} (${esc(m.idNumber)})`).join('<br>')}</td></tr>
  <tr><td><b>Instructor 1</b></td><td>${esc(p.faculty.instructor1)}</td></tr>
  <tr><td><b>Adviser</b></td><td>${esc(p.faculty.adviser)}</td></tr>
  <tr><td><b>Date submitted</b></td><td>${esc(date)}</td></tr></table>
  <p style="margin-top:14pt">The group proposes the following five topics, in order of preference, for evaluation by the Instructor 1 and the Adviser.</p>
  <table class="form"><tr><th style="width:0.35in">#</th><th style="width:2.4in">Proposed topic</th><th>Description and rationale</th></tr>
  ${x.topics.map(([t, d], i) => `<tr><td>${i + 1}</td><td><b>${esc(t)}</b></td><td>${esc(d)}</td></tr>`).join('')}</table>
  <table class="form" style="margin-top:18pt"><tr><th colspan="2">For the Instructor 1 and the Adviser</th></tr>
  <tr style="height:0.7in"><td style="width:2in">Approved topic</td><td></td></tr><tr style="height:0.7in"><td>Comments</td><td></td></tr></table>`)
}

/** S6.6 — deployment information. */
export function deploymentInfo(ctx) {
  const { p, x, date, slug } = ctx
  const rows = [
    ['System', x.title], ['Live URL (alpha test)', `https://${slug}.web.app`], ['Staging URL', `https://${slug}-staging.web.app`],
    ['Source repository', `https://github.com/hau-soc-capstone/${slug}`], ['Hosting', 'Firebase Hosting, Cloud Functions, Firestore (asia-southeast1)'],
    ['Container image', `ghcr.io/hau-soc-capstone/${slug}:1.0.0`], ['Deployed on', date], ['Test accounts', 'Provided to the Adviser and panel on request (not written in this document).'],
    ['Browsers tested', 'Chrome 1xx, Safari 1x (iOS), Firefox 1xx'], ['Known limitations', x.recommendations[0]],
  ]
  return formShell(`${letterhead(ctx.sealSrc)}
  <div class="form-title">Deployment Information</div>
  <p>${esc(p.groupLabel)} · ${esc(p.section)} · Adviser: ${esc(p.faculty.adviser)} · Instructor 2: ${esc(p.faculty.instructor2)}</p>
  <table class="form">${rows.map(([k, v]) => `<tr><td style="width:1.8in"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>
  <p style="margin-top:14pt"><b>Deployment steps</b></p>
  <ol>${['Clone the repository and copy .env.example to .env with the Firebase project settings.', 'Run npm install and npm run build.', 'Deploy with firebase deploy --only hosting,functions,firestore:rules.', 'Seed the reference data with npm run seed -- --confirm.', 'Smoke-test the live URL with the functionality checklist.'].map(t => `<li>${esc(t)}</li>`).join('')}</ol>
  <p style="font-size:9pt;color:#555">All URLs and identifiers are placeholders; they do not point to a real deployment.</p>`)
}

/** S9.1 — Editor's Note / Certificate. */
export function editorsCertificate(ctx) {
  const { p, x, date } = ctx
  return formShell(`${letterhead(ctx.sealSrc)}<div class="cert">
  <h1>EDITOR’S CERTIFICATE</h1><div class="sub">Editor’s Note — English Editing and Proofreading</div>
  <p>This is to certify that I have edited and proofread the capstone manuscript entitled <b>“${esc(x.title)}”</b> by ${esc(p.members.map(m => m.name).join(', '))}, ${esc(p.degree)}, for grammar, mechanics, style and consistency with the APA 7th edition format.</p>
  <p>The corrections I marked have been incorporated by the proponents in the final copy submitted on ${esc(date)}.</p>
  <table class="kv"><tr><td>Manuscript version edited</td><td>Final manuscript, revised after the final defense</td></tr><tr><td>Pages</td><td>${ctx.pages ?? 'as submitted'}</td></tr><tr><td>Date issued</td><td>${esc(date)}</td></tr></table>
  <div class="signblock"><span class="sigmark">J. Placeholder</span><div class="line"></div><b>Prof. Juliet Placeholder</b><br>English Instructor, College of Arts and Sciences (placeholder)</div>
  </div>`)
}

/** S9.2 — Plagiarism Clearance Certificate. */
export function plagiarismCertificate(ctx) {
  const { p, x, date } = ctx
  return formShell(`${letterhead(ctx.sealSrc)}<div class="cert">
  <h1>PLAGIARISM CLEARANCE CERTIFICATE</h1><div class="sub">Originality and AI-Use Check</div>
  <p>This is to certify that the manuscript entitled <b>“${esc(x.title)}”</b> by ${esc(p.members.map(m => m.name).join(', '))} was checked for similarity and AI-generated text and meets the institution’s originality threshold.</p>
  <table class="kv">
    <tr><td>Similarity index</td><td>8% (threshold: 15%)</td></tr>
    <tr><td>AI-generated text detected</td><td>4% (threshold: 10%)</td></tr>
    <tr><td>Checking tool</td><td>Placeholder Similarity Checker</td></tr>
    <tr><td>Report reference no.</td><td>PCC-${esc(ctx.ref)}</td></tr>
    <tr><td>Date checked</td><td>${esc(date)}</td></tr>
    <tr><td>Result</td><td><b>CLEARED</b></td></tr>
  </table>
  <div class="signblock"><span class="sigmark">R. Placeholder</span><div class="line"></div><b>Mr. Rico Placeholder</b><br>Plagiarism Checking Service (placeholder office)</div>
  </div>`)
}
