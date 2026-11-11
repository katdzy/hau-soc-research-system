import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { db, isLiveBackend } from '../backend/index.js'
import { FLAGS } from '../domain/flags.js'
import {
  EMAIL_DOMAINS, ACCOUNT_STATUS, accountType, normalizeEmail, sectionProblem, parseSection,
} from '../domain/constants.js'
import { Field } from '../components/ui.jsx'
import Dialog from '../components/Dialog.jsx'
import { registerAccount, confirmProviderVerification, requestPasswordReset, resendVerification } from '../services/api.js'
import crest from '../assets/soc-crest.webp'
import { InstallApp } from '../components/Pwa.jsx'
import {
  registerWithFirebase, loginWithFirebase, resetPasswordWithFirebase, resendCurrentVerification, authErrorMessage,
} from '../services/authService.js'

const DOMAINS = Object.values(EMAIL_DOMAINS).join(' and ')

/** Seconds between verification emails (Firebase refuses quicker resends). */
const RESEND_WAIT = 60

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

/** The ID field's label: both kinds until the email says which (S-01). */
const idLabel = (type) => type === 'Student' ? 'Student number'
  : type === 'Faculty' ? 'Employee ID number'
    : 'Student / employee ID number'

/** The left-hand panel every signed-out screen shares (Figma S-00). */
export function SignInBrand() {
  return (
    <aside className="signin-brand">
      <img className="crest-img" src={crest} alt="Holy Angel University School of Computing" width="76" height="76" />
      <div className="inst">Holy Angel University</div>
      <div className="school">School of Computing</div>
      <h1>Thesis &amp; Capstone Project Management and Workflow Automation System</h1>
      <p className="lead">For School of Computing students, advisers, panels and offices.</p>
      <InstallApp className="signin-install" />
      <p className="foot">Holy Angel University · Angeles City, Pampanga<br />© 2026 School of Computing</p>
    </aside>
  )
}

/** The right-hand column: the card, centred, and the help line at the foot (S-00). */
export function SignInMain({ children, after }) {
  return (
    <div className="signin-main">
      <div className="signin-card">
        {children}
        {after}
      </div>
      <p className="signin-help">Trouble signing in? Contact the School of Computing office.</p>
    </div>
  )
}

/** "Create account ✓ —— 2 Verify email" (S-16). */
export function VerifySteps({ verified = false }) {
  const tick = <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return (
    <ol className="verify-steps" aria-label="Registration steps">
      <li className="is-done"><span className="verify-step-mark">{tick}</span>Create account</li>
      <li className={verified ? 'is-done' : 'is-now'} aria-current={verified ? undefined : 'step'}>
        <span className="verify-step-mark">{verified ? tick : 2}</span>Verify email
      </li>
    </ol>
  )
}

