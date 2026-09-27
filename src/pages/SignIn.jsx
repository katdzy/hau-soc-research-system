import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { EMAIL_DOMAINS, PROGRAMS, ACCOUNT_STATUS, GLOBAL_ROLES, accountType } from '../domain/constants.js'
import { describeStanding } from '../domain/caac.js'
import { registerAccount, verifyEmail } from '../services/actions.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Field } from '../components/ui.jsx'

// Domain-restricted registration and sign-in. In the Firebase build this is
// Firebase Authentication: the credential check, the verification email with
// its approval button (sent through Resend), and the JWT with role claims.
// Locally, the verification email is shown on screen and passwords are not
// stored or checked.

const DOMAINS = Object.values(EMAIL_DOMAINS)
const BLANK = { name: '', email: '', idNumber: '', program: PROGRAMS[0], yearLevel: '4th Year', block: '', password: '' }

export default function SignIn() {
  const { snap, signIn } = useApp()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState(BLANK)
  const [mailFor, setMailFor] = useState(null)
  const [notice, setNotice] = useState('')
  const { run, error, busy, setError } = useAction()

  const personas = useMemo(() => {
    const users = snap.users ?? []
    const students = users.filter(u => u.globalRoles?.includes(GLOBAL_ROLES.STUDENT)).slice(0, 3)
    const staff = users.filter(u => !u.globalRoles?.includes(GLOBAL_ROLES.STUDENT) && u.status === ACCOUNT_STATUS.ACTIVE)
    return [...students, ...staff]
  }, [snap.users])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const regType = accountType(form.email.trim())

  function submitSignIn(e) {
    e.preventDefault()
    setNotice('')
    run(async () => {
      const normalised = email.trim().toLowerCase()
      if (!accountType(normalised)) throw new Error(`Use your institutional address (${DOMAINS.join(' or ')}).`)
      const user = (snap.users ?? []).find(u => u.email.toLowerCase() === normalised)
      if (!user) throw new Error('No account is registered to that address. Register first.')
      if (!user.emailVerified) {
        setMailFor(user)
        throw new Error('Verify your email address first — the verification email is shown below.')
      }
      if (user.status !== ACCOUNT_STATUS.ACTIVE) {
        throw new Error(`This account is ${user.status.toLowerCase()}. Contact the System Administrator.`)
      }
      if (!password) throw new Error('Enter your password.')
      signIn(user.id)
    })
  }

  function submitRegister(e) {
    e.preventDefault()
    run(async () => {
      if (form.password.length < 8) throw new Error('Use a password of at least 8 characters.')
      const user = await registerAccount(snap, form)
      setMailFor(user)
      setForm(BLANK)
    })
  }

  function approve() {
    run(async () => {
      await verifyEmail(mailFor.id)
      setEmail(mailFor.email)
      setMailFor(null)
      setMode('signin')
      setNotice('Email verified. Your account is active — sign in to continue.')
    })
  }

  const switchMode = (m) => { setMode(m); setError(''); setNotice(''); setMailFor(null) }

  return (
    <div className="signin">
      <div className="signin-card">
        <header className="signin-head">
          <div className="wordmark">
            <span className="crest">HAU</span>
            <strong>School of Computing</strong>
          </div>
          <h1>Thesis &amp; Capstone Workflow System</h1>
          <p className="lede">
            Registration is open to <span className="mono">@hau.edu.ph</span> and{' '}
            <span className="mono">@student.hau.edu.ph</span> addresses only. What you can see and
            do depends on your role in each project and the stage it has reached.
          </p>
        </header>

        <div className="panel auth">
          <div className="tabs" role="tablist" aria-label="Account">
            <button role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>Register</button>
          </div>

          {notice && <p className="small" style={{ color: 'var(--ok)' }}>{notice}</p>}

          {mode === 'signin' ? (
            <form onSubmit={submitSignIn} noValidate>
              <Field label="Institutional email">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="katdungca@student.hau.edu.ph" autoComplete="username" />
              </Field>
              <Field label="Password">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" />
              </Field>
              <button className="primary" type="submit" disabled={busy}>Sign in</button>
              <ActionError error={error} />
            </form>
          ) : (
            <form onSubmit={submitRegister} noValidate>
              <div className="row">
                <Field label="Full name"><input value={form.name} onChange={set('name')} autoComplete="name" /></Field>
                <Field label="Institutional email"
                  hint={regType ? `${regType} account` : `Must end in ${DOMAINS.join(' or ')}`}>
                  <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
              </div>
              <div className="row">
                <Field label={regType === 'Faculty' ? 'Employee ID' : 'Student number'}>
                  <input value={form.idNumber} onChange={set('idNumber')} />
                </Field>
                <Field label="Program">
                  <select value={form.program} onChange={set('program')}>
                    {PROGRAMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              {regType === 'Student' && (
                <div className="row">
                  <Field label="Year level">
                    <select value={form.yearLevel} onChange={set('yearLevel')}>
                      {['3rd Year', '4th Year'].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </Field>
                  <Field label="Block"><input value={form.block} onChange={set('block')} placeholder="WD-4A" /></Field>
                </div>
              )}
              <Field label="Password" hint="At least 8 characters.">
                <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
              </Field>
              <button className="primary" type="submit"
                disabled={busy || !form.name.trim() || !form.email.trim()}>
                Create account
              </button>
              <ActionError error={error} />
              <p className="faint small" style={{ marginTop: 12 }}>
                Student accounts receive the Student role once verified. Faculty accounts start with no
                Global Role — project roles arrive through assignments, and offices through the System Administrator.
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
                Someone registered <strong>{mailFor.email}</strong> for the Thesis &amp; Capstone Workflow
                System. If this was you, approve it below to activate the account.
              </p>
              <button className="primary" onClick={approve} disabled={busy}>Yes, this is my account</button>
            </div>
          )}
        </div>

        <section className="personas" aria-labelledby="personas-h">
          <h2 id="personas-h" className="label">Demo accounts — skip the password</h2>
          <div className="persona-grid">
            {personas.map(u => (
              <button key={u.id} className="persona" onClick={() => signIn(u.id)}>
                <span className="pname">{u.name}</span>
                <span className="small muted">{describeStanding(u, snap)}</span>
              </button>
            ))}
          </div>
          <p className="faint small" style={{ marginTop: 12, maxWidth: '72ch' }}>
            Dr. Tayag is Dean and also Adviser on Group 2, so he cannot approve his own adviser
            assignment. Engr. Bondoc advises one project and sits on another’s panel. Mr. Almocera
            coordinates the IT programs and advises one of them.
          </p>
        </section>
      </div>
    </div>
  )
}
