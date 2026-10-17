import { usePwa } from '../pwa.js'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sendTestNotification, useNotificationPermission } from '../notifications.js'
import { browserInfo, currentEnv } from '../browserSupport.js'

/**
 * Installing the web app (Figma 07 · PWA, PWA-01 – PWA-07). Chrome, Edge and
 * Samsung Internet open their own install dialog; every other browser gets a
 * sheet of numbered steps in its own terms (browserSupport.installHint), and
 * an in-app browser (Messenger, Instagram…) is sent to Safari or Chrome first.
 * Nothing renders once the app is installed.
 */
function useInstallFlow() {
  const { install, promptInstall } = usePwa()
  const [sheet, setSheet] = useState(false)
  return {
    install,
    start: () => (install === 'prompt' ? promptInstall() : setSheet(true)),
    sheet: sheet && install && install !== 'prompt'
      ? <InstallSheet kind={install} onClose={() => setSheet(false)} />
      : null,
  }
}

/** "Install app" as a plain button: the account menu and the sign-in page. */
export function InstallApp({ className }) {
  const { install, start, sheet } = useInstallFlow()
  if (!install) return null
  return (
    <div className={className}>
      <button className="small" onClick={start}>Install app</button>
      {sheet}
    </div>
  )
}

const DISMISS_KEY = 'hausoc.install.dismissed'
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

/**
 * The "Install HAU-SOC Capstone" banner at the foot of the dashboard on a
 * phone or tablet (PWA-01). Shown until it is dismissed or the app is
 * installed; the account menu keeps the same entry afterwards.
 */
export function InstallBanner() {
  const { install, start, sheet } = useInstallFlow()
  const { needRefresh } = usePwa()
  const [dismissed, setDismissed] = useState(readDismissed)
  // The update bar takes the same corner; it wins.
  if (!install || dismissed || needRefresh) return null
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode: hidden until reload */ }
    setDismissed(true)
  }
  return (
    <aside className="install-banner" aria-labelledby="install-banner-title">
      <img className="app-icon" src="/pwa-192.png" alt="" width="40" height="40" />
      <div className="install-banner-text">
        <strong id="install-banner-title">Install HAU-SOC Capstone</strong>
        <span>Open it from your home screen and get notified about your project.</span>
      </div>
      <button className="primary small" onClick={start}>Install app</button>
      <button className="quiet sheet-x" onClick={dismiss} aria-label="Dismiss the install banner">
        <CloseGlyph />
      </button>
      {sheet}
    </aside>
  )
}

/** The steps for one browser. Copy follows the Figma frames PWA-03 – PWA-07. */
function sheetFor(kind) {
  const env = currentEnv()
  const b = browserInfo(env)
  if (kind === 'android-menu') {
    return {
      title: 'Add HAU-SOC Capstone to your home screen',
      lead: 'This browser has no install button. Use its menu instead:',
      steps: [
        [<>Tap the menu <KebabGlyph /> at the top right</>, <KebabGlyph />],
        ['Tap “Install app” or “Add to Home screen”', <AddGlyph />],
        ['Confirm with “Install” or “Add”'],
      ],
    }
  }
  if (kind === 'ios-safari') {
    return {
      title: 'Add HAU-SOC Capstone to your Home Screen',
      lead: 'iPhone has no install button. It takes three taps in Safari:',
      steps: [
        [<>Tap Share in the toolbar below (under <MoreGlyph /> on newer iPhones)</>, <ShareGlyph />],
        ['Scroll down and tap “Add to Home Screen”', <AddGlyph />],
        ['Tap “Add” at the top right'],
      ],
      note: 'Device notifications work only from the Home Screen app (iOS 16.4 or later).',
    }
  }
  if (kind === 'ios-other') {
    const name = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' }[b.browser]
    const barShare = b.browser === 'chrome' || b.browser === 'edge'
    return {
      title: 'Add HAU-SOC Capstone to your Home Screen',
      lead: name ? `In ${name} on iPhone:` : 'In this browser on iPhone:',
      steps: [
        [barShare ? 'Tap Share in the address bar above' : 'Tap Share in the browser menu', <ShareGlyph />],
        ['Tap “Add to Home Screen”', <AddGlyph />],
        ['Tap “Add”'],
      ],
      note: 'Don’t see it? Open this page in Safari instead.',
    }
  }
  // 'in-app'
  return {
    title: 'Open in Safari or Chrome to install',
    lead: 'Pages opened inside Messenger, Facebook, Instagram or the Google app can’t be installed or send notifications.',
    steps: [
      [<>Tap <MoreGlyph /> at the top right</>, <MoreGlyph />],
      [b.ios ? 'Choose “Open in Safari” (or “Open in browser”)' : 'Choose “Open in browser” (or “Open in Chrome”)'],
      ['Then follow the install steps'],
    ],
    copyLink: true,
  }
}

/**
 * A bottom sheet on phones, a small dialog on wider screens. A native modal
 * <dialog>: focus moves in and returns, Escape closes, the page stays inert.
 * Portalled to <body> so it is not clipped by the account menu.
 */
