import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { db, isLiveBackend } from '../backend/index.js'
import { FLAGS } from '../domain/flags.js'
import {
  EMAIL_DOMAINS, ACCOUNT_STATUS, accountType, normalizeEmail, sectionProblem, parseSection,
} from '../domain/constants.js'
import { Field } from '../components/ui.jsx'
import { registerAccount, confirmProviderVerification, requestPasswordReset } from '../services/api.js'
import crest from '../assets/soc-crest.webp'
import { InstallApp } from '../components/Pwa.jsx'
import { registerWithFirebase, loginWithFirebase, resetPasswordWithFirebase } from '../services/authService.js'

const DOMAINS = Object.values(EMAIL_DOMAINS).join(' and ')

const PROGRAM_OPTIONS = [
  { code: 'WD', name: 'Bachelor of Science Major in Information Technology with area of specialization in Web Development', label: 'BSIT — Web Development' },
  { code: 'NW', name: 'Bachelor of Science Major in Information Technology with area of specialization in Network Administration', label: 'BSIT — Network Administration' },
  { code: 'CS', name: 'Bachelor of Science Major in Computer Science', label: 'BSCS — Computer Science' },
  { code: 'EMC', name: 'Bachelor of Science Major in Entertainment and Multimedia Computing', label: 'BSEMC — Entertainment and Multimedia Computing' },
  { code: 'CYB', name: 'Bachelor of Science Major in Cybersecurity', label: 'BSCYB — Cybersecurity' },
]

const PROGRAM_SECTIONS = {
  WD: ['WD-401', 'WD-402', 'WD-403'],
  NW: ['NW-401', 'NW-402'],
  CS: ['CS-301', 'CS-401', 'CS-402'],
  EMC: ['EMC-401', 'EMC-402'],
  CYB: ['CYB-401', 'CYB-402'],
}

