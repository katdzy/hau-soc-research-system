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
import { uploadSubmissionFile, uploadFormFile } from './submissionFile.js'
import { FORMS } from '../domain/constants.js'
import { getSessionUserId } from '../state/session.js'
import { call } from './push.js'
import { emulatorHost } from '../backend/emulatorHost.js'

const EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true'

const UNREACHABLE = new Set(['functions/unavailable', 'functions/deadline-exceeded'])

/**
 * What a failed `act` call tells the user. The SDK ends each message with the
 * HTTP status ("… [403]"); status 0 means no answer at all — the request never
 * reached the function (nothing listening on its port, another program on it,
 * or the connection dropped), which the SDK reports as a bare "internal".
 */
export function actErrorMessage(e, { emulators = false } = {}) {
  const raw = String(e?.message ?? '')
  const status = Number(raw.match(/\[(\d+)\]$/)?.[1] ?? NaN)
  const text = raw.replace(/\s*\[\d+\]$/, '').trim()
  if (UNREACHABLE.has(e?.code) || (e?.code === 'functions/internal' && status === 0)) {
    return emulators
      ? 'The server did not answer: nothing replied on the Functions emulator (' + emulatorHost() + ':5001). Check that `docker compose ps` shows the emulators healthy, and that no other program on this computer uses port 5001.'
      : 'The server cannot be reached. Check your connection and try again.'
  }
  // A crash the function did not turn into a message of its own.
  if (e?.code === 'functions/internal' && (!text || text === 'internal' || text === 'INTERNAL')) {
    return 'Something went wrong on the server. Try again; if it keeps happening, tell the System Administrator.'
  }
  return text || 'The request failed. Try again.'
}

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

  // A form signed outside the system travels the same way: the browser puts
  // the copy in the file store, the server checks it (verifyForm) and records
  // it. `formTypeOf` names the form, which storage.rules require.
  const withSignedCopy = (name, formTypeOf) => (actor, _snap, projectId, ...args) => {
    const input = args.at(-1)
    if (!(input?.file instanceof Blob)) return wrapped[name](actor, _snap, projectId, ...args)
    return once(`${name}:${projectId}:upload`, async () => {
      const { file, onProgress, signal, ...rest } = input
      const { storagePath, fileName } = await uploadFormFile(store, {
        projectId, formType: formTypeOf(...args), userId: actor.id, file, onProgress, signal,
      })
      return send(name, [projectId, ...plain([...args.slice(0, -1), { ...rest, upload: { storagePath, fileName } }])])
    })
  }
  return {
    ...wrapped,
    signForm: withSignedCopy('signForm', (_formId, input) => input.formType),
    recordVerdict: withSignedCopy('recordVerdict', () => FORMS.F2004.code),
    correctVerdict: withSignedCopy('correctVerdict', () => FORMS.F2004.code),
    submitWeeklyLog: withSignedCopy('submitWeeklyLog', () => FORMS.F2003.code),
    runGate: withSignedCopy('runGate', (gate) => gate.signs ?? FORMS.F2005.code),
  }
}

async function sendToAct(name, args) {
  try {
    // On the Emulator Suite the dev panel's personas are not Auth accounts:
    // name the persona (honoured by the emulator only — functions/index.js).
    const res = await call('act', { name, args, ...(EMULATORS ? { as: getSessionUserId() } : {}) })
    return res.data?.result ?? null
  } catch (e) {
    if (EMULATORS) console.warn(`act ${name} failed:`, e?.code, e?.message)
    throw new Error(actErrorMessage(e, { emulators: EMULATORS }))
  }
}

/** 'functions' | 'direct' — shown in the rail; 'local' outside the Firebase build. */
export const writePath = db.name === 'firebase' ? writePathOf(import.meta.env) : 'local'

const remote = writePath === 'functions' ? remoteActions({ send: sendToAct, files }) : null
const pick = (name) => remote?.[name] ?? local[name]

export const createProject = pick('createProject')
export const createGroupDraft = pick('createGroupDraft')
export const inviteToGroupDraft = pick('inviteToGroupDraft')
export const respondToGroupInvite = pick('respondToGroupInvite')
export const leaveGroupDraft = pick('leaveGroupDraft')
export const submitGroupDraft = pick('submitGroupDraft')
export const decideGroupDraft = pick('decideGroupDraft')
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
export const holdRevisions = pick('holdRevisions')
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