/** A countdown that starts at `seconds` whenever `restart` is called. → [left, restart] */
function useCooldown(initial = 0) {
  const [until, setUntil] = useState(() => (initial ? Date.now() + initial * 1000 : 0))
  const [, tick] = useState(0)
  const left = Math.max(0, Math.ceil((until - Date.now()) / 1000))
  useEffect(() => {
    if (!left) return undefined
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [left > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  return [left, (s = RESEND_WAIT) => setUntil(Date.now() + s * 1000)]
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * "Resend verification email" with its wait (S-16): the button, then "Resend
 * available in 0:45" until another email may go out, and what happened.
 */
function ResendControl({ email, resend, startWaiting = false }) {
  const [left, restart] = useCooldown(startWaiting ? RESEND_WAIT : 0)
  const [state, setState] = useState({ busy: false, sent: false, error: '' })

  async function send() {
    setState({ busy: true, sent: false, error: '' })
    try {
      await resend()
      setState({ busy: false, sent: true, error: '' })
      restart()
    } catch (err) {
      setState({ busy: false, sent: false, error: err.message || 'The email could not be sent. Try again in a moment.' })
      if (err?.code === 'auth/too-many-requests') restart()
    }
  }

  return (
    <div className="resend">
      <div className="resend-row">
        <button type="button" className="resend-btn" disabled={state.busy || left > 0} onClick={send}>
          {state.busy ? 'Sending…' : 'Resend verification email'}
        </button>
        {left > 0 && <span className="small faint" aria-live="off">Resend available in {mmss(left)}</span>}
      </div>
      <p className="sr-only" aria-live="polite">{left > 0 ? `You can resend in ${left} seconds.` : ''}</p>
      {state.sent && <p className="small ok-inline m-0 mt-1" role="status">A new link is on its way to {email}. Only the newest link works.</p>}
      {state.error && <p className="small error-text m-0 mt-1" role="alert">{state.error}</p>}
    </div>
  )
}

/** After you verify: what happens next, by kind of account (S-16). */
function AfterVerify({ type }) {
  const active = FLAGS.ACCOUNT_ACTIVATION === 'email'
  return (
    <div className="verify-next">
      <strong className="small">What happens after you verify</strong>
      <p className="small m-0">
        {!active
          ? 'The System Administrator activates the account; you get an email when they do. '
          : 'The link activates your account; then log in here. '}
        {type === 'Faculty'
          ? 'Faculty start with a faculty account; the System Administrator assigns any office role, and you become an adviser, instructor or panelist when a group is assigned to you.'
          : 'Students land on their dashboard, where they start or join a group in their section — or wait for Instructor 1 to place them in one.'}
      </p>
    </div>
  )
}

export default function SignIn({ empty = false }) {
  const { snap, signIn, backendName } = useApp()
  // Most visits are returning users, so the card opens on Log in. The
  // verification screen (VerifyEmail) may also hand over the address.
  const handoff = useLocation().state
  const [tab, setTab] = useState(handoff?.tab === 'register' ? 'register' : 'login') // login | register | verify | reset

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

  // The account waiting on its verification link: shown on the S-16 step
  // after registering, or in the resend dialog when it tries to log in.
  const [pending, setPending] = useState(null) // { email, type, resend, fresh }
  const [unverified, setUnverified] = useState(null) // { email, resend } — the login dialog
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  // Password reset: a step inside the card, not a dialog.
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState('')

  const isFirebaseMode = backendName === 'firebase'
  const regType = accountType(reg.email)
  const student = regType !== 'Faculty' // until an address says otherwise, a student
  const outboxHint = import.meta.env.DEV && !isFirebaseMode ? ' (in this prototype: test panel → Outbox)' : ''

  function clear() { setError(''); setNotice('') }
  function go(next) { clear(); setResetSent(''); setTab(next) }

  /** How this build sends another verification email for `email`. */
  const resendFor = (email, firebaseResend) => firebaseResend
    ?? (isFirebaseMode ? resendCurrentVerification : () => resendVerification(email))

  /** An account may sign in once its email is verified and it is active (S0.2–S0.4). */
  function admit(user, email) {
    if (!user) {
      setError(isFirebaseMode
        ? 'Your login works, but the account registration was not finished. Choose “Register” and fill in the form again with this same email and password.'
        : 'No account is registered to that institutional address.')
      return
    }
    if (!user.emailVerified) { setUnverified({ email, resend: resendFor(email) }); return }
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
      admit((snap.users ?? []).find(u => normalizeEmail(u.email) === email), email)
      return
    }

    if (!loginPassword) { setError('Enter your password.'); return }
    setLoading(true)
    try {
      const { user, emailVerified, resendVerification: resend } = await loginWithFirebase(email, loginPassword)
      if (!emailVerified) {
        setUnverified({ email, resend })
        return
      }
      // The records this account may read arrive after sign-in (firebaseAdapter).
      await db.authSettled?.(user.uid)
      admit(await confirmProviderVerification(email), email)
    } catch (err) {
      setError(authErrorMessage(err, 'Sign-in failed. Check your email and password.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    clear()
    const email = normalizeEmail(reg.email)
    if (!reg.name.trim()) { setError('Enter your full name.'); return }
    if (!accountType(email)) { setError(`Registration is restricted to ${DOMAINS} addresses.`); return }
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
      let resumed = false
      if (isFirebaseMode) {
        if (reg.password.length < 6) throw new Error('Password must be at least 6 characters long.')
        const auth = await registerWithFirebase(email, reg.password)
        resumed = auth.resumed
        // Read the account records as this login before checking for one.
        await db.authSettled?.(auth.user.uid)
        const existing = (db.snapshot?.().users ?? []).find(u => normalizeEmail(u.email) === email)
        if (resumed && existing) {
          if (auth.user.emailVerified || existing.emailVerified) {
            setTab('login'); setLoginEmail(email)
            setNotice('That address already has an account. Log in with it.')
            return
          }
          // Registered before, never verified: the same step, with a resend.
          setPending({ email, type: regType, resend: resendFor(email), fresh: false })
          setTab('verify')
          return
        }
      }
      await registerAccount(null, {
        ...reg,
        email,
        block: regType === 'Faculty' ? '' : reg.block,
      })
      setReg(r => ({ ...r, password: '', confirmPassword: '' }))
      setPending({ email, type: regType, resend: resendFor(email), fresh: !resumed })
      setTab('verify')
    } catch (err) {
      setError(authErrorMessage(err, 'Registration failed.'))
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

  return (
    <div className="signin">
      <SignInBrand />

      <SignInMain after={
        // Only the local store can tell it is empty: signed out, a live
        // project's rules hide every account, so it always looks empty.
        empty && import.meta.env.DEV && !isLiveBackend && tab !== 'verify' && (
          <p className="note mt-2">No accounts yet. Register one here, or open the test panel (bottom right) and spawn some.</p>
        )
      }>
        <div className="panel auth-panel">
          {tab === 'register' && (
            <>
              <h2>Create an account</h2>
              <p className="signin-sub">Only {DOMAINS} institutional emails can register.</p>

              <form onSubmit={handleRegister} noValidate>
                <Field label="Full name">
                  <input type="text" value={reg.name} onChange={setField('name')}
                    placeholder="Juan Dela Cruz" autoComplete="name" required />
                </Field>

                <Field label={idLabel(regType)}>
                  <input type="text" value={reg.idNumber} onChange={setField('idNumber')}
                    placeholder="As printed on your HAU ID" autoComplete="off" />
                </Field>

                <Field label="Institutional email address">
                  <input type="email" value={reg.email} onChange={setField('email')}
                    placeholder="juan.delacruz@student.hau.edu.ph" autoComplete="username" required />
                </Field>

                <div className="row">
                  <Field label="Academic program">
                    <select value={reg.program} onChange={handleProgramChange}>
                      {PROGRAM_OPTIONS.map(p => (
                        <option key={p.code} value={p.name}>{p.label}</option>
                      ))}
                    </select>
                  </Field>
                  {student && (
                    <Field label="Year level and block (students)">
                      <select value={reg.block} onChange={setField('block')}>
                        {availableBlocks.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>

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

              <p className="signin-switch">
                Already have an account?{' '}
                <button type="button" className="linkish" onClick={() => go('login')}>Sign in</button>
              </p>
            </>
          )}

          {tab === 'verify' && pending && (
            <div className="verify-panel" aria-live="polite">
              <VerifySteps />
              <span className="verify-mail" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26"><rect x="3" y="5.5" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m3.8 6.5 8.2 6.3 8.2-6.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
              </span>
              <h2>Check your institutional email</h2>
              <p className="verify-text">
                {pending.fresh ? 'We sent' : 'We sent earlier'} a verification link to <strong>{pending.email}</strong>{outboxHint}.
                Open the email and click the link to activate your account. The link expires in 24 hours.
              </p>
              <p className="verify-text">
                Not there? Check the Junk or Spam folder, and look for a sender named
                {isFirebaseMode ? ' “noreply”' : ' HAU-SOC'}. Still nothing after a few minutes — send a new link.
              </p>
              <ResendControl email={pending.email} resend={pending.resend} startWaiting={pending.fresh} />
              <p className="verify-edit">
                <strong>Wrong email?</strong>{' '}
                <button type="button" className="linkish" onClick={() => { setPending(null); go('register') }}>Go back and edit</button>
              </p>
              <AfterVerify type={pending.type} />
              <p className="signin-switch">
                Already opened the link?{' '}
                <button type="button" className="linkish" onClick={() => { setLoginEmail(pending.email); go('login') }}>Log in</button>
              </p>
            </div>
          )}

          {tab === 'login' && (
            <>
              <h2>Log in</h2>
              <p className="signin-sub">
                Use your institutional HAU account. Access is restricted to registered School of Computing accounts.
              </p>

              {notice && <p className="note mb-2" role="status">{notice}</p>}

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
                  <span className="login-link-pair">
                    No account yet?{' '}
                    <button type="button" className="linkish login-link is-strong" onClick={() => go('register')}>Register</button>
                  </span>
                </div>

                {error && <p className="small error-text mb-2" role="alert">{error}</p>}

                <button className="primary create-account-btn" type="submit" disabled={loading}>
                  {loading ? 'Logging in…' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {tab === 'reset' && (
            <>
              <h2>Reset your password</h2>
              {resetSent ? (
                <>
                  <p className="signin-sub" role="status">
                    If an account uses <strong>{resetSent}</strong>, a link to set a new password is on its way.
                    Check that inbox, including spam{outboxHint}.
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
                  <p className="signin-switch">
                    Remembered it?{' '}
                    <button type="button" className="linkish" onClick={() => go('login')}>Back to log in</button>
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </SignInMain>

      {unverified && (
        <Dialog
          title="Verify your email to continue"
          sub={<>Your password is right, but <strong>{unverified.email}</strong> hasn’t been verified yet.</>}
          onClose={() => setUnverified(null)}
          footer={<button type="button" className="quiet" onClick={() => setUnverified(null)}>Close</button>}
        >
          <VerifySteps />
          <p className="verify-text">
            Open the verification email we sent to that address and click its link{outboxHint}, then log in again.
            Check the Junk or Spam folder too. The link expires in 24 hours — if it has, or the email never came, send a new one.
          </p>
          <ResendControl email={unverified.email} resend={unverified.resend} />
        </Dialog>
      )}
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
