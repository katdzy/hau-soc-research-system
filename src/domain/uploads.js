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

// --- Signed forms ---------------------------------------------------------------
// Forms are filled in and signed outside the system (all e-signatures on the
// PDF, or all wet signatures on paper) and uploaded back: a PDF, or a scan or
// photo of the paper (Figma E-01, F-01).

export const FORM_FILE_TYPES = {
  'application/pdf': { ext: ['pdf'], magic: HEADER, window: HEADER_WINDOW },
  'image/jpeg': { ext: ['jpg', 'jpeg'], magic: [0xff, 0xd8, 0xff], window: 3 },
  'image/png': { ext: ['png'], magic: [0x89, 0x50, 0x4e, 0x47], window: 4 },
}
export const FORM_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const extOf = (name = '') => String(name).toLowerCase().split('.').pop()

/** The form file's content type from its name, or null if it is not one we take. */
export const formFileType = (name = '') =>
  Object.entries(FORM_FILE_TYPES).find(([, t]) => t.ext.includes(extOf(name)))?.[0] ?? null

/** Why this signed form cannot be uploaded, from its name and size alone, or null. */
export function formFileProblem(file) {
  if (!file) return 'Attach the signed form.'
  if (!formFileType(file.name)) return 'Upload the form as a PDF, or a JPG or PNG scan or photo.'
  if (!file.size) return 'The file is empty. Scan or export the form again.'
  if (file.size > MAX_PDF_BYTES) return `The file is larger than ${MAX_PDF_MB} MB.`
  return null
}

function startsWith(bytes, magic, window) {
  const end = Math.min(bytes.length, window) - magic.length
  for (let i = 0; i <= end; i++) {
    if (magic.every((b, j) => bytes[i + j] === b)) return true
  }
  return false
}

/**
 * The bytes really are what the name says (a PDF, a JPEG or a PNG), and their
 * fingerprint. → { problem } or { sha256, size, contentType }
 */
export async function inspectFormFile(file) {
  const problem = formFileProblem(file)
  if (problem) return { problem }
  const contentType = formFileType(file.name)
  const { magic, window } = FORM_FILE_TYPES[contentType]
  const buffer = await file.arrayBuffer()
  if (!startsWith(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, HEADER_WINDOW)), magic, window)) {
    return { problem: `This file is not really a ${extOf(file.name).toUpperCase()}. Save the form as PDF, JPG or PNG and attach that.` }
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return { sha256: hex(digest), size: buffer.byteLength, contentType }
}
