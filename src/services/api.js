/**
 * What the UI calls to change anything.
 *
 *   local build     actions.js itself, in the browser
 *   Firebase build  each write in remote.js goes to the `act` Cloud Function,
 *                   which runs the same actions.js code on the server as the
 *                   signed-in caller (functions/app/entry.js); firestore.rules
 *                   refuse every write from the browser. VITE_WRITE_PATH=direct
 *                   switches back to browser writes (writePathOf, remote.js)
 *
 * The result arrives as the function's return value; the change itself
 * reaches every screen through the Firestore listeners, like anyone else's.
 *
 * A submission's PDF is the one thing the browser still writes: it uploads
 * the bytes straight to Cloud Storage (storage.rules), after the same checks
 * the server will run, then sends the path; the server checks the stored file
 * before recording the version (functions/app/files.js).
 */
import * as local from './actions.js'
import { REMOTE, writePathOf } from './remote.js'
import { db, files } from '../backend/index.js'
import { uploadSubmissionFile } from './submissionFile.js'
import { getSessionUserId } from '../state/session.js'
import { call } from './push.js'

const EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true'

const UNREACHABLE = new Set(['functions/unavailable', 'functions/deadline-exceeded'])

/** The service calls, sent to the server with `send(name, args) → result`. */
export function remoteActions({ send, files: store, check = local.checkSubmission }) {
  // A second identical call while the first is out (a double-click) is
  // refused, as perform() does in the local build.
  const inflight = new Set()
  const once = async (key, fn) => {
    if (inflight.has(key)) throw new Error('That request is already being processed.')
    inflight.add(key)
    try { return await fn() } finally { inflight.delete(key) }
  }

  // Only data travels: a gate object's functions (runGate) and undefined
  // fields drop out; the server re-reads anything it needs from its own copy.
  const plain = (args) => JSON.parse(JSON.stringify(args))

  const byShape = {
    actor: (name) => (_actor, _snap, ...args) => {
      const data = plain(args)
      return once(`${name}:${JSON.stringify(data)}`, () => send(name, data))
    },
    register: (name) => (_snap, input) => once(`${name}:${input?.email}`, () => send(name, [plain(input)])),
    verified: (name) => (value) => once(`${name}:${value}`, () => send(name, [value])),
  }
  const wrapped = Object.fromEntries(Object.entries(REMOTE).map(([name, shape]) => [name, byShape[shape](name)]))

  wrapped.submitDocument = (actor, _snap, projectId, input) =>
    once(`submitDocument:${projectId}:${input.docType}`, async () => {
      const { isLink } = check(actor, projectId, input)
      const { file, onProgress, signal, ...rest } = input
      if (isLink) return send('submitDocument', [projectId, plain(rest)])
      const { storagePath, fileName } = await uploadSubmissionFile(store, {
        projectId, docType: input.docType, userId: actor.id, file, onProgress, signal,
      })
      return send('submitDocument', [projectId, plain({ ...rest, storagePath, fileName })])
    })

  return wrapped
}

async function sendToAct(name, args) {
  try {
    // On the Emulator Suite the dev panel's personas are not Auth accounts:
    // name the persona (honoured by the emulator only — functions/index.js).
    const res = await call('act', { name, args, ...(EMULATORS ? { as: getSessionUserId() } : {}) })
    return res.data?.result ?? null
  } catch (e) {
    if (UNREACHABLE.has(e?.code)) throw new Error('The server cannot be reached. Check your connection and try again.')
    // The SDK appends the HTTP status ("… [403]"); the message is the server's own.
    throw new Error(String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '') || 'The request failed. Try again.')
  }
}

/** 'functions' | 'direct' — shown in the rail; 'local' outside the Firebase build. */
export const writePath = db.name === 'firebase' ? writePathOf(import.meta.env) : 'local'

const remote = writePath === 'functions' ? remoteActions({ send: sendToAct, files }) : null
const pick = (name) => remote?.[name] ?? local[name]

export const createProject = pick('createProject')
export const addMember = pick('addMember')
export const removeMember = pick('removeMember')
export const assignRole = pick('assignRole')
export const unassignRole = pick('unassignRole')
export const submitDocument = pick('submitDocument')
export const returnToGroup = pick('returnToGroup')
export const addAnnotation = pick('addAnnotation')
export const submitReview = pick('submitReview')
export const submitWeeklyLog = pick('submitWeeklyLog')
export const decideWeeklyLog = pick('decideWeeklyLog')
export const confirmMilestones = pick('confirmMilestones')
export const confirmReadiness = pick('confirmReadiness')
export const confirmPostDefenseRequirements = pick('confirmPostDefenseRequirements')
export const scheduleDefense = pick('scheduleDefense')
export const recordVerdict = pick('recordVerdict')
export const correctVerdict = pick('correctVerdict')
export const signForm = pick('signForm')
export const runGate = pick('runGate')
export const setGlobalRoles = pick('setGlobalRoles')
export const setAccountStatus = pick('setAccountStatus')
export const setProgramScope = pick('setProgramScope')
export const revokeCapability = pick('revokeCapability')
export const liftOverride = pick('liftOverride')
export const updateRevisionDays = pick('updateRevisionDays')
export const registerAccount = pick('registerAccount')
export const confirmProviderVerification = pick('confirmProviderVerification')

// Reads and helpers: the same in both builds. The local build's overdue check,
// password-reset mail and verification link; in the Firebase build a schedule
// and Firebase Auth do those (functions/index.js overdueRevisions,
// authService.js, confirmProviderVerification).
export {
  ASSIGNING_ACTION, ASSIGNING_CAPABILITY, assignmentConflict, defenseTypeAt, check, checkSubmission,
  flagOverdueRevisions, requestPasswordReset, verifyEmail,
} from './actions.js'
