import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { EMAIL_DOMAINS, PROGRAMS, ACCOUNT_STATUS, GLOBAL_ROLES, accountType } from '../domain/constants.js'
import { describeStanding } from '../domain/caac.js'
import { registerAccount, verifyEmail } from '../services/actions.js'
import {
  validateInstitutionalEmail, registerWithFirebase, loginWithFirebase, sendPasswordReset,
} from '../services/authService.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Field } from '../components/ui.jsx'

// Wireframes S-00 (sign in) and S-01 (register). Domain-restricted to
// @hau.edu.ph and @student.hau.edu.ph. With VITE_BACKEND=firebase this is
// Firebase Authentication — credentials, the verification email and password
// reset. Locally the verification email is shown on screen and passwords are
// neither stored nor checked. There is no OTP step.

const DOMAINS = Object.values(EMAIL_DOMAINS)
const BLANK = {
  name: '', idNumber: '', email: '', program: PROGRAMS[0], yearLevel: '4th Year', block: '',
  password: '', confirm: '',
}

export default function SignIn() {
  const { snap, signIn, backendName } = useApp()
  const firebase = backendName === 'firebase'
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState(BLANK)
  const [mailFor, setMailFor] = useState(null)
  const [resend, setResend] = useState(null)
  const [notice, setNotice] = useState('')
  const { run, error, busy, setError } = useAction()

  const multiRoleExamples = useMemo(() => [
    {
      id: 'f_bondoc',
      name: 'Engr. Marites C. Bondoc',
      globalRole: 'Faculty',
      projectRoles: ['Adviser', 'Panel Member'],
      description: 'Adviser on "Automated Student Feedback" (Full version history) AND Panel Member on "Smart Queue System" (Latest version only).',
    },
    {
      id: 'f_almocera',
      name: 'Mr. Chris Almocera',
      globalRole: 'Program Chair/Coordinator',
      projectRoles: ['Adviser'],
      description: 'Program Coordinator (BSIT oversight) AND Adviser on "IoT-Based Laboratory Equipment Tracking".',
    },
    {
      id: 'f_tayag',
      name: 'Dr. Marlon I. Tayag',
      globalRole: 'Dean',
      projectRoles: ['Adviser'],
      description: 'Dean (Executive Signatory) AND Adviser on "Group 2" (CAAC conflict-check prevents self-approval of adviser assignment).',
    },
    {
      id: 'f_espinosa',
      name: 'Asst. Prof. Kevin Aldrin G. Espinosa',
      globalRole: 'Faculty',
      projectRoles: ['Instructor 1'],
      description: 'Instructor 1 for Capstone 1 blocks WD-4A & WD-4B (Roster & topic approval authority).',
    },
  ], [])

  const personas = useMemo(() => {
    const users = snap.users ?? []
    const students = users.filter(u => u.globalRoles?.includes(GLOBAL_ROLES.STUDENT) && u.id !== 'u_noel').slice(0, 2)
    const staff = users.filter(u => !u.globalRoles?.includes(GLOBAL_ROLES.STUDENT) && u.status === ACCOUNT_STATUS.ACTIVE)
    return [...students, ...staff]
  }, [snap.users])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const regType = accountType(form.email.trim())
  const go = (m) => { setMode(m); setError(''); setNotice(''); setMailFor(null); setResend(null) }
  const profileFor = (address) => (snap.users ?? []).find(u => u.email.toLowerCase() === address)

  function submitSignIn(e) {
    e.preventDefault()
    setNotice(''); setResend(null)
    run(async () => {
      const address = email.trim().toLowerCase()
      const check = validateInstitutionalEmail(address)
      if (!check.valid) throw new Error(check.error)
      if (!password) throw new Error('Enter your password.')

      if (firebase) {
        const result = await loginWithFirebase(address, password)
        if (!result.emailVerified) {
          setResend(() => result.resendVerification)
          throw new Error(`Verify your address first — we sent a link to ${address}.`)
        }
        let profile = profileFor(address)
        if (!profile) profile = await registerAccount(snap, { name: result.user.displayName || address.split('@')[0], email: address })
        if (!profile.emailVerified) await verifyEmail(profile.id)
        if (profile.status === ACCOUNT_STATUS.SUSPENDED) throw new Error('This account is suspended. Contact the System Administrator.')
        signIn(profile.id)
        return
      }

      const profile = profileFor(address)
      if (!profile) throw new Error('No account is registered to that address. Create one first.')
      if (!profile.emailVerified) {
        setMailFor(profile)
        throw new Error('Verify your address first — the verification email is shown below.')
      }
      if (profile.status !== ACCOUNT_STATUS.ACTIVE) {
        throw new Error(`This account is ${profile.status.toLowerCase()}. Contact the System Administrator.`)
      }
      signIn(profile.id)
    })
  }

  function forgotPassword() {
    setNotice('')
    run(async () => {
      const address = email.trim().toLowerCase()
      const check = validateInstitutionalEmail(address)
      if (!check.valid) throw new Error('Enter your institutional email first, then choose “Forgot password?”.')
      if (firebase) await sendPasswordReset(address)
      setNotice(firebase
        ? `A password reset link was sent to ${address}.`
        : 'In the Firebase build a reset link is emailed. The local prototype does not store passwords.')
    })
  }

  function submitRegister(e) {
    e.preventDefault()
    run(async () => {
      if (!form.name.trim()) throw new Error('Enter your full name.')
      const check = validateInstitutionalEmail(form.email)
      if (!check.valid) throw new Error(check.error)
      if (form.password.length < 8) throw new Error('Use a password of at least 8 characters.')
      if (form.password !== form.confirm) throw new Error('The passwords do not match.')
      if (firebase) await registerWithFirebase(form.email, form.password)
      const profile = await registerAccount(snap, form)
      setForm(BLANK)
      if (firebase) {
        setEmail(profile.email)
        go('signin')
        setNotice(`Account created. Open the link we sent to ${profile.email}, then sign in.`)
      } else {
        setMailFor(profile)
      }
    })
  }

  function approve() {
    run(async () => {
      await verifyEmail(mailFor.id)
      setEmail(mailFor.email)
      go('signin')
      setNotice('Address verified — your account is active. Sign in to continue.')
    })
  }

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="wordmark"><span className="crest">HAU</span></div>
        <p className="auth-school">Holy Angel University<br />School of Computing</p>
        <h1 className="auth-title">Thesis &amp; Capstone Project Management and Workflow Automation System</h1>
        <p className="auth-foot">Context-Aware Access Control · Immutable versioning · Audit trail</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card panel">
          {mode === 'signin' ? (
            <form onSubmit={submitSignIn} noValidate>
              <h2 className="auth-h">Sign in</h2>
              <p className="small muted">Use your institutional HAU account. Access is restricted to registered School of Computing accounts.</p>
              <Field label="Institutional email address">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="juan.delacruz@student.hau.edu.ph" autoComplete="username" />
              </Field>
              <Field label="Password">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <div className="auth-links small">
                <button type="button" className="link" onClick={forgotPassword}>Forgot password?</button>
                <span>No account yet? <button type="button" className="link" onClick={() => go('register')}>Register</button></span>
              </div>
              <button className="primary block" type="submit" disabled={busy}>Continue</button>
              {notice && <p className="small ok-text" role="status">{notice}</p>}
              <ActionError error={error} />
              {resend && (
                <button type="button" className="quiet small" disabled={busy}
                  onClick={() => run(async () => { await resend(); setNotice('A new verification link was sent.') })}>
                  Resend verification email
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={submitRegister} noValidate>
              <h2 className="auth-h">Create an account</h2>
              <p className="small muted">
                Only {DOMAINS.join(' and ')} addresses can register. Roles are assigned by the System
                Administrator after sign-up; student addresses receive the Student role on verification.
              </p>
              <div className="row">
                <Field label="Full name"><input value={form.name} onChange={set('name')} autoComplete="name" placeholder="Juan Dela Cruz" /></Field>
                <Field label={regType === 'Faculty' ? 'Employee ID number' : 'Student / employee ID number'}>
                  <input value={form.idNumber} onChange={set('idNumber')} />
                </Field>
              </div>
              <Field label="Institutional email address" hint={regType ? `${regType} account` : undefined}>
                <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="juan.delacruz@student.hau.edu.ph" />
              </Field>
              <div className="row">
                <Field label="Academic program">
                  <select value={form.program} onChange={set('program')}>
                    {PROGRAMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                {regType !== 'Faculty' && (
                  <Field label="Year level and block (students)">
                    <span className="row tight-row">
                      <select value={form.yearLevel} onChange={set('yearLevel')} aria-label="Year level">
                        {['3rd Year', '4th Year'].map(y => <option key={y}>{y}</option>)}
                      </select>
                      <input value={form.block} onChange={set('block')} placeholder="WD-4A" aria-label="Block" />
                    </span>
                  </Field>
                )}
              </div>
              <div className="row">
                <Field label="Password" hint="At least 8 characters.">
                  <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
                </Field>
              </div>
              <button className="primary block" type="submit" disabled={busy}>Create account</button>
              <ActionError error={error} />
              <p className="small muted" style={{ marginTop: 16 }}>
                Already registered? <button type="button" className="link" onClick={() => go('signin')}>Sign in</button>
              </p>
            </form>
          )}

          {mailFor && (
            <div className="mail" aria-live="polite">
              <div className="mail-head">
                <span className="label">Verification email · shown here in the prototype</span>
                <div className="small"><span className="faint">To</span> <span className="mono">{mailFor.email}</span></div>
                <div className="small"><span className="faint">From</span> HAU-SOC Research &lt;no-reply@hausoc-research.org&gt;</div>
              </div>
              <p className="small" style={{ margin: '12px 0' }}>
                Someone registered <strong>{mailFor.email}</strong>. If this was you, approve it to activate the account.
              </p>
              <button className="primary" onClick={approve} disabled={busy}>Yes, this is my account</button>
            </div>
          )}
        </div>

        <p className="faint small auth-fr">
          Domain-restricted registration · secure login · password reset · Firebase Authentication
          {firebase ? '' : ' (local mode: passwords are not checked)'}
        </p>

        {!firebase && (
          <details className="personas" open>
            <summary className="label">Demo accounts — sign in without a password</summary>
            <div className="persona-grid">
              {personas.map(u => (
                <button key={u.id} className="persona" onClick={() => signIn(u.id)}>
                  <span className="pname">{u.name}</span>
                  <span className="small muted">{describeStanding(u, snap)}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </main>
    </div>
  )
}
