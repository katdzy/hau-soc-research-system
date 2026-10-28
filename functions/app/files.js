/**
 * The file store as the service code sees it inside a Cloud Function. The
 * browser uploads the bytes straight to Cloud Storage (storage.rules decide
 * who may); before the version is recorded, verify() checks the object it
 * names: this project, this document type, uploaded by the caller, a real PDF
 * within the size limit, and bytes that still match the fingerprint they were
 * uploaded with.
 */
import { getStorage } from 'firebase-admin/storage'
import { inspectPdf } from '../../src/domain/uploads.js'

const refuse = (message) => { throw new Error(message) }

export const serverFiles = {
  async put() {
    refuse('Files are uploaded from the browser, not by the server.')
  },

  // No text extraction on the server yet: the AI summary records its
  // placeholder sections (summarizeForMilestone).
  async url() {
    return null
  },

  async verify(path, { projectId, docType, uploadedBy, fileName }) {
    const file = getStorage().bucket().file(path)
    const [exists] = await file.exists()
    if (!exists) refuse('The uploaded file was not found. Submit it again.')
    const [meta] = await file.getMetadata()
    const custom = meta.metadata ?? {}
    if (custom.projectId !== projectId || custom.docType !== docType) refuse('That file was uploaded for a different submission. Submit it again.')
    if (custom.uploadedBy !== uploadedBy) refuse('That file was uploaded by someone else.')
    if (meta.contentType !== 'application/pdf') refuse('Only PDF files can be submitted.')

    const [bytes] = await file.download()
    const scan = await inspectPdf(new File([bytes], fileName, { type: meta.contentType }))
    if (scan.problem) refuse(scan.problem)
    if (scan.sha256 !== custom.sha256) refuse('The stored file does not match what was uploaded. Submit it again.')
    return scan
  },
}
