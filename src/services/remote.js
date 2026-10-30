// Which service calls run on the server in the Firebase build, and how their
// arguments travel. The browser (api.js) sends `{ name, args }` to the `act`
// Cloud Function; the function (functions/app/entry.js) runs the same
// actions.js code on a fresh snapshot, as the signed-in caller.
//
//   actor     (actor, snap, ...args) — the server takes the caller from the ID
//             token, never from `actor`; `snap` is never sent
//   register  (snap, input) — before the account exists: the caller is the
//             Auth account whose email the input names
//   verified  (email) — the caller's own, verified Auth email
//
// Not here on purpose: verifyEmail (the local build's verification link). In
// the Firebase build Firebase Auth verifies the address (verified above), and
// every signed-in account can read `users`, tokens included — a token must
// never be enough to verify someone else's account on the server.

export const REMOTE = {
  createProject: 'actor',
  createGroupDraft: 'actor',
  inviteToGroupDraft: 'actor',
  respondToGroupInvite: 'actor',
  leaveGroupDraft: 'actor',
  submitGroupDraft: 'actor',
  decideGroupDraft: 'actor',
  addMember: 'actor',
  removeMember: 'actor',
  assignRole: 'actor',
  unassignRole: 'actor',
  submitDocument: 'actor',
  returnToGroup: 'actor',
  addAnnotation: 'actor',
  submitReview: 'actor',
  submitWeeklyLog: 'actor',
  decideWeeklyLog: 'actor',
  confirmMilestones: 'actor',
  confirmReadiness: 'actor',
  confirmPostDefenseRequirements: 'actor',
  scheduleDefense: 'actor',
  recordVerdict: 'actor',
  correctVerdict: 'actor',
  signForm: 'actor',
  holdRevisions: 'actor',
  runGate: 'actor',
  setGlobalRoles: 'actor',
  setAccountStatus: 'actor',
  setProgramScope: 'actor',
  revokeCapability: 'actor',
  liftOverride: 'actor',
  updateRevisionDays: 'actor',
  registerAccount: 'register',
  confirmProviderVerification: 'verified',
}

/**
 * Where the Firebase build's writes go (VITE_WRITE_PATH):
 *   functions  through `act` — what firestore.rules expect (client writes denied)
 *   direct     the browser writes to Firestore itself, as before `act`
 *              existed — works only where the rules allow client writes (the
 *              emulators' open rules), or against a live project until `act`
 *              is deployed. The guard then runs in the browser only.
 * Unset: `functions` on the emulators, `direct` on a live project. Never a
 * silent fallback: if `act` cannot be reached, the call fails.
 */
export function writePathOf(env = {}) {
  const set = String(env.VITE_WRITE_PATH ?? '').trim()
  if (set === 'functions' || set === 'direct') return set
  if (set) console.warn(`VITE_WRITE_PATH="${set}" is not "functions" or "direct"; using the default.`)
  return env.VITE_USE_EMULATORS === 'true' ? 'functions' : 'direct'
}