/** The program's sections on record (e.g. made in the test panel), then the usual ones. */
const blocksOf = (snap, code) => [...new Set([
  ...(snap.sections ?? []).filter(s => parseSection(s.block)?.code === code).map(s => s.block),
  ...(PROGRAM_SECTIONS[code] ?? []),
])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

/** The left-hand panel every signed-out screen shares (Figma S-00). */
export function SignInBrand() {
  return (
    <aside className="signin-brand">
      <img className="crest-img" src={crest} alt="Holy Angel University School of Computing" width="76" height="76" />
      <div className="inst">Holy Angel University</div>
      <div className="school">School of Computing</div>
      <h1>Thesis &amp; Capstone Project Management and Workflow Automation System</h1>
      <p>For School of Computing students, advisers, panels and offices.</p>
      <InstallApp className="signin-install" />
      <p className="foot">Holy Angel University · Angeles City, Pampanga<br />© 2026 School of Computing</p>
    </aside>
  )
}

export default function SignIn({ empty = false }) {
  const { snap, signIn, backendName } = useApp()
  // Most visits are returning users, so the card opens on Log in. The
  // verification screen (VerifyEmail) may also hand over the address.
  const handoff = useLocation().state
  const [tab, setTab] = useState(handoff?.tab === 'register' ? 'register' : 'login') // 'login' | 'register' | 'reset'

  const [loginEmail, setLoginEmail] = useState(handoff?.email ?? '')
  const [loginPassword, setLoginPassword] = useState('')

  const [reg, setReg] = useState({
    name: '',
    idNumber: '',
    email: '',
    program: PROGRAM_OPTIONS[0].name,
    block: blocksOf(snap, PROGRAM_OPTIONS[0].code)[0] ?? '',
    password: '',
    confirmPassword: '',
  })
  const setField = (k) => (e) => setReg(r => ({ ...r, [k]: e.target.value }))

  const handleProgramChange = (e) => {
    const selectedProgName = e.target.value
    const progOpt = PROGRAM_OPTIONS.find(p => p.name === selectedProgName) || PROGRAM_OPTIONS[0]
    const defaultBlock = blocksOf(snap, progOpt.code)[0] || ''
    setReg(r => ({ ...r, program: selectedProgName, block: defaultBlock }))
  }

  const [unverified, setUnverified] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Password reset: a step inside the card, not a dialog.
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState('')

  const isFirebaseMode = backendName === 'firebase'
  const regType = accountType(reg.email)
  const student = regType !== 'Faculty' // until an address says otherwise, a student

  function clear() { setError(''); setSuccessMsg(''); setUnverified(null) }
  function go(next) { clear(); setResetSent(''); setTab(next) }

  /** An account may sign in once its email is verified and it is active (S0.2–S0.4). */
  function admit(user) {
    if (!user) { setError('No account is registered to that institutional address.'); return }
    if (!user.emailVerified) { setError('Verify your email address first — use the link in the verification email.'); return }
    if (user.status !== ACCOUNT_STATUS.ACTIVE) {
      setError(user.status !== ACCOUNT_STATUS.INACTIVE
        ? 'That account has been suspended. Contact the System Administrator.'
        : FLAGS.ACCOUNT_ACTIVATION === 'email'
          ? 'This account is not active yet. Open the link in the verification email, then log in again.'
          : 'Your email is verified. The System Administrator still has to activate the account.')
      return
    }
    signIn(user.id)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    clear()
    const email = normalizeEmail(loginEmail)
    if (!accountType(email)) { setError(`Sign-in is restricted to ${DOMAINS} addresses.`); return }

    if (!isFirebaseMode) {
      // Local prototype backend: no passwords. The Firebase build authenticates
      // with Firebase Auth (below).
      admit((snap.users ?? []).find(u => normalizeEmail(u.email) === email))
      return
    }

    if (!loginPassword) { setError('Enter your password.'); return }
    setLoading(true)
    try {
      const { user, emailVerified, resendVerification } = await loginWithFirebase(email, loginPassword)
      if (!emailVerified) {
        setUnverified({ email, resend: resendVerification })
        setError(`Verify ${email} first — check your inbox for the verification email.`)
        return
      }
      // The records this account may read arrive after sign-in (firebaseAdapter).
      await db.authSettled?.(user.uid)
      admit(await confirmProviderVerification(email))
    } catch (err) {
      setError(err.message || 'Sign-in failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    clear()
    const email = normalizeEmail(reg.email)
    if (!accountType(email)) { setError(`Registration is restricted to ${DOMAINS} addresses.`); return }
    if (!reg.name.trim()) { setError('Enter your full name.'); return }
    if (reg.password && reg.confirmPassword && reg.password !== reg.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (regType === 'Student' && sectionProblem(reg.block, reg.program)) {
      setError(sectionProblem(reg.block, reg.program))
      return
    }

    setLoading(true)
    try {
      if (isFirebaseMode) {
        if (reg.password.length < 6) throw new Error('Password must be at least 6 characters long.')
        await registerWithFirebase(email, reg.password)
      }
      await registerAccount(null, {
        ...reg,
        email,
        block: regType === 'Faculty' ? '' : reg.block,
      })
      setSuccessMsg(
        `Account created for ${email}. Open the verification email we sent there` +
        `${import.meta.env.DEV && !isFirebaseMode ? ' (in this prototype: test panel → Outbox)' : ''}` +
        (FLAGS.ACCOUNT_ACTIVATION === 'email'
          ? '. The link activates your account; then log in here.'
          : ' to confirm the address. The System Administrator then activates the account.'),
      )
      setTab('login')
      setLoginEmail(email)
      setReg(r => ({ ...r, password: '', confirmPassword: '' }))
    } catch (err) {
      setError(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!unverified?.resend) return
    setLoading(true)
    try {
      await unverified.resend()
      setSuccessMsg(`A new verification email was sent to ${unverified.email}.`)
    } catch (err) {
      setError(err.message || 'Could not resend the verification email.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    clear()
    const email = normalizeEmail(resetEmail)
    if (!accountType(email)) { setError(`Password reset is restricted to ${DOMAINS} addresses.`); return }
    setLoading(true)
    try {
      if (isFirebaseMode) await resetPasswordWithFirebase(email)
      else await requestPasswordReset(email)
      setResetSent(email)
    } catch (err) {
      setError(err.message || 'The reset link could not be sent. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const currentProgCode = PROGRAM_OPTIONS.find(p => p.name === reg.program)?.code || 'WD'
  const availableBlocks = blocksOf(snap, currentProgCode)
  const switchTo = (label, next, lead) => (
    <p className="signin-switch">
      {lead}{' '}
      <button type="button" className="linkish" onClick={() => go(next)}>{label}</button>
    </p>
  )

  return (
    <div className="signin">
      <SignInBrand />

      <div className="signin-main">
        <div className="signin-card">
          <div className="panel auth-panel">
            {tab === 'register' && (
              <>
                <h2>Create an account</h2>
                <p className="signin-sub">
                  Only {DOMAINS} institutional emails can register.
                </p>

                <form onSubmit={handleRegister} noValidate>
                  <Field label="Full name">
                    <input type="text" value={reg.name} onChange={setField('name')}
                      placeholder="Juan Dela Cruz" autoComplete="name" required />
                  </Field>

                  <Field label="Institutional email address">
                    <input type="email" value={reg.email} onChange={setField('email')}
                      placeholder="juan.delacruz@student.hau.edu.ph" autoComplete="username" required />
                  </Field>

                  <Field label={student ? 'Student ID number' : 'Employee ID number'}>
                    <input type="text" value={reg.idNumber} onChange={setField('idNumber')}
                      inputMode="numeric" autoComplete="off" />
                  </Field>

                  <Field label="Academic program">
                    <select value={reg.program} onChange={handleProgramChange}>
                      {PROGRAM_OPTIONS.map(p => (
                        <option key={p.code} value={p.name}>{p.label}</option>
                      ))}
                    </select>
                  </Field>

                  {student && (
                    <Field label="Section" hint="Your year level and block.">
                      <select value={reg.block} onChange={setField('block')}>
                        {availableBlocks.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <div className="row">
                    <Field label="Password" hint={isFirebaseMode ? 'At least 6 characters.' : undefined}>
                      <PasswordInput value={reg.password} onChange={setField('password')} autoComplete="new-password" />
                    </Field>
                    <Field label="Confirm password">
                      <PasswordInput value={reg.confirmPassword} onChange={setField('confirmPassword')} autoComplete="new-password" />
                    </Field>
                  </div>

                  {error && <p className="small error-text mb-2" role="alert">{error}</p>}

                  <button className="primary create-account-btn" type="submit" disabled={loading}>
                    {loading ? 'Creating account…' : 'Create account'}
                  </button>
                </form>

                {switchTo('Log in', 'login', 'Already have an account?')}
              </>
            )}

            {tab === 'login' && (
              <>
                <h2>Log in</h2>
                <p className="signin-sub">Use the institutional email you registered with.</p>

                {successMsg && <p className="note mb-2" role="status">{successMsg}</p>}

                <form onSubmit={handleSignIn} noValidate>
                  <Field label="Institutional email address">
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      placeholder="juan.delacruz@student.hau.edu.ph" autoComplete="username" required />
                  </Field>

                  <Field label="Password">
                    <PasswordInput value={loginPassword} onChange={e => setLoginPassword(e.target.value)} autoComplete="current-password" />
                  </Field>

                  <div className="login-links-row">
                    <button type="button" className="linkish login-link"
                      onClick={() => { setResetEmail(loginEmail); go('reset') }}>
                      Forgot password?
                    </button>
                  </div>

                  {error && <p className="small error-text mb-2" role="alert">{error}</p>}
                  {unverified && (
                    <p className="mb-2">
                      <button type="button" className="quiet" disabled={loading} onClick={handleResend}>Resend verification email</button>
                    </p>
                  )}

                  <button className="primary create-account-btn" type="submit" disabled={loading}>
                    {loading ? 'Logging in…' : 'Log in'}
                  </button>
                </form>

                {switchTo('Create an account', 'register', 'New here?')}
              </>
            )}

            {tab === 'reset' && (
              <>
                <h2>Reset your password</h2>
                {resetSent ? (
                  <>
                    <p className="signin-sub" role="status">
                      If an account uses <strong>{resetSent}</strong>, a link to set a new password is on its way.
                      Check that inbox, including spam
                      {import.meta.env.DEV && !isFirebaseMode ? ' (in this prototype: test panel → Outbox)' : ''}.
                    </p>
                    <button className="primary create-account-btn" type="button" onClick={() => go('login')}>
                      Back to log in
                    </button>
                  </>
                ) : (
                  <>
                    <p className="signin-sub">
                      Enter your institutional email. We’ll send a link to set a new password.
                    </p>
                    <form onSubmit={handleReset} noValidate>
                      <Field label="Institutional email address">
                        <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                          placeholder="juan.delacruz@student.hau.edu.ph" autoComplete="username" autoFocus required />
                      </Field>
                      {error && <p className="small error-text mb-2" role="alert">{error}</p>}
                      <button className="primary create-account-btn" type="submit" disabled={loading}>
                        {loading ? 'Sending…' : 'Send reset link'}
                      </button>
                    </form>
                    {switchTo('Back to log in', 'login', 'Remembered it?')}
                  </>
                )}
              </>
            )}
          </div>
          <p className="signin-help">Trouble signing in? Contact the School of Computing office.</p>

          {/* Only the local store can tell it is empty: signed out, a live
              project's rules hide every account, so it always looks empty. */}
          {empty && import.meta.env.DEV && !isLiveBackend && (
            <p className="note mt-2">No accounts yet. Register one here, or open the test panel (bottom right) and spawn some.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** A password field with a Show/Hide switch (the dots alone hide typos). */
function PasswordInput({ value, onChange, autoComplete }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="pw-field">
      <input type={shown ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} spellCheck={false} autoCapitalize="off" required />
      <button type="button" className="pw-toggle" aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown(s => !s)}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  )
}
