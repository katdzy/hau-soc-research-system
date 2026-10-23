import { Suspense, lazy, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { isLiveBackend } from '../backend/index.js'
import {
  EMAIL_DOMAINS, PROGRAM_INFO, ACCOUNT_STATUS, COURSES, accountType, normalizeEmail, sectionProblem, courseSchedule,
} from '../domain/constants.js'
import { Field } from '../components/ui.jsx'
import { registerAccount, confirmProviderVerification, requestPasswordReset } from '../services/actions.js'
import crest from '../assets/soc-crest.webp'
import { InstallApp } from '../components/Pwa.jsx'
import { registerWithFirebase, loginWithFirebase, resetPasswordWithFirebase } from '../services/authService.js'

// R9: the demo panel (persona switcher) exists only in dev builds; this branch
// is removed from the production bundle.
const DemoPanel = import.meta.env.DEV ? lazy(() => import('../dev/DemoPanel.jsx')) : null

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

export default function SignIn({ seeding = false }) {
  const { snap, signIn, backendName } = useApp()
  const [tab, setTab] = useState('register') // 'login' | 'register'

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [reg, setReg] = useState({
    name: '',
    idNumber: '',
    email: '',
    program: PROGRAM_OPTIONS[0].name,
    block: 'WD-401',
    password: '',
    confirmPassword: '',
  })
  const setField = (k) => (e) => setReg(r => ({ ...r, [k]: e.target.value }))

  const handleProgramChange = (e) => {
    const selectedProgName = e.target.value
    const progOpt = PROGRAM_OPTIONS.find(p => p.name === selectedProgName) || PROGRAM_OPTIONS[0]
    const defaultBlock = PROGRAM_SECTIONS[progOpt.code]?.[0] || ''
    setReg(r => ({ ...r, program: selectedProgName, block: defaultBlock }))
  }

  const [unverified, setUnverified] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState('')
  const [forgotErr, setForgotErr] = useState('')

  const isFirebaseMode = backendName === 'firebase'
  const regType = accountType(reg.email)

  function clear() { setError(''); setSuccessMsg(''); setUnverified(null) }

  /** An account may sign in once its email is verified and it is active (S0.2–S0.4). */
  function admit(user) {
    if (!user) { setError('No account is registered to that institutional address.'); return }
    if (!user.emailVerified) { setError('Verify your email address first — use the link in the verification email.'); return }
    if (user.status !== ACCOUNT_STATUS.ACTIVE) {
      setError(user.status === ACCOUNT_STATUS.INACTIVE
        ? 'Your email is verified. The System Administrator still has to activate the account.'
        : 'That account has been suspended. Contact the System Administrator.')
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
      const { emailVerified, resendVerification } = await loginWithFirebase(email, loginPassword)
      if (!emailVerified) {
        setUnverified({ email, resend: resendVerification })
        setError(`Verify ${email} first — check your inbox for the verification email.`)
        return
      }
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
        `Account created for ${email}. Open the verification email to confirm the address` +
        `${import.meta.env.DEV && !isFirebaseMode ? ' (in this prototype: Dev tools → Outbox)' : ''}. ` +
        'The System Administrator then activates the account.',
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

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotErr('')
    setForgotMsg('')
    const email = normalizeEmail(forgotEmail)
    if (!accountType(email)) {
      setForgotErr(`Password reset is restricted to ${DOMAINS} institutional addresses.`)
      return
    }
    setForgotLoading(true)
    try {
      if (isFirebaseMode) {
        await resetPasswordWithFirebase(email)
      } else {
        await requestPasswordReset(email)
      }
      setForgotMsg(
        `A password reset link has been dispatched to ${email}. Please check your institutional inbox` +
        `${import.meta.env.DEV && !isFirebaseMode ? ' (or check Dev Tools → Outbox in this prototype)' : ''}.`
      )
    } catch (err) {
      setForgotErr(err.message || 'Unable to send reset email. Contact the SOC administrator.')
    } finally {
      setForgotLoading(false)
    }
  }

  const currentProgCode = PROGRAM_OPTIONS.find(p => p.name === reg.program)?.code || 'WD'
  const availableBlocks = PROGRAM_SECTIONS[currentProgCode] || ['WD-401']

  return (
    <div className="signin">
      <aside className="signin-brand">
        <img className="crest-img" src={crest} alt="Holy Angel University School of Computing" width="76" height="76" />
        <div className="inst">Holy Angel University</div>
        <div className="school">School of Computing</div>
        <h1>Thesis &amp; Capstone Project Management and Workflow Automation System</h1>
        <p>For School of Computing students, advisers, panels and offices.</p>
        <InstallApp className="signin-install" />
        <p className="foot">Holy Angel University · Angeles City, Pampanga<br />© 2026 School of Computing</p>
      </aside>

      <div className="signin-main">
        <div className="signin-card">
          <div className="panel auth-panel">
            {tab === 'register' ? (
              <>
                <h2>Create an account</h2>
                <p className="signin-sub">
                  Only @hau.edu.ph and @student.hau.edu.ph institutional emails can register.
                </p>

                {successMsg && <p className="note mb-2" role="status">{successMsg}</p>}

                <form onSubmit={handleRegister} noValidate>
                  <Field label="Full name">
                    <input
                      type="text"
                      value={reg.name}
                      onChange={setField('name')}
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
                      required
                    />
                  </Field>

                  <Field label="Student / employee ID number">
                    <input
                      type="text"
                      value={reg.idNumber}
                      onChange={setField('idNumber')}
                      placeholder="[ID number]"
                    />
                  </Field>

                  <Field label="Institutional email address">
                    <input
                      type="email"
                      value={reg.email}
                      onChange={setField('email')}
                      placeholder="juan.delacruz@student.hau.edu.ph"
                      autoComplete="username"
                      required
                    />
                  </Field>

                  <div className="row">
                    <Field label="Academic program">
                      <select value={reg.program} onChange={handleProgramChange}>
                        {PROGRAM_OPTIONS.map(p => (
                          <option key={p.code} value={p.name}>{p.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Year level and block (students)">
                      <select value={reg.block} onChange={setField('block')}>
                        {availableBlocks.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                        <option value="">Not applicable (Faculty)</option>
                      </select>
                    </Field>
                  </div>

                  <div className="row">
                    <Field label="Password">
                      <input
                        type="password"
                        value={reg.password}
                        onChange={setField('password')}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        required
                      />
                    </Field>

                    <Field label="Confirm password">
                      <input
                        type="password"
                        value={reg.confirmPassword}
                        onChange={setField('confirmPassword')}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        required
                      />
                    </Field>
                  </div>

                  {error && <p className="small error-text mb-2" role="alert">{error}</p>}

                  <button className="primary create-account-btn" type="submit" disabled={loading}>
                    {loading ? 'Creating account…' : 'Create account'}
                  </button>
                </form>

                <p className="signin-switch">
                  Already have an account?{' '}
                  <button type="button" className="linkish" onClick={() => { setTab('login'); clear() }}>
                    Sign in
                  </button>
                </p>
              </>
            ) : (
              <>
                <h2>Log in</h2>
                <p className="signin-sub">
                  Use your institutional HAU account. Access is restricted to registered School of Computing accounts.
                </p>

                {successMsg && <p className="note mb-2" role="status">{successMsg}</p>}

                <form onSubmit={handleSignIn} noValidate>
                  <Field label="Institutional email address">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      placeholder="juan.delacruz@student.hau.edu.ph"
                      autoComplete="username"
                      required
                    />
                  </Field>

                  <Field label="Password">
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                    />
                  </Field>

                  <div className="login-links-row">
                    <button
                      type="button"
                      className="linkish login-link"
                      onClick={() => {
                        setForgotEmail(loginEmail || '')
                        setForgotMsg('')
                        setForgotErr('')
                        setShowForgotModal(true)
                      }}
                    >
                      Forgot password?
                    </button>

                    <div className="login-register-switch">
                      <span>No account yet? </span>
                      <button
                        type="button"
                        className="linkish login-link"
                        onClick={() => { setTab('register'); clear() }}
                      >
                        Register
                      </button>
                    </div>
                  </div>

                  {error && <p className="small error-text mb-2" role="alert">{error}</p>}
                  {unverified && (
                    <p className="mb-2">
                      <button type="button" className="quiet" disabled={loading} onClick={handleResend}>Resend verification email</button>
                    </p>
                  )}

                  <button className="primary create-account-btn" type="submit" disabled={loading}>
                    {loading ? 'Continuing…' : 'Continue'}
                  </button>
                </form>
              </>
            )}
          </div>
          <p className="signin-help">Trouble signing in? Contact the School of Computing office.</p>

          {/* A live project is never seeded from the browser (AppContext). */}
          {seeding && (isLiveBackend
            ? <p className="note mt-2">This Firebase project has no accounts yet. Seed it, or run with VITE_BACKEND=local.</p>
            : <p className="note mt-2">Setting up demo data… this only happens once. Refresh in a moment.</p>)}
        </div>
        {!seeding && DemoPanel && (
          <Suspense fallback={null}><DemoPanel /></Suspense>
        )}
      </div>

      {showForgotModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForgotModal(false) }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-pwd-title"
        >
          <div className="modal-dialog forgot-dialog">
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">School of Computing</span>
                <h3 id="forgot-pwd-title">Password Assistance</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="forgot-intro">
                Enter your institutional HAU address (<code>@hau.edu.ph</code> or <code>@student.hau.edu.ph</code>). We will send a secure link to reset your account password.
              </p>

              {forgotMsg ? (
                <div className="forgot-success-box" role="status">
                  <div className="forgot-success-icon" aria-hidden="true">✓</div>
                  <div>
                    <strong>Reset Instructions Dispatched</strong>
                    <p>{forgotMsg}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} noValidate>
                  <Field label="Institutional email address">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="juan.delacruz@student.hau.edu.ph"
                      autoFocus
                      required
                    />
                  </Field>

                  {forgotErr && <p className="small error-text mb-2" role="alert">{forgotErr}</p>}

                  <button className="primary create-account-btn mt-2" type="submit" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending reset link…' : 'Send password reset link'}
                  </button>
                </form>
              )}

              <div className="forgot-support-card">
                <h4>Institutional Support &amp; Recovery</h4>
                <p>If you no longer have access to your inbox or need administrative reset assistance:</p>
                <ul>
                  <li><strong>SOC Dean's Office:</strong> <a href="mailto:soc@hau.edu.ph">soc@hau.edu.ph</a></li>
                  <li><strong>HAU ITSS Helpdesk:</strong> <a href="mailto:itss@hau.edu.ph">itss@hau.edu.ph</a> · SJH Ground Floor</li>
                </ul>
                {!isFirebaseMode && (
                  <p className="forgot-proto-tip">
                    💡 <strong>Prototype Notice:</strong> In this local prototype environment, authentication is passwordless — you can sign in directly or switch personas using the <em>Demo Panel</em> below.
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="quiet"
                onClick={() => setShowForgotModal(false)}
              >
                Back to Sign in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** "e.g. WD-401 · Capstone 1 in 4th Year, 1st Semester" for the chosen program. */
function sectionHint(program) {
  const info = PROGRAM_INFO.find(p => p.name === program) ?? PROGRAM_INFO[0]
  const year = info.capstone[COURSES.C1].year
  return `e.g. ${info.code}-${year}01 · Capstone 1 in ${courseSchedule(info.name, COURSES.C1)}`
}
