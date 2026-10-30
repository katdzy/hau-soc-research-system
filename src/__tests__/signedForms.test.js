// Forms signed outside the system and uploaded back (checklist revision
// 2026-10-30; Figma E-00/E-01, F-01–F-09, M-05/M-06, M-19–M-23): which lines
// take a file, what a file must be, FM-2005's two outcomes, the Program
// Chair's noted copy, the executives' uploads — and the exports (S-18).

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { pdfFile, otherFile, signed } from './pdfFixture.js'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { runGate, signForm, decideWeeklyLog, submitDocument, confirmMilestones, confirmReadiness } from '../services/actions.js'
import { remoteActions } from '../services/api.js'
import { resolveInstitution, can } from '../domain/caac.js'
import { lineMethod, latestCopy } from '../domain/forms.js'
import { inspectFormFile, formFileProblem } from '../domain/uploads.js'
import { isFormFilePathOf } from '../backend/filePath.js'
import { xlsx, docx, zip } from '../domain/exportFiles.js'
import { DOC_TYPES as T, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const formOf = (pid, type) => b(pid).forms.filter(f => f.formType === type).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0]
const recipients = (pid, event) => snap().outbox.filter(m => m.projectId === pid && m.event === event).flatMap(m => m.userIds)

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

/** G1 at Implementation with everything FM-2005 waits for. */
async function readyToRecommend() {
  await load(scenarioStore('T1'))
  const log = b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
  await decideWeeklyLog(as('f_alpha'), null, 'p_g1', log.id, { approve: true })
  await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.FINAL_MANUSCRIPT, file: pdfFile('final.pdf') })
  await confirmMilestones(as('f_foxtrot'), null, 'p_g1', 'revisedManuscript')
  await confirmMilestones(as('f_foxtrot'), null, 'p_g1', 'systemComponents')
  await confirmReadiness(as('f_foxtrot'), null, 'p_g1')
}

