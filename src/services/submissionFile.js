// A submission's PDF into the file store, the one way both builds do it:
// actions.js (local build, and the Firebase build's direct writes) and api.js
// (the Firebase build, before it calls `act`). The metadata is what
// storage.rules accepts (describesUpload) and what the server checks before
// recording the version (functions/app/files.js verify).

import { inspectPdf, inspectFormFile } from '../domain/uploads.js'
import { filePath, formFilePath } from '../backend/filePath.js'

/** → { storagePath, scan: { sha256, size }, fileName } — or throws with the student's message. */
export async function uploadSubmissionFile(store, { projectId, docType, userId, file, onProgress, signal }) {
  const scan = await inspectPdf(file)
  if (scan.problem) throw new Error(scan.problem)
  const fileName = String(file.name).trim()
  const storagePath = await store.put(filePath(projectId, fileName), file, {
    metadata: { projectId, docType, uploadedBy: userId, sha256: scan.sha256 },
    onProgress,
    signal,
  })
  return { storagePath, scan, fileName }
}

/**
 * A form signed outside the system (PDF, or a JPG/PNG scan or photo) into the
 * file store. → { storagePath, scan: { sha256, size, contentType }, fileName }
 */
export async function uploadFormFile(store, { projectId, formType, userId, file, onProgress, signal }) {
  const scan = await inspectFormFile(file)
  if (scan.problem) throw new Error(scan.problem)
  const fileName = String(file.name).trim()
  const storagePath = await store.put(formFilePath(projectId, fileName), file, {
    contentType: scan.contentType,
    metadata: { projectId, formType, uploadedBy: userId, sha256: scan.sha256 },
    onProgress,
    signal,
  })
  return { storagePath, scan, fileName }
}
