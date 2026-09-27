import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { EMAIL_DOMAINS, GLOBAL_ROLES, PROGRAMS } from '../domain/constants.js'
import { Field } from '../components/ui.jsx'
import { db, backendName } from '../backend/index.js'
import {
  validateInstitutionalEmail,
  registerWithFirebase,
  loginWithFirebase,
} from '../services/authService.js'

const STUDENT_DOMAIN = '@student.hau.edu.ph'
const makeCode = () => String(Math.floor(100000 + Math.random() * 900000))

const PERSONA_ORDER = [
  GLOBAL_ROLES.STUDENT, GLOBAL_ROLES.INSTRUCTOR_1, GLOBAL_ROLES.INSTRUCTOR_2,
  GLOBAL_ROLES.FACULTY, GLOBAL_ROLES.COORDINATOR, GLOBAL_ROLES.ASSOCIATE_DEAN,
  GLOBAL_ROLES.DEAN, GLOBAL_ROLES.URO, GLOBAL_ROLES.ADMIN,
]

export default function SignIn() {
  const { snap, signIn } = useApp()
  const [tab, setTab] = useState('login') // 'login' | 'register'
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form state (restricted to Students)
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regName, setRegName] = useState('')
  const [regProgram, setRegProgram] = useState(PROGRAMS[0])
  const [regIdNumber, setRegIdNumber] = useState('')

  // Verification & Status states
  const [unverifiedUser, setUnverifiedUser] = useState(null)
  const [pendingOtp, setPendingOtp] = useState(null)
  const [enteredOtp, setEnteredOtp] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const isFirebaseMode = backendName === 'firebase'

  const personas = useMemo(() => {
    const users = snap.users ?? []
    const pick = (role, n) => users.filter(u => u.globalRole === role).slice(0, n)
    return [
      ...pick(GLOBAL_ROLES.STUDENT, 3),
      ...PERSONA_ORDER.filter(r => r !== GLOBAL_ROLES.STUDENT).flatMap(r => pick(r, r === GLOBAL_ROLES.FACULTY ? 4 : 1)),
    ]
  }, [snap.users])

  // Handle Firebase or OTP Sign In (accepts both @hau.edu.ph and @student.hau.edu.ph)
  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setUnverifiedUser(null)

    const normEmail = loginEmail.trim().toLowerCase()
    const check = validateInstitutionalEmail(normEmail)
    if (!check.valid) {
      setError(check.error)
      return
    }

    if (isFirebaseMode) {
      if (!loginPassword) {
        setError('Please enter your password.')
        return
      }
      setLoading(true)
      try {
        const { user: fbUser, emailVerified, resendVerification } = await loginWithFirebase(normEmail, loginPassword)
        if (!emailVerified) {
          setUnverifiedUser({ email: normEmail, resend: resendVerification })
          setError(`Verification required: A verification email was sent to ${normEmail}. Please check your inbox and verify your email before signing in.`)
          setLoading(false)
          return
        }

        // Find or create local user record matching the verified email
        let matchedUser = (snap.users ?? []).find(u => u.email.toLowerCase() === normEmail)
        if (!matchedUser) {
          // Auto-provision user record if first sign-in
          const isStudent = normEmail.endsWith(STUDENT_DOMAIN)
          const newUser = {
            id: 'u_' + Date.now(),
            name: fbUser.displayName || normEmail.split('@')[0],
            email: normEmail,
            globalRole: isStudent ? GLOBAL_ROLES.STUDENT : GLOBAL_ROLES.FACULTY,
            status: 'Active',
            createdAt: new Date().toISOString(),
          }
          matchedUser = await db.add('users', newUser)
        }
        signIn(matchedUser.id)
      } catch (err) {
        setError(err.message || 'Failed to sign in. Please check your credentials.')
      } finally {
        setLoading(false)
      }
    } else {
      // Local zero-setup OTP mock
      const user = (snap.users ?? []).find(u => u.email.toLowerCase() === normEmail)
      if (!user) { setError('No account is registered to that institutional address.'); return }
      if (user.status !== 'Active') { setError('That account has been deactivated. Contact the System Administrator.'); return }
      setPendingOtp({ user, code: makeCode() })
      setEnteredOtp('')
    }
  }

  // Handle Self-Service Student Registration (Strictly restricted to @student.hau.edu.ph)
  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setUnverifiedUser(null)

    const normEmail = regEmail.trim().toLowerCase()

    // Enforce student domain restriction for self-registration
    if (!normEmail.endsWith(STUDENT_DOMAIN)) {
      setError(`Self-registration is strictly restricted to students using a ${STUDENT_DOMAIN} email address. Faculty, Instructor, and Administrative accounts are created directly by the System Administrator.`)
      return
    }

    if (!regName.trim()) {
      setError('Please provide your full name.')
      return
    }

    if (isFirebaseMode) {
      if (!regPassword || regPassword.length < 6) {
        setError('Password must be at least 6 characters long.')
        return
      }
      setLoading(true)
      try {
        await registerWithFirebase(normEmail, regPassword)

        // Create student user profile in system store
        const newProfile = {
          id: 'u_' + Date.now(),
          name: regName.trim(),
          email: normEmail,
          globalRole: GLOBAL_ROLES.STUDENT,
          program: regProgram,
          idNumber: regIdNumber.trim(),
          status: 'Active',
          createdAt: new Date().toISOString(),
        }
        await db.add('users', newProfile)

        setSuccessMsg(`Account created successfully! A verification email has been sent to ${normEmail}. Please check your inbox and verify your account before logging in.`)
        setTab('login')
        setLoginEmail(normEmail)
        setRegPassword('')
      } catch (err) {
        setError(err.message || 'Failed to register account.')
      } finally {
        setLoading(false)
      }
    } else {
      // Local mode registration
      const newProfile = {
        id: 'u_' + Date.now(),
        name: regName.trim(),
        email: normEmail,
        globalRole: GLOBAL_ROLES.STUDENT,
        program: regProgram,
        idNumber: regIdNumber.trim(),
        status: 'Active',
        createdAt: new Date().toISOString(),
      }
      const added = await db.add('users', newProfile)
      setPendingOtp({ user: added, code: makeCode() })
      setEnteredOtp('')
    }
  }

  async function handleResendVerification() {
    if (!unverifiedUser?.resend) return
    setLoading(true)
    setError('')
    try {
      await unverifiedUser.resend()
      setSuccessMsg(`A new verification email has been sent to ${unverifiedUser.email}. Please check your inbox.`)
    } catch (err) {
      setError(err.message || 'Failed to resend verification email.')
    } finally {
      setLoading(false)
    }
  }

  function verifyOtp(e) {
    e.preventDefault()
    if (enteredOtp.trim() !== pendingOtp.code) {
      setError('That code does not match. Request a new one if it expired.')
      return
    }
    signIn(pendingOtp.user.id)
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
            Institutional portal for students, faculty, and administrators.
            Restricted to <strong>@hau.edu.ph</strong> and <strong>@student.hau.edu.ph</strong> accounts.
          </p>
        </header>

        {/* Tab Navigation */}
        <div className="tab-bar" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            className={tab === 'login' ? 'primary' : 'quiet'}
            onClick={() => { setTab('login'); setError(''); setSuccessMsg('') }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={tab === 'register' ? 'primary' : 'quiet'}
            onClick={() => { setTab('register'); setError(''); setSuccessMsg('') }}
          >
            Student Registration
          </button>
        </div>

        <div className="panel" style={{ marginBottom: 26 }}>
          {successMsg && (
            <div className="note success" style={{ marginBottom: 16, color: 'var(--go, #10b981)', background: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 6 }}>
              {successMsg}
            </div>
          )}

          {pendingOtp ? (
            <form onSubmit={verifyOtp}>
              <p className="small muted">
                A one-time code was sent to <strong>{pendingOtp.user.email}</strong>.
              </p>
              <div className="note" style={{ marginBottom: 14 }}>
                Prototype stand-in for the SMTP step — your code is{' '}
                <strong className="mono">{pendingOtp.code}</strong>
              </div>
              <Field label="6-digit code">
                <input
                  value={enteredOtp}
                  onChange={e => setEnteredOtp(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
              </Field>
              {error && <p className="small" style={{ color: 'var(--stop)' }}>{error}</p>}
              <div className="actions" style={{ marginTop: 14 }}>
                <button className="primary" type="submit">Verify and sign in</button>
                <button type="button" className="quiet" onClick={() => { setPendingOtp(null); setError('') }}>
                  Use a different address
                </button>
              </div>
            </form>
          ) : tab === 'login' ? (
            <form onSubmit={handleSignIn}>
              <Field label="Institutional email" hint={`Allowed domains: ${EMAIL_DOMAINS.join(', ')}`}>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="katdungca@student.hau.edu.ph or kagespinosa@hau.edu.ph"
                  autoComplete="username"
                  required
                />
              </Field>

              {isFirebaseMode && (
                <Field label="Password">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </Field>
              )}

              {error && <p className="small" style={{ color: 'var(--stop)', marginBottom: 12 }}>{error}</p>}

              {unverifiedUser && (
                <div style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className="quiet"
                    disabled={loading}
                    onClick={handleResendVerification}
                    style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '6px 14px', borderRadius: 6, fontWeight: 500 }}
                  >
                    Resend Email
                  </button>
                </div>
              )}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Processing…' : isFirebaseMode ? 'Sign In with Firebase' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="note" style={{ marginBottom: 16, fontSize: 13, background: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 6 }}>
                <strong>Student Self-Registration:</strong> Restricted to <code>@student.hau.edu.ph</code> accounts. Faculty, Instructor, Program Chair, Dean, Associate Dean, and URO accounts are provisioned by the System Administrator.
              </div>

              <Field label="Full Name">
                <input
                  type="text"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="Karl Andrei T. Dungca"
                  required
                />
              </Field>

              <Field label="Student Email" hint={`Must end with ${STUDENT_DOMAIN}`}>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="katdungca@student.hau.edu.ph"
                  autoComplete="username"
                  required
                />
              </Field>

              {isFirebaseMode && (
                <Field label="Password" hint="At least 6 characters">
                  <input
                    type="password"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </Field>
              )}

              <Field label="Role">
                <input type="text" value="Student" disabled style={{ opacity: 0.8, cursor: 'not-allowed' }} />
              </Field>

              <Field label="Program">
                <select value={regProgram} onChange={e => setRegProgram(e.target.value)}>
                  {PROGRAMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>

              <Field label="Student ID Number">
                <input
                  type="text"
                  value={regIdNumber}
                  onChange={e => setRegIdNumber(e.target.value)}
                  placeholder="2022-0119"
                  required
                />
              </Field>

              {error && <p className="small" style={{ color: 'var(--stop)', marginBottom: 12 }}>{error}</p>}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Registering…' : 'Register Student Account'}
              </button>
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
