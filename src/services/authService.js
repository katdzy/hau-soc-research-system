import { EMAIL_DOMAINS, isInstitutionalEmail, normalizeEmail } from '../domain/constants.js'
import { emulatorHost } from '../backend/emulatorHost.js'

/**
 * Validates whether an email belongs to an allowed institutional domain.
 * Allowed domains: @hau.edu.ph and @student.hau.edu.ph
 */
function validateInstitutionalEmail(email = '') {
  const norm = normalizeEmail(email)
  if (!norm) {
    return { valid: false, error: 'Email address is required.' }
  }
  // Exact domain match (constants.js) — the same check registration uses.
  if (!isInstitutionalEmail(norm)) {
    return {
      valid: false,
      error: `Access is strictly restricted to ${Object.values(EMAIL_DOMAINS).join(' and ')} institutional email addresses.`,
    }
  }
  return { valid: true, error: null }
}

let authModulePromise = null

export async function getAuthInstance() {
  if (!authModulePromise) {
    authModulePromise = (async () => {
      const [{ initializeApp }, authModule] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
      ])

      const app = initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
      })

      const auth = authModule.getAuth(app)

      if (import.meta.env.VITE_USE_EMULATORS === 'true') {
        try {
          authModule.connectAuthEmulator(auth, `http://${emulatorHost()}:9099`, { disableWarnings: true })
        } catch {
          // Emulator may already be connected in HMR
        }
      }

      return {
        auth,
        ...authModule,
      }
    })()
  }
  return authModulePromise
}

/**
 * Sends Firebase's verification email with a "Continue" link back to this app,
 * where the verification screen (pages/VerifyEmail.jsx, Figma S-16) says the
 * address is confirmed. Firebase accepts the link only for an authorized
 * domain (localhost and the hosting domain by default); from anywhere else,
 * e.g. another PC on the network, the email goes out without it.
 */
async function sendVerification(user) {
  const { sendEmailVerification } = await getAuthInstance()
  const url = typeof window !== 'undefined' ? `${window.location.origin}/?verified=1` : null
  if (!url) return sendEmailVerification(user)
  try {
    await sendEmailVerification(user, { url })
  } catch (err) {
    if (!/unauthorized-continue-uri|invalid-continue-uri|missing-continue-uri/.test(err?.code ?? '')) throw err
    await sendEmailVerification(user)
  }
}

/** Firebase Auth's error codes, in words a student or faculty member can act on. */
const AUTH_MESSAGES = {
  'auth/invalid-credential': 'That email and password don’t match an account. Check both, or reset your password.',
  'auth/wrong-password': 'That email and password don’t match an account. Check both, or reset your password.',
  'auth/user-not-found': 'No account is registered to that institutional address. Create one first.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/user-disabled': 'This account has been disabled. Contact the System Administrator.',
  'auth/too-many-requests': 'Too many attempts from this device. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
  'auth/weak-password': 'Choose a stronger password: at least 6 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'That address already has an account. Log in instead, or reset the password.',
}

/** A readable message for an error from Firebase Auth (anything else keeps its own). */
export function authErrorMessage(err, fallback = 'Something went wrong. Try again.') {
  if (AUTH_MESSAGES[err?.code]) return AUTH_MESSAGES[err.code]
  // An Auth code without a sentence of its own: "Firebase: Error (auth/…)" says nothing to a person.
  if (/^auth\//.test(err?.code ?? '') || /\(auth\/[a-z-]+\)/.test(err?.message ?? '')) return fallback
  return err?.message || fallback
}

const friendly = (err) => Object.assign(new Error(authErrorMessage(err)), { code: err?.code })

/**
 * Registers a new user with Firebase Authentication and sends an email verification link.
 *
 * An address whose Auth account exists already (`resumed`) is signed in with
 * the password given instead, when it matches: a registration that created the
 * login but never wrote the account record (a dropped connection, a refused
 * write) can then be finished, rather than leaving an address that can neither
 * register ("already in use") nor log in ("no account"). The caller decides
 * what is left to do; a verification email goes out only for a new login.
 */
export async function registerWithFirebase(email, password) {
  const check = validateInstitutionalEmail(email)
  if (!check.valid) {
    throw new Error(check.error)
  }

  const { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = await getAuthInstance()
  const address = email.trim().toLowerCase()
  try {
    const { user } = await createUserWithEmailAndPassword(auth, address, password)
    await sendVerification(user)
    return { user, resumed: false }
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw friendly(err)
    try {
      const { user } = await signInWithEmailAndPassword(auth, address, password)
      await user.reload()
      return { user, resumed: true }
    } catch {
      throw friendly(err)
    }
  }
}

/**
 * Signs in a user with Firebase Authentication and checks email verification status.
 */
export async function loginWithFirebase(email, password) {
  const check = validateInstitutionalEmail(email)
  if (!check.valid) {
    throw new Error(check.error)
  }

  const { auth, signInWithEmailAndPassword } = await getAuthInstance()
  let user
  try {
    user = (await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)).user
  } catch (err) {
    throw friendly(err)
  }

  // Force reload user metadata to get fresh emailVerified status
  await user.reload()
  // reload() updates the profile, not the ID token Firestore sends: a token
  // from before the link was opened still says unverified, and the rules
  // refuse it (firestore.rules institutional()) until it is refreshed.
  if (user.emailVerified && !(await user.getIdTokenResult()).claims.email_verified) {
    await user.getIdToken(true)
  }

  return {
    user,
    emailVerified: user.emailVerified,
    resendVerification: () => sendVerification(user).catch((err) => { throw friendly(err) }),
  }
}

/**
 * Sends a password reset email using Firebase Authentication.
 */
export async function resetPasswordWithFirebase(email) {
  const check = validateInstitutionalEmail(email)
  if (!check.valid) {
    throw new Error(check.error)
  }
  const { auth, sendPasswordResetEmail } = await getAuthInstance()
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  } catch (err) {
    // Say the same for an unknown address as for a known one.
    if (err?.code === 'auth/user-not-found') return
    throw friendly(err)
  }
}

/**
 * Resends the verification email for whoever is signed in to Firebase Auth
 * (after registering, the new login stays signed in until it is verified).
 */
export async function resendCurrentVerification() {
  const { auth } = await getAuthInstance()
  if (!auth.currentUser) throw new Error('Log in with your email and password to get a new verification link.')
  try {
    await sendVerification(auth.currentUser)
  } catch (err) {
    throw friendly(err)
  }
}