describe('a signed copy: PDF, JPG or PNG, checked by its bytes', () => {
  const png = (name = 'scan.png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9])], name, { type: 'image/png' })
  const jpg = (name = 'photo.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], name, { type: 'image/jpeg' })

  it('takes a PDF, a scan or a photo — and fingerprints it', async () => {
    expect(await inspectFormFile(pdfFile('form.pdf'))).toMatchObject({ contentType: 'application/pdf', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(await inspectFormFile(png())).toMatchObject({ contentType: 'image/png' })
    expect(await inspectFormFile(jpg('photo.JPEG'))).toMatchObject({ contentType: 'image/jpeg' })
  })

  it('refuses another type, an empty file, and a file renamed to look like one', async () => {
    expect(formFileProblem(otherFile('form.docx'))).toMatch(/PDF, or a JPG or PNG/)
    expect(formFileProblem(new File([], 'form.pdf'))).toMatch(/empty/)
    expect((await inspectFormFile(otherFile('form.png', 'image/png'))).problem).toMatch(/not really a PNG/)
    expect((await inspectFormFile(png('form.pdf'))).problem).toMatch(/not really a PDF/)
  })

  it('lives under the project’s forms/ path, never documents/', () => {
    expect(isFormFilePathOf('p_g1', 'projects/p_g1/forms/abc123def456gh-FM-2004.png')).toBe(true)
    expect(isFormFilePathOf('p_g1', 'projects/p_g2/forms/abc123def456gh-FM-2004.pdf')).toBe(false)
    expect(isFormFilePathOf('p_g1', 'projects/p_g1/documents/abc123def456gh-FM-2004.pdf')).toBe(false)
  })
})

describe('which lines are uploaded and which are confirmed in the system', () => {
  it('FM-2004: the Panel Chair uploads; the Adviser and panel members confirm. The Approval Sheet: everyone uploads but the URO', () => {
    const f2004 = { formType: FORMS.F2004.code }
    expect([P.PANEL_CHAIR, P.ADVISER, P.PANEL_MEMBER].map(role => lineMethod(f2004, { role }))).toEqual(['upload', 'confirm', 'confirm'])
    const sheet = { formType: FORMS.APPROVAL.code }
    expect([P.ADVISER, P.PANEL_CHAIR, G.COORDINATOR, G.URO, G.DEAN, G.ASSOCIATE_DEAN].map(role => lineMethod(sheet, { role })))
      .toEqual(['upload', 'upload', 'upload', 'confirm', 'upload', 'upload'])
    expect(lineMethod({ formType: FORMS.F2005.code }, { role: P.ADVISER })).toBe('upload')
  })
})

describe('FM-2005 (F-05, F-06, F-06b) and the noted copy (M-20, M-21)', () => {
  it('Recommended: the Adviser’s copy goes to the Program Chair/Coordinator, whose noted copy endorses it', async () => {
    await readyToRecommend()
    await expect(runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE' })).rejects.toThrow(/Attach the FM-AAC-SOC-2005/)
    await runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE', outcome: 'Recommended', file: signed('FM-2005.pdf') })
    const f = formOf('p_g1', FORMS.F2005.code)
    expect(f).toMatchObject({ status: 'Circulating', payload: { outcome: 'Recommended' } })
    expect(f.signatories.map(s => [s.role, Boolean(s.signedAt)])).toEqual([[P.ADVISER, true], [G.COORDINATOR, false]])
    expect(latestCopy(f)).toMatchObject({ n: 1, role: P.ADVISER, fileName: 'FM-2005.pdf' })

    // G1's program Coordinator signs "Noted by" and uploads the noted copy.
    const pc = snap().users.find(u => (u.globalRoles ?? []).includes(G.COORDINATOR) && (u.programScope ?? []).includes(b('p_g1').project.program))
    await expect(runGate(as(pc.id), null, 'p_g1', { action: 'ENDORSE_FINAL_DEFENSE' })).rejects.toThrow(/Attach/)
    await runGate(as(pc.id), null, 'p_g1', { action: 'ENDORSE_FINAL_DEFENSE', file: signed('FM-2005_noted.pdf') })
    const noted = formOf('p_g1', FORMS.F2005.code)
    expect(noted.status).toBe('Signed')
    expect(noted.copies.map(c => c.role)).toEqual([P.ADVISER, G.COORDINATOR])
    expect(b('p_g1').project.currentStage).toBe('FINAL_DEFENSE_SCHEDULING')
  })

  it('Not Recommended: reasons required; the group stays in Implementation and is told why', async () => {
    await readyToRecommend()
    await expect(runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE', outcome: 'Not Recommended', file: signed() }))
      .rejects.toThrow(/reasons/)
    await runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE', outcome: 'Not Recommended', reasons: 'The ordering module is unfinished.', file: signed() })
    expect(b('p_g1').project.currentStage).toBe('IMPLEMENTATION')
    expect(formOf('p_g1', FORMS.F2005.code)).toMatchObject({ status: 'Not Recommended', payload: { outcome: 'Not Recommended', reasons: 'The ordering module is unfinished.' } })
    expect(recipients('p_g1', 'Not recommended for final defense')).toEqual(expect.arrayContaining(['s_kilo', 'f_foxtrot']))
    // The Adviser can recommend later, once the group is ready.
    await runGate(as('f_alpha'), null, 'p_g1', { action: 'RECOMMEND_FINAL_DEFENSE', file: signed() })
    expect(b('p_g1').project.currentStage).toBe('FINAL_DEFENSE_ENDORSEMENT')
  })
})

describe('the Approval Sheet: each signatory uploads the copy they signed (F-09, M-05, M-06)', () => {
  it('no signature without a file; the Dean and AD upload theirs to archive the project', async () => {
    await load(scenarioStore('T12')) // G3 at Clearance with both certificates
    const sheet = () => formOf('p_g3', FORMS.APPROVAL.code)
    await expect(signForm(as('f_delta'), null, 'p_g3', sheet().id)).rejects.toThrow(/Attach/)
    await signForm(as('f_delta'), null, 'p_g3', sheet().id, { file: signed('ApprovalSheet_adviser.pdf') })
    expect(latestCopy(sheet())).toMatchObject({ n: 1, role: P.ADVISER, uploadedBy: 'f_delta' })
    // The next signatories are told to download that copy and sign it.
    expect(snap().outbox.filter(m => m.event === 'Approval Sheet to sign').at(-1).body).toMatch(/Download it, sign it outside the system/)
    expect(snap().auditLogs.find(a => a.action === 'SIGNED_COPY_UPLOADED' && a.entityId === sheet().id).after)
      .toMatchObject({ line: P.ADVISER, copy: 1, file: 'ApprovalSheet_adviser.pdf' })
  })

  it('the URO clears in the system without a file; the executives cannot sign without one', async () => {
    await load(scenarioStore('T11')) // G3 at URO Verification
    await runGate(as('o_uniform'), null, 'p_g3', { action: 'URO_VERIFY' })
    expect(b('p_g3').project.currentStage).toBe('FINAL_APPROVAL')
    await expect(runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE' })).rejects.toThrow(/Attach the Approval Sheet/)
    await runGate(as('f_delta'), null, 'p_g3', { action: 'FINAL_APPROVE', file: signed('dean.pdf') })
    await runGate(as('f_echo'), null, 'p_g3', { action: 'FINAL_APPROVE', file: signed('ad.pdf') })
    expect(b('p_g3').project.currentStage).toBe('ARCHIVED')
    expect(formOf('p_g3', FORMS.APPROVAL.code).copies.slice(-2).map(c => [c.role, c.fileName])).toEqual([[G.DEAN, 'dean.pdf'], [G.ASSOCIATE_DEAN, 'ad.pdf']])
  })
})

describe('the archive (S-17) — every registered user, metadata only', () => {
  it('a student and a faculty member without roles browse it; the full records stay with the offices', () => {
    for (const id of ['s_kilo', 'f_bravo']) {
      const inst = resolveInstitution(user(id), snap())
      expect(can(inst, 'archive.browse')).toBe(true)
      expect(can(inst, 'records.search')).toBe(false)
    }
    expect(can(resolveInstitution(user('f_delta'), snap()), 'records.search')).toBe(true)
  })
})

describe('the Firebase path uploads the signed copy first, then sends its path', () => {
  it('signForm, recordVerdict, weekly logs and signing gates', async () => {
    const sent = []
    const put = vi.fn(async (path) => path)
    const remote = remoteActions({ send: async (name, args) => { sent.push({ name, args }); return null }, files: { put }, check: () => ({ isLink: false }) })
    const me = { id: 'f_alpha' }
    await remote.signForm(me, null, 'p_g3', 'form1', { file: signed('a.pdf'), formType: FORMS.APPROVAL.code })
    await remote.recordVerdict(me, null, 'p_g2', { verdict: 'Approved with Minor Revisions', remarks: 'x', file: signed('v.pdf') })
    await remote.submitWeeklyLog({ id: 's_kilo' }, null, 'p_g1', { file: signed('log.pdf'), note: 'n' })
    await remote.runGate(me, null, 'p_g3', { action: 'ENDORSE_TO_URO', signs: FORMS.APPROVAL.code, requires: () => null, file: signed('pc.pdf') })
    await remote.signForm(me, null, 'p_g3', 'form2') // a confirm line: no file, nothing uploaded
    expect(put).toHaveBeenCalledTimes(4)
    expect(put.mock.calls.map(c => c[2].metadata.formType)).toEqual([FORMS.APPROVAL.code, FORMS.F2004.code, FORMS.F2003.code, FORMS.APPROVAL.code])
    expect(put.mock.calls.every(c => c[0].startsWith('projects/') && c[0].includes('/forms/'))).toBe(true)
    expect(sent.map(s => s.name)).toEqual(['signForm', 'recordVerdict', 'submitWeeklyLog', 'runGate', 'signForm'])
    for (const s of sent.slice(0, 4)) {
      const input = s.args.at(-1)
      expect(input.file).toBeUndefined()
      expect(input.upload).toMatchObject({ storagePath: expect.stringContaining('/forms/'), fileName: expect.any(String) })
    }
    expect(sent[3].args[1]).toMatchObject({ action: 'ENDORSE_TO_URO' })
    expect(sent[3].args[1].requires).toBeUndefined()
  })
})

describe('exports (S-18): real Office files', () => {
  const unzip = (bytes) => {
    const names = []
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let at = 0; view.getUint32(at, true) === 0x04034b50;) {
      const size = view.getUint32(at + 18, true)
      const len = view.getUint16(at + 26, true)
      names.push(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + len)))
      at += 30 + len + size
    }
    return names
  }
  const table = { title: 'Projects', header: ['Group', 'Count'], rows: [['WD-401-1 <A & B>', 3]] }

  it('the workbook and the document hold the parts Office needs', () => {
    expect(unzip(xlsx(table))).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'])
    expect(unzip(docx(table))).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
  })

  it('escapes text and keeps numbers as numbers', () => {
    const sheet = new TextDecoder().decode(xlsx(table))
    expect(sheet).toContain('WD-401-1 &lt;A &amp; B&gt;')
    expect(sheet).toContain('<v>3</v>')
  })

  it('writes a well-formed ZIP: the end record counts every entry', () => {
    const bytes = zip([{ name: 'a.txt', text: 'a' }, { name: 'b.txt', text: 'bb' }])
    const end = new DataView(bytes.buffer, bytes.byteLength - 22)
    expect(end.getUint32(0, true)).toBe(0x06054b50)
    expect(end.getUint16(10, true)).toBe(2)
  })
})
