import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { EMAIL_DOMAINS, GLOBAL_ROLES } from '../domain/constants.js'
import { Field } from '../components/ui.jsx'

// Domain-restricted registration + OTP (FR-01…FR-04). The code is displayed
// rather than emailed; swapping in Firebase Auth replaces this component only.
const makeCode = () => String(Math.floor(100000 + Math.random() * 900000))

const PERSONA_ORDER = [
  GLOBAL_ROLES.STUDENT, GLOBAL_ROLES.INSTRUCTOR_1, GLOBAL_ROLES.INSTRUCTOR_2,
  GLOBAL_ROLES.FACULTY, GLOBAL_ROLES.COORDINATOR, GLOBAL_ROLES.ASSOCIATE_DEAN,
  GLOBAL_ROLES.DEAN, GLOBAL_ROLES.URO, GLOBAL_ROLES.ADMIN,
]

export default function SignIn() {
  const { snap, signIn } = useApp()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(null)
  const [entered, setEntered] = useState('')
  const [error, setError] = useState('')

  const personas = useMemo(() => {
    const users = snap.users ?? []
    const pick = (role, n) => users.filter(u => u.globalRole === role).slice(0, n)
    return [
      ...pick(GLOBAL_ROLES.STUDENT, 3),
      ...PERSONA_ORDER.filter(r => r !== GLOBAL_ROLES.STUDENT).flatMap(r => pick(r, r === GLOBAL_ROLES.FACULTY ? 4 : 1)),
    ]
  }, [snap.users])

  function requestCode(e) {
    e.preventDefault()
    setError('')
    const normalised = email.trim().toLowerCase()
    if (!EMAIL_DOMAINS.some(d => normalised.endsWith(d))) {
      setError(`Registration is restricted to ${EMAIL_DOMAINS.join(' and ')} addresses.`)
      return
    }
    const user = (snap.users ?? []).find(u => u.email.toLowerCase() === normalised)
    if (!user) { setError('No account is registered to that institutional address.'); return }
    if (user.status !== 'Active') { setError('That account has been deactivated. Contact the System Administrator.'); return }
    setPending({ user, code: makeCode() })
    setEntered('')
  }

  function verify(e) {
    e.preventDefault()
    if (entered.trim() !== pending.code) { setError('That code does not match. Request a new one if it expired.'); return }
    signIn(pending.user.id)
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <header className="signin-head">
          <div className="wordmark" style={{ marginBottom: 14 }}>
            <span className="crest">HAU</span>
            <strong>School of Computing</strong>
          </div>
          <h1>Thesis &amp; Capstone Workflow System</h1>
          <p className="lede" style={{ marginTop: 8 }}>
            Workflow prototype. Sign in with an institutional address to walk the full
            lifecycle, or pick a demo persona to jump straight in.
          </p>
        </header>

        <div className="panel" style={{ marginBottom: 26 }}>
          {!pending ? (
            <form onSubmit={requestCode}>
              <Field label="Institutional email" hint={`Accepted domains: ${EMAIL_DOMAINS.join(', ')}`}>
                <input
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="katdungca@student.hau.edu.ph" autoComplete="username"
                />
              </Field>
              {error && <p className="small" style={{ color: 'var(--stop)' }}>{error}</p>}
              <button className="primary" type="submit">Send verification code</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <p className="small muted">
                A one-time code was sent to <strong>{pending.user.email}</strong>.
              </p>
              <div className="note" style={{ marginBottom: 14 }}>
                Prototype stand-in for the SMTP step — your code is{' '}
                <strong className="mono">{pending.code}</strong>
              </div>
              <Field label="6-digit code">
                <input
                  value={entered} onChange={e => setEntered(e.target.value)}
                  inputMode="numeric" maxLength={6} autoFocus
                />
              </Field>
              {error && <p className="small" style={{ color: 'var(--stop)' }}>{error}</p>}
              <div className="actions">
                <button className="primary" type="submit">Verify and sign in</button>
                <button type="button" className="quiet" onClick={() => { setPending(null); setError('') }}>
                  Use a different address
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="label" style={{ marginBottom: 8 }}>Demo personas — skips verification</div>
        <div className="persona-grid">
          {personas.map(u => (
            <button key={u.id} className="persona" onClick={() => signIn(u.id)}>
              <span className="pname">{u.name}</span>
              <span className="small muted">{u.globalRole}</span>
            </button>
          ))}
        </div>
        <p className="faint small" style={{ marginTop: 14 }}>
          Engr. Marites C. Bondoc is an Adviser on one project and a Panel Member on another.
          Mr. Chris Almocera is Program Coordinator institution-wide and an Adviser on one project.
          Sign in as either to see contextual access resolve differently per project.
        </p>
      </div>
    </div>
  )
}
