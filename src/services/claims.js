/**
 * Keeps this browser's ID token in step with the custom claims firestore.rules
 * and storage.rules read (functions/claims.js). After a Firebase Auth sign-in
 * it asks the refreshClaims function to compute them, then listens to
 * `claimsSync/{uid}`: whenever a Cloud Function changes the claims it touches
 * that document, and the token is refreshed at once rather than within the
 * hour. Firebase build only — the dev panel's personas never sign in to Auth.
 */
import { db } from '../backend/index.js'
import { getAuthInstance } from './authService.js'
import { call } from './push.js'

let started = false

export async function followClaims() {
  if (started || db.name !== 'firebase') return
  started = true
  const { auth, onAuthStateChanged } = await getAuthInstance()
  let stop = null
  onAuthStateChanged(auth, async (user) => {
    stop?.()
    stop = null
    if (!user) return
    // Not deployed (or not emulated) yet: the token simply carries no claims.
    await call('refreshClaims').catch(() => {})
    stop = db.watch('claimsSync', user.uid, (marker) => {
      if (marker) user.getIdToken(true).catch(() => {})
    })
  })
}
