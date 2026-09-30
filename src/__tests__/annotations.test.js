// Non-destructive annotation (S3.6, S4.2, S5.5, S6.4, S7.5): a note pinned to a
// passage or area of one page, stored beside the file, never in it.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed, SEED_ROLES } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { addAnnotation, submitDocument, submitReview, runGate, recordVerdict } from '../services/actions.js'
import { viewBundle, canDo } from '../domain/guard.js'
import { normalizePosition, anchorOf } from '../domain/annotations.js'
import { DOC_TYPES as T, DOC_STATUS, DECISIONS, VERDICTS, MAX_PDF_MB } from '../domain/constants.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const at = (pid, stage) => load(applyStage(buildSeed(), pid, stage, { roles: SEED_ROLES[pid] }))
// G1 at S4.1: the group has just submitted a draft for the Adviser.
const draftAtS41 = async () => {
  await at('p_g1', 'PROPOSAL_DEVELOPMENT')
  return submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, fileName: 'draft.pdf', fileSize: 1000, fileType: 'application/pdf' })
}

const passage = { kind: 'text', page: 3, rects: [{ x: 0.1, y: 0.2, w: 0.7, h: 0.02 }, { x: 0.1, y: 0.22, w: 0.3, h: 0.02 }], quote: '  purposive   sampling was used ' }

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('position model', () => {
  it('normalizes a text selection and an area', () => {
    expect(normalizePosition(passage)).toEqual({ ...passage, quote: 'purposive sampling was used' })
    expect(normalizePosition({ kind: 'area', page: 1, rects: [{ x: 0, y: 0, w: 1, h: 1 }], quote: 'ignored' }).quote).toBe('')
    expect(normalizePosition(null)).toBeNull()
  })

  it.each([
    ['no page', { ...passage, page: 0 }],
    ['a box off the page', { ...passage, rects: [{ x: 0.8, y: 0.1, w: 0.5, h: 0.1 }] }],
    ['no marked area', { ...passage, rects: [] }],
    ['a text mark without words', { ...passage, quote: '   ' }],
    ['an unknown kind', { ...passage, kind: 'ink' }],
  ])('rejects %s', (_, position) => {
    expect(() => normalizePosition(position)).toThrow()
  })

  it('describes where a note sits', () => {
    expect(anchorOf(normalizePosition(passage))).toBe('p. 3 · “purposive sampling was used”')
    expect(anchorOf({ kind: 'area', page: 7, rects: [], quote: '' })).toBe('p. 7 · marked area')
    expect(anchorOf(null, 'Chapter 2')).toBe('Chapter 2')
    expect(anchorOf(null, '')).toBe('General')
  })
})

describe('addAnnotation', () => {
  it('S4.2 — the Adviser pins a note to a passage; the document record is untouched', async () => {
    const doc = await draftAtS41()
    const before = structuredClone(doc)
    const row = await addAnnotation(as('f_alpha'), null, 'p_g1', doc.id, { text: 'Justify the sampling.', category: 'Methodology Concern', position: passage })
    expect(row).toMatchObject({
      documentId: doc.id, documentVersion: doc.versionNumber, authorRole: 'Adviser', visibility: 'shared',
      anchor: 'p. 3 · “purposive sampling was used”', position: { kind: 'text', page: 3 },
    })
    expect(b('p_g1').documents.find(d => d.id === doc.id)).toEqual(before)
    // The group reads it with its position (S3.6 "Student: annotations").
    expect(viewBundle(user('s_kilo'), b('p_g1')).annotations.find(a => a.id === row.id).position.page).toBe(3)
  })

  it('a note without a position is a general comment', async () => {
    const doc = await draftAtS41()
    const row = await addAnnotation(as('f_alpha'), null, 'p_g1', doc.id, { text: 'Tighten chapter 1.', anchor: 'Chapter 1' })
    expect(row).toMatchObject({ position: null, anchor: 'Chapter 1' })
  })

  it('rejects a bad position or an empty comment, and writes nothing', async () => {
    const doc = await draftAtS41()
    const count = () => snap().annotations.length
    const n = count()
    await expect(addAnnotation(as('f_alpha'), null, 'p_g1', doc.id, { text: 'x', position: { ...passage, page: -1 } })).rejects.toThrow()
    await expect(addAnnotation(as('f_alpha'), null, 'p_g1', doc.id, { text: '   ', position: passage })).rejects.toThrow('Write the comment.')
    expect(count()).toBe(n)
  })

  it('T6 — Instructor 2 still cannot annotate, position or not', async () => {
    await at('p_g3', 'IMPLEMENTATION')
    const doc = await submitDocument(as('s_quebec'), null, 'p_g3', { docType: T.FINAL_MANUSCRIPT, fileName: 'd.pdf', fileSize: 1000, fileType: 'application/pdf' })
    await expect(addAnnotation(as('f_charlie'), null, 'p_g3', doc.id, { text: 'x', position: passage })).rejects.toThrow(/No role you hold/)
    // The Adviser, at the same stage and on the same version, can (S6.4).
    await expect(addAnnotation(as('f_delta'), null, 'p_g3', doc.id, { text: 'x', position: passage })).resolves.toMatchObject({ authorRole: 'Adviser' })
  })

  it('T4 — a positioned private panel note is its author’s alone', async () => {
    await load(scenarioStore('T4'))
    const doc = viewBundle(user('f_charlie'), b('p_g1')).documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT)
    const row = await addAnnotation(as('f_charlie'), null, 'p_g1', doc.id, { text: 'Ask about sampling.', position: passage })
    expect(row.visibility).toBe('private')
    const sees = (uid) => viewBundle(user(uid), b('p_g1')).annotations.some(a => a.id === row.id)
    expect(sees('f_charlie')).toBe(true)
    expect(sees('f_foxtrot')).toBe(false) // the Panel Chair
    expect(sees('f_alpha')).toBe(false) // the Adviser
    expect(sees('s_kilo')).toBe(false)
  })
})

