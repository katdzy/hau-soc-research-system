import { Suspense, lazy, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { isLiveBackend } from '../backend/index.js'
import {
  EMAIL_DOMAINS, PROGRAM_INFO, ACCOUNT_STATUS, COURSES, accountType, normalizeEmail, sectionProblem, courseSchedule,
} from '../domain/constants.js'
import { Field } from '../components/ui.jsx'
import { registerAccount, confirmProviderVerification } from '../services/actions.js'
import crest from '../assets/soc-crest.webp'
import { InstallApp } from '../components/Pwa.jsx'
import { registerWithFirebase, loginWithFirebase } from '../services/authService.js'

// R9: the demo panel (persona switcher) exists only in dev builds; this branch
// is removed from the production bundle.
const DemoPanel = import.meta.env.DEV ? lazy(() => import('../dev/DemoPanel.jsx')) : null

const DOMAINS = Object.values(EMAIL_DOMAINS).join(' and ')

export default function SignIn({ seeding = false }) {
  const { snap, signIn, backendName } = useApp()
  const [tab, setTab] = useState('login') // 'login' | 'register'

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [reg, setReg] = useState({ name: '', email: '', password: '', program: PROGRAM_INFO[0].name, idNumber: '', block: '' })
  const setField = (k) => (e) => setReg(r => ({ ...r, [k]: e.target.value }))

  const [unverified, setUnverified] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

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
    if (regType === 'Student' && sectionProblem(reg.block, reg.program)) { setError(sectionProblem(reg.block, reg.program)); return }

    setLoading(true)
    try {
      if (isFirebaseMode) {
        if (reg.password.length < 6) throw new Error('Password must be at least 6 characters long.')
        await registerWithFirebase(email, reg.password)
      }
      await registerAccount(null, { ...reg, email })
      setSuccessMsg(
        `Account created for ${email}. Open the verification email to confirm the address` +
        `${import.meta.env.DEV && !isFirebaseMode ? ' (in this prototype: Dev tools → Outbox)' : ''}. ` +
        'The System Administrator then activates the account.',
      )
      setTab('login')
      setLoginEmail(email)
      setReg(r => ({ ...r, password: '' }))
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
        <div className="panel">
          <h2>{tab === 'login' ? 'Log in' : 'Create an account'}</h2>
          <p className="small muted mb-3">
            Use your institutional HAU account. Access is restricted to <strong>@hau.edu.ph</strong> and{' '}
            <strong>@student.hau.edu.ph</strong> addresses.
          </p>

          <div className="tabs" role="tablist" aria-label="Account">
            <button role="tab" aria-selected={tab === 'login'} onClick={() => { setTab('login'); clear() }}>Log in</button>
            <button role="tab" aria-selected={tab === 'register'} onClick={() => { setTab('register'); clear() }}>Register</button>
          </div>

          {successMsg && <p className="note mb-2" role="status">{successMsg}</p>}

          {tab === 'login' ? (
            <form onSubmit={handleSignIn} noValidate>
              <Field label="Institutional email address">
                <input
                  type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="name@hau.edu.ph" autoComplete="username" required
                />
              </Field>
              {isFirebaseMode && (
                <Field label="Password">
                  <input
                    type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                    autoComplete="current-password" required
                  />
                </Field>
              )}
              {error && <p className="small error-text mb-2" role="alert">{error}</p>}
              {unverified && (
                <p className="mb-2">
                  <button type="button" className="quiet" disabled={loading} onClick={handleResend}>Resend verification email</button>
                </p>
              )}
              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} noValidate>
              <Field label="Full name">
                <input type="text" value={reg.name} onChange={setField('name')} autoComplete="name" required />
              </Field>
              <Field
                label="Institutional email"
                hint={regType ? `Registers a ${regType.toLowerCase()} account.` : `Must be an ${DOMAINS} address.`}
              >
                <input type="email" value={reg.email} onChange={setField('email')} autoComplete="username" required />
              </Field>
              {isFirebaseMode && (
                <Field label="Password" hint="At least 6 characters">
                  <input type="password" value={reg.password} onChange={setField('password')} autoComplete="new-password" required />
                </Field>
              )}
              {regType === 'Student' && (
                <>
                  <Field label="Program">
                    <select value={reg.program} onChange={setField('program')}>
                      {PROGRAM_INFO.map(p => <option key={p.code} value={p.name}>{p.code} — {p.name}</option>)}
                    </select>
                  </Field>
                  <div className="row">
                    <Field label="Student number"><input value={reg.idNumber} onChange={setField('idNumber')} /></Field>
                    <Field label="Section" hint={sectionHint(reg.program)}>
                      <input value={reg.block} onChange={setField('block')} placeholder={sectionHint(reg.program).replace(/^e\.g\. /, '').split(' ')[0]} />
                    </Field>
                  </div>
                </>
              )}
              {regType === 'Faculty' && (
                <p className="small muted">
                  Faculty accounts start with no office role. The System Administrator activates the
                  account and assigns Dean, Associate Dean, Program Chair/Coordinator or URO where it applies;
                  project roles come from assignments on each project.
                </p>
              )}
              {error && <p className="small error-text mb-2" role="alert">{error}</p>}
              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Registering…' : 'Register'}
              </button>
            </form>
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
    </div>
  )
}

/** "e.g. WD-401 · Capstone 1 in 4th Year, 1st Semester" for the chosen program. */
function sectionHint(program) {
  const info = PROGRAM_INFO.find(p => p.name === program) ?? PROGRAM_INFO[0]
  const year = info.capstone[COURSES.C1].year
  return `e.g. ${info.code}-${year}01 · Capstone 1 in ${courseSchedule(info.name, COURSES.C1)}`
}
