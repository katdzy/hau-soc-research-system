// Where a document version's file lives — shared by the browser file store
// (files.js), the service (actions.js) and, through the server bundle, the
// Cloud Functions. One path per version, never reused.

const unique = () => `${Date.now().toString(36)}${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
const safeName = (fileName, fallback) => String(fileName ?? fallback).replace(/[^\w.-]+/g, '_').slice(-80)

export const filePath = (projectId, fileName) =>
  `projects/${projectId}/documents/${unique()}-${safeName(fileName, 'file.pdf')}`

/** A path filePath() could have made for this project (storage.rules checks the same shape). */
export const isFilePathOf = (projectId, path) =>
  typeof path === 'string' &&
  path.startsWith(`projects/${projectId}/documents/`) &&
  /^[a-z0-9]{12,}-[A-Za-z0-9_.-]{0,76}\.pdf$/i.test(path.slice(`projects/${projectId}/documents/`.length))

/** A signed form's copy (FM-AAC-SOC-2003/2004/2005, Approval Sheet): PDF, JPG or PNG. */
export const formFilePath = (projectId, fileName) =>
  `projects/${projectId}/forms/${unique()}-${safeName(fileName, 'form.pdf')}`

export const isFormFilePathOf = (projectId, path) =>
  typeof path === 'string' &&
  path.startsWith(`projects/${projectId}/forms/`) &&
  /^[a-z0-9]{12,}-[A-Za-z0-9_.-]{0,76}\.(pdf|jpe?g|png)$/i.test(path.slice(`projects/${projectId}/forms/`.length))