describe('across the version loop and the verdict (Prompt 11 handoffs)', () => {
  const pdf = { fileName: 'cp.pdf', fileSize: 1000, fileType: 'application/pdf' }

  it('S3.6 — notes on a returned concept paper stay readable on v1; v2 starts clean and v1 takes no new ones', async () => {
    await submitReview(as('f_bravo'), null, 'p_g1', 'd_g1_topic', { decision: DECISIONS.APPROVE, approvedTopic: 'Library Seat Availability Monitor' })
    await runGate(as('f_bravo'), null, 'p_g1', { action: 'REGISTER_TOPIC' })
    const v1 = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf })
    const byI1 = await addAnnotation(as('f_bravo'), null, 'p_g1', v1.id, { text: 'Narrow the scope to one clinic.', position: passage })
    const byAdviser = await addAnnotation(as('f_alpha'), null, 'p_g1', v1.id, { text: 'Cite the queueing model.', position: { kind: 'area', page: 2, rects: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.2 }], quote: '' } })
    await submitReview(as('f_bravo'), null, 'p_g1', v1.id, { decision: DECISIONS.MAJOR, comment: 'See the annotations.' })
    const v2 = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.CONCEPT_PAPER, ...pdf })

    const student = viewBundle(user('s_kilo'), b('p_g1'))
    expect(student.documents.find(d => d.id === v1.id).status).toBe(DOC_STATUS.SUPERSEDED)
    expect(student.annotations.filter(a => a.documentId === v1.id).map(a => a.id)).toEqual([byI1.id, byAdviser.id])
    expect(student.annotations.filter(a => a.documentId === v2.id)).toEqual([])
    expect(canDo(user('f_alpha'), 'annotate', b('p_g1'), { doc: b('p_g1').documents.find(d => d.id === v1.id) }).ok).toBe(false)
    await expect(addAnnotation(as('f_alpha'), null, 'p_g1', v1.id, { text: 'late' })).rejects.toThrow(/current version/)
  })

  it('S5.5 → S5.6 — a pinned private note reaches the students on the verdict, position intact', async () => {
    const m = viewBundle(user('f_echo'), b('p_g2')).documents.find(d => d.docType === T.PROPOSAL_MANUSCRIPT)
    const row = await addAnnotation(as('f_echo'), null, 'p_g2', m.id, { text: 'Define “fair” for the queue.', position: passage })
    const seen = () => viewBundle(user('s_november'), b('p_g2')).annotations.find(a => a.id === row.id)
    expect(seen()).toBeUndefined()
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: VERDICTS.MINOR, remarks: 'Minor revisions.' })
    expect(seen()).toMatchObject({ visibility: 'private', position: { page: 3, kind: 'text' } })
    expect(seen().releasedAt).toBeTruthy()
    // Never between panelists, even after the verdict.
    expect(viewBundle(user('f_alpha'), b('p_g2')).annotations.some(a => a.id === row.id)).toBe(false)
  })
})

describe('submitDocument keeps the file beside the record', () => {
  const pdf = (size) => ({ fileName: 'Chapters 1-3.pdf', fileSize: size, fileType: 'application/pdf' })

  it('stores the bytes at a path of their own', async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const doc = await submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, file, ...pdf(file.size) })
    expect(doc.storagePath).toMatch(/^projects\/p_g1\/documents\/\w+-Chapters_1-3\.pdf$/)
  })

  it(`rejects a file over ${MAX_PDF_MB} MB`, async () => {
    await at('p_g1', 'PROPOSAL_DEVELOPMENT')
    await expect(submitDocument(as('s_kilo'), null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, ...pdf(MAX_PDF_MB * 1024 * 1024 + 1) }))
      .rejects.toThrow(`larger than ${MAX_PDF_MB} MB`)
  })
})