function InstallSheet({ kind, onClose }) {
  const ref = useRef(null)
  const titleId = useId()
  const [copied, setCopied] = useState(null)
  const s = sheetFor(kind)

  // No close() on cleanup: unmounting removes the dialog from the top layer,
  // and a close() there would fire onClose during StrictMode's re-run.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal?.()
    // Start on the sheet's own action rather than ✕.
    dialog.querySelector('.sheet-action')?.focus()
  }, [])

  const copy = () => navigator.clipboard?.writeText(window.location.href)
    .then(() => setCopied('Link copied. Paste it into Safari or Chrome.'))
    .catch(() => setCopied(`Copy this address: ${window.location.href}`))
    ?? setCopied(`Copy this address: ${window.location.href}`)

  return createPortal(
    <dialog
      ref={ref} className="install-sheet" aria-labelledby={titleId}
      onClose={onClose}
      // A tap on the backdrop lands on the dialog element itself.
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}
    >
      <div className="sheet-head">
        <img className="app-icon" src="/pwa-192.png" alt="" width="40" height="40" />
        <div>
          <h2 id={titleId}>{s.title}</h2>
          <p className="sheet-lead">{s.lead}</p>
        </div>
        <button className="quiet sheet-x" onClick={() => ref.current.close()} aria-label="Close">
          <CloseGlyph />
        </button>
      </div>
      <ol className="sheet-steps">
        {s.steps.map(([text, icon], i) => (
          <li key={i}>
            <span className="sheet-n" aria-hidden="true">{i + 1}</span>
            <span className="sheet-step">{text}</span>
            {icon && <span className="sheet-icon" aria-hidden="true">{icon}</span>}
          </li>
        ))}
      </ol>
      {s.note && <p className="sheet-note">{s.note}</p>}
      {copied && <p className="sheet-note" role="status">{copied}</p>}
      {s.copyLink
        ? <button className="sheet-action" onClick={copy}>Copy link</button>
        : <button className="primary sheet-action" onClick={() => ref.current.close()}>Got it</button>}
    </dialog>,
    document.body,
  )
}

/**
 * "Notifications on this device" in the account menu (PWA-09 – PWA-11): a
 * switch, per account and per device. Permission is asked only when the
 * switch is turned on (iOS and Chrome refuse a prompt on load). Email stays
 * the official record, so every state says it still arrives; a state the
 * user cannot switch says where to fix it.
 */
export function NotificationSetting({ me, className = '' }) {
  const { status, on, turnOn, turnOff } = useNotificationPermission(me)
  const [busy, setBusy] = useState(false)
  const id = useId()
  // Desktop gets email only (Figma F04): there is nothing to switch.
  if (status === 'off' || status === 'desktop') return null

  const ios = browserInfo(currentEnv()).ios
  const blocked = {
    denied: ios
      ? { sub: 'Blocked in your phone settings', fix: 'Settings › Notifications › HAU-SOC Capstone › Allow Notifications' }
      : { sub: 'Blocked in this browser’s settings', fix: 'Allow notifications for this site in the browser or phone settings.' },
    'needs-install': {
      sub: 'Install the app first',
      fix: ios ? 'iPhone shows notifications only from the Home Screen app.' : 'Notifications come from the installed app, not a browser tab.',
    },
    'in-app': { sub: 'Open this page in Safari or Chrome first' },
    'ios-too-old': { sub: 'Needs iOS 16.4 or later', fix: 'Every update still reaches your HAU email.' },
    unsupported: { sub: 'Not available in this browser', fix: 'Use Chrome, Edge, Firefox or Samsung Internet, or rely on your HAU email.' },
  }[status]
  const sub = blocked?.sub ?? (on ? 'On — you’ll also still get every email' : 'Off — you’ll still get every email')

  const toggle = async () => {
    setBusy(true)
    try { await (on ? turnOff() : turnOn()) } finally { setBusy(false) }
  }

  return (
    <div className={`notify-row${on ? ' is-on' : ''} ${className}`}>
      <div className="notify-head">
        <div className="notify-text">
          <span className="notify-title" id={`${id}-l`}>Notifications on this device</span>
          <span className="notify-sub" id={`${id}-d`}>{sub}</span>
        </div>
        <button
          className="switch" role="switch" aria-checked={on}
          aria-labelledby={`${id}-l`} aria-describedby={`${id}-d`}
          disabled={!!blocked || busy} onClick={toggle}
        >
          <span className="switch-knob" />
        </button>
      </div>
      {blocked?.fix && <p className="notify-fix">{blocked.fix}</p>}
      {on && <TestNotification />}
    </div>
  )
}

/** A way to check that this device really shows them (PWA-11). */
function TestNotification() {
  const [sent, setSent] = useState(null)
  const send = () => sendTestNotification()
    .then(() => setSent('Sent. Check your notifications.'))
    .catch(() => setSent('This device could not show it. Check its notification settings.'))
  return (
    <div className="notify-test">
      <button className="small" onClick={send}>{sent ? 'Send again' : 'Send a test'}</button>
      <span className="notify-sub" aria-live="polite">{sent}</span>
    </div>
  )
}

/** A new deploy is waiting. It applies on reload, never mid-task (PWA-13). */
export function UpdateBar() {
  const { needRefresh, reload, dismissUpdate } = usePwa()
  if (!needRefresh) return null
  return (
    <div className="update-bar" role="status">
      <span>A new version is ready.</span>
      <button className="primary small" onClick={reload}>Reload</button>
      <button className="small ghost-on-ink" onClick={dismissUpdate}>Later</button>
    </div>
  )
}

// The browsers' own buttons, drawn so the steps match what is on screen. The
// words beside each carry the meaning, so screen readers skip the drawings.
const Glyph = ({ children, label }) => (
  <>
    <svg className="glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">{children}</svg>
    {label && <span className="sr-only">{label}</span>}
  </>
)
const ShareGlyph = () => (
  <Glyph>
    <path d="M8 1v9M5 4l3-3 3 3M4.5 7H3.5v7.5h9V7h-1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Glyph>
)
const AddGlyph = () => (
  <Glyph>
    <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </Glyph>
)
const MoreGlyph = () => (
  <Glyph label="the More button">
    <circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" />
  </Glyph>
)
const KebabGlyph = () => (
  <Glyph label="the menu button">
    <circle cx="8" cy="3" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="13" r="1.4" fill="currentColor" />
  </Glyph>
)
const CloseGlyph = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
