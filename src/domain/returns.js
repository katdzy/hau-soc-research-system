// S9.4 URO return path (NEW-7, NEW-45, NEW-46): which returned documents the
// group still has to replace. Shared by the stage machine, the guard, the
// upload rules and the form signing rules.

import { FLAGS } from './flags.js'

const latestOf = (b, docType) =>
  b.documents.filter(d => d.docType === docType).sort((x, y) => y.versionNumber - x.versionNumber)[0] ?? null

/** The URO's latest return of this project, or null. */
export const uroReturnOf = (b) => (b.project.uroReturns ?? []).at(-1) ?? null

/**
 * Returned document types the group has not uploaded a new version of yet:
 * the returned version is still the latest (compared by id, not by time).
 */
export function uroReturnOutstanding(b) {
  const r = FLAGS.URO_RETURN_PATH ? uroReturnOf(b) : null
  if (!r) return []
  return r.docTypes.filter(t => r.documentIds.includes(latestOf(b, t)?.id))
}
