import { localAdapter } from './localAdapter.js'
import { firebaseAdapter } from './firebaseAdapter.js'

const mode = import.meta.env.VITE_BACKEND ?? 'local'

export const db = mode === 'firebase' ? firebaseAdapter : localAdapter
export const backendName = db.name
