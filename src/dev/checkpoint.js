// Dev-only (R9). One saved copy of the whole store, so a walkthrough can be
// replayed from a chosen moment. Kept in this browser's localStorage, apart
// from the live store; resetting the seed does not clear it.

import { COLLECTIONS } from '../backend/schema.js'

const KEY = 'hausoc.checkpoint.v3'

/** Snapshot arrays → the keyed store shape `db.replaceAll` takes. */
export const toStore = (snap) =>
  Object.fromEntries(COLLECTIONS.map(c => [c, Object.fromEntries((snap[c] ?? []).map(r => [r.id, r]))]))

export function readCheckpoint() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeCheckpoint(snap, meId) {
  const cp = { savedAt: new Date().toISOString(), signedInAs: meId ?? null, store: toStore(snap) }
  localStorage.setItem(KEY, JSON.stringify(cp))
  return cp
}
