// Stands in for src/backend/index.js in the server bundle
// (scripts/functions/build.mjs): the service code's `db` and `files`.
import { store } from './store.js'
import { serverFiles } from './files.js'

export const db = store
export const backendName = 'firebase'
export const isLiveBackend = process.env.FUNCTIONS_EMULATOR !== 'true'
export const files = serverFiles
