// Where a document version's file lives — shared by the browser file store
// (files.js), the service (actions.js) and, through the server bundle, the
// Cloud Functions. One path per version, never reused.

export const filePath = (projectId, fileName) => {
  const safe = String(fileName ?? 'file.pdf').replace(/[^\w.-]+/g, '_').slice(-80)
  const unique = `${Date.now().toString(36)}${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
  return `projects/${projectId}/documents/${unique}-${safe}`
}

/** A path filePath() could have made for this project (storage.rules checks the same shape). */
export const isFilePathOf = (projectId, path) =>
  typeof path === 'string' &&
  path.startsWith(`projects/${projectId}/documents/`) &&
  /^[a-z0-9]{12,}-[A-Za-z0-9_.-]{0,76}\.pdf$/i.test(path.slice(`projects/${projectId}/documents/`.length))
