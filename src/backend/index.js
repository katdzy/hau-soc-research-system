import { localAdapter } from './localAdapter.js'
import { firebaseAdapter } from './firebaseAdapter.js'
import { localFiles, firebaseFiles } from './files.js'

// Tests always run on the in-memory store: Vitest loads .env, and .env may
// point at a real Firebase project.
const mode = import.meta.env.MODE === 'test' ? 'local' : (import.meta.env.VITE_BACKEND ?? 'local')

/** True when writes would reach a real Firebase project (not local, not the emulators). */
export const isLiveBackend = mode === 'firebase' && import.meta.env.VITE_USE_EMULATORS !== 'true'

export const db = mode === 'firebase' ? firebaseAdapter : localAdapter
export const backendName = db.name

// Submitted files (PDF bytes) live beside the records, never inside them.
export const files = mode === 'firebase' ? firebaseFiles : localFiles
