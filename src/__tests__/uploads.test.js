// The PDF checks shared by the upload form and submitDocument (domain/uploads.js).

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { pdfFile, otherFile } from './pdfFixture.js'
import { pdfProblem, inspectPdf, MAX_PDF_BYTES } from '../domain/uploads.js'
import { filePath } from '../backend/files.js'

describe('pdfProblem — what the name, type and size already tell', () => {
  it('names the first thing wrong', () => {
    expect(pdfProblem(null)).toMatch(/Attach the PDF/)
    expect(pdfProblem(otherFile('notes.docx'))).toMatch(/Only PDF/)
    expect(pdfProblem(otherFile('scan.pdf', 'image/png'))).toMatch(/Only PDF/)
    expect(pdfProblem(new File([], 'empty.pdf', { type: 'application/pdf' }))).toMatch(/empty/)
    expect(pdfProblem({ name: 'big.pdf', type: 'application/pdf', size: MAX_PDF_BYTES + 1 })).toMatch(/larger than/)
  })

  it('accepts a PDF, including one the browser gave no type', () => {
    expect(pdfProblem(pdfFile('ok.PDF'))).toBeNull()
    expect(pdfProblem(pdfFile('ok.pdf', 1000, ''))).toBeNull()
    expect(pdfProblem({ name: 'edge.pdf', type: 'application/pdf', size: MAX_PDF_BYTES })).toBeNull()
  })
})

describe('inspectPdf — what only the bytes tell', () => {
  it('fingerprints a PDF with SHA-256', async () => {
    const file = pdfFile('x.pdf', 3000)
    const expected = createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
    expect(await inspectPdf(file)).toEqual({ sha256: expected, size: 3000 })
  })

  it('refuses a file renamed to .pdf', async () => {
    const { problem } = await inspectPdf(otherFile('thesis.pdf', 'application/pdf', 'PK\u0003\u0004'))
    expect(problem).toMatch(/not a PDF/)
  })

  it('finds the header after leading junk, as PDF readers do — but only within 1 KB', async () => {
    const at = (offset) => new File([new Uint8Array(offset), '%PDF-1.7\n'], 'x.pdf', { type: 'application/pdf' })
    expect((await inspectPdf(at(500))).problem).toBeUndefined()
    expect((await inspectPdf(at(2000))).problem).toMatch(/not a PDF/)
  })
})

describe('filePath', () => {
  it('never repeats, and keeps a safe form of the name', () => {
    const a = filePath('p_g1', 'Chapter 1 (final).pdf')
    const b = filePath('p_g1', 'Chapter 1 (final).pdf')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^projects\/p_g1\/documents\/[a-z0-9]+-Chapter_1_final_\.pdf$/)
  })
})
