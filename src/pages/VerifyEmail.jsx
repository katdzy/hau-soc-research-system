import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { verifyEmail } from '../services/api.js'
import { FLAGS } from '../domain/flags.js'
import { SignInBrand, SignInMain, VerifySteps } from './SignIn.jsx'

// The verification link lands here (Figma S-16, WORKFLOWS S0.2).
//   ?verify=<token>  the local build's link (outbox / test panel): verified here
//   ?verified=1      Firebase's "Continue" after its own page verified the
//                    address; the account record catches up at the next login
//                    (confirmProviderVerification)
// In the Firebase build a ?verify token is never redeemed in the browser
// (services/remote.js): every signed-in account can read tokens.

/** The verification query this screen answers, or null. */
export function verificationLink(search) {
  const q = new URLSearchParams(search)
  if (q.get('verify')) return { token: q.get('verify') }
  if (q.get('verified') === '1') return { token: null }
  return null
}

export default function VerifyEmail() {
  const { backendName, me } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const link = verificationLink(location.search)
  const local = backendName !== 'firebase'
  // checking → done | failed. Firebase has already verified by the time ?verified arrives.
  const [state, setState] = useState(() => !link?.token ? { step: 'done' }
    : local ? { step: 'checking' }
      : { step: 'failed', message: 'This build confirms your address through the verification email from the sign-in service, not this link.' })
  const once = useRef(false)

  useEffect(() => {
    if (!link?.token || !local || once.current) return
    once.current = true
    verifyEmail(link.token)
      .then(() => setState({ step: 'done' }))
      .catch(err => setState({ step: 'failed', message: err.message || 'This verification link did not work.' }))
  }, [link?.token, local])

  const toLogin = () => navigate('/', { replace: true, state: me ? null : { tab: 'login' } })
  const active = FLAGS.ACCOUNT_ACTIVATION === 'email'

  return (
    <div className="signin">
      <SignInBrand />
      <SignInMain>
          <div className="panel auth-panel verify-panel" aria-live="polite">
            {state.step === 'checking' && (
              <>
                <h2>Checking your link…</h2>
                <p className="signin-sub">This takes a moment.</p>
              </>
            )}
            {state.step === 'done' && (
              <>
                <VerifySteps verified />
                <span className="verify-mark is-ok" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <h2>Email verified</h2>
                <p className="signin-sub">
                  {active
                    ? 'Your account is active. Log in with the email and password you registered with.'
                    : 'Your address is confirmed. The System Administrator activates the account next; you’ll get an email when they do.'}
                </p>
                <button className="primary create-account-btn" type="button" onClick={toLogin}>
                  {me ? 'Go to your dashboard' : 'Log in'}
                </button>
              </>
            )}
            {state.step === 'failed' && (
              <>
                <span className="verify-mark is-stop" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 7v6.5M12 17v.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </span>
                <h2>This link didn’t work</h2>
                <p className="signin-sub">
                  {state.message} If you already verified, just log in. Otherwise log in with your
                  email and password — you’ll be offered a new link.
                </p>
                <button className="primary create-account-btn" type="button" onClick={toLogin}>
                  {me ? 'Go to your dashboard' : 'Go to log in'}
                </button>
              </>
            )}
          </div>
      </SignInMain>
    </div>
  )
}
