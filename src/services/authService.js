import { EMAIL_DOMAINS, isInstitutionalEmail, normalizeEmail } from '../domain/constants.js'
import { emulatorHost } from '../backend/emulatorHost.js'

/**
 * Validates whether an email belongs to an allowed institutional domain.
 * Allowed domains: @hau.edu.ph and @student.hau.edu.ph
 */
export function validateInstitutionalEmail(email = '') {
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

/**
 * Registers a new user with Firebase Authentication and sends an email verification link.
 */
export async function registerWithFirebase(email, password) {
  const check = validateInstitutionalEmail(email)
  if (!check.valid) {
    throw new Error(check.error)
  }

  const { auth, createUserWithEmailAndPassword } = await getAuthInstance()
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  const user = userCredential.user

  await sendVerification(user)
  return user
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
  const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  const user = userCredential.user

  // Force reload user metadata to get fresh emailVerified status
  await user.reload()

  return {
    user,
    emailVerified: user.emailVerified,
    resendVerification: () => sendVerification(user),
  }
}

/**
 * Resends the verification email to a Firebase User.
 */
export async function sendFirebaseEmailVerification(user) {
  await sendVerification(user)
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
  await sendPasswordResetEmail(auth, email.trim().toLowerCase())
}
