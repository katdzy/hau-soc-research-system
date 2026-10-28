// What a submitted PDF must be, checked the same way by the upload forms and
// by submitDocument — so the student sees, before the round trip, the message
// the service would give. Pure: no store, no network.

import { MAX_PDF_MB, isPdfFile } from './constants.js'

export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024

// The PDF header, "%PDF-". The spec allows junk before it; readers accept it
// within the first 1024 bytes, so we look there too.
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]
const HEADER_WINDOW = 1024

/** Why this file cannot be submitted, from its name, type and size alone, or null. */
export function pdfProblem(file) {
  if (!file) return 'Attach the PDF file.'
  if (!isPdfFile(file.name, file.type)) return 'Only PDF files can be submitted.'
  if (!file.size) return 'The file is empty. Export the PDF again and attach that.'
  if (file.size > MAX_PDF_BYTES) return `The file is larger than ${MAX_PDF_MB} MB.`
  return null
}

function hasPdfHeader(bytes) {
  const end = Math.min(bytes.length, HEADER_WINDOW) - HEADER.length
  for (let i = 0; i <= end; i++) {
    if (HEADER.every((b, j) => bytes[i + j] === b)) return true
  }
  return false
}

const hex = (buffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * Reads the file once: checks it really is a PDF (a renamed .docx passes the
 * name check, not this one) and fingerprints it, so the record can later be
 * matched against the stored bytes.
 * → { problem } or { sha256, size }
 */
export async function inspectPdf(file) {
  const problem = pdfProblem(file)
  if (problem) return { problem }
  const buffer = await file.arrayBuffer()
  if (!hasPdfHeader(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, HEADER_WINDOW)))) {
    return { problem: 'This file is not a PDF, even though its name ends in .pdf. Export or save it as PDF and attach that.' }
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return { sha256: hex(digest), size: buffer.byteLength }
}
