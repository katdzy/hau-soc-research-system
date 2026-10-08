import { usePwa } from '../pwa.js'
import { useState } from 'react'
import { sendTestNotification, useNotificationPermission } from '../notifications.js'
import { browserInfo, currentEnv } from '../browserSupport.js'

/**
 * "Install app", in each browser's own terms (browserSupport.installHint):
 * Chrome, Edge and Samsung Internet get their install sheet as a button; iOS
 * browsers and Android browsers without one are told where the menu item is;
 * an in-app browser (Messenger, Instagram…) is sent to Safari or Chrome first.
 * On iOS installing is also what unlocks notifications, so the hint says so.
 * Renders nothing once installed.
 */
export function InstallApp({ className }) {
  const { install, promptInstall } = usePwa()
  if (install === 'prompt') {
    return (
      <div className={className}>
        <button className="small" onClick={promptInstall}>Install app</button>
      </div>
    )
  }
  const hint = {
    'in-app': (
      <>
        This page is open inside another app. To install it and get notifications, open it in{' '}
        <strong>{browserInfo(currentEnv()).ios ? 'Safari' : 'Chrome'}</strong> (look for Open in browser in the app's menu).
      </>
    ),
    'ios-safari': (
      <>
        To install and get notifications: tap Share <ShareGlyph /> (under <MoreGlyph /> on newer iPhones), choose{' '}
        <strong>Add to Home Screen</strong> and keep Open as Web App on.
      </>
    ),
    'ios-other': (
      <>
        To install and get notifications: tap Share <ShareGlyph />, then <strong>Add to Home Screen</strong>.
        Not there? Open this page in Safari.
      </>
    ),
    'android-menu': (
      <>
        To install: open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
      </>
    ),
  }[install]
  return hint ? <Hint className={className}>{hint}</Hint> : null
}

/**
 * Device notifications for this account on this device (DEVICE_NOTIFICATIONS).
 * Asking happens on a tap — iOS and Chrome both refuse a prompt on load.
 */
export function NotificationSetting({ me, className }) {
  const { status, request } = useNotificationPermission(me)
  if (status === 'default') {
    return (
      <div className={className}>
        <button className="small" onClick={request}>Turn on notifications</button>
        <p className="install-hint mt-half">Get the same updates as your HAU email on this device.</p>
      </div>
    )
  }
  if (status === 'granted') return <TestNotification className={className} />
  // Every state that can be helped says how; email still carries each notification.
  // 'needs-install' and 'in-app' are explained by InstallApp just above; 'off' = the flag.
  const text = {
    denied: browserInfo(currentEnv()).ios
      ? 'Notifications are blocked. Turn them on in Settings › Notifications › HAU-SOC Capstone.'
      : 'Notifications are blocked. Allow them for this site in the browser or phone settings.',
    'ios-too-old': 'Notifications need iOS 16.4 or later. Until then, every update still reaches your HAU email.',
    unsupported: 'This browser cannot show notifications. Use Chrome, Edge, Firefox or Samsung Internet, or rely on your HAU email.',
  }[status]
  return text ? <Hint className={className}>{text}</Hint> : null
}

/** "On" plus a way to check that this device really shows them. */
function TestNotification({ className }) {
  const [sent, setSent] = useState(null)
  const send = () => sendTestNotification()
    .then(() => setSent('Sent. Check your notifications.'))
    .catch(() => setSent('This device could not show it. Check its notification settings.'))
  return (
    <Hint className={className} aria-live="polite">
      Notifications are on for this device.{' '}
      {sent && `${sent} `}
      <button className="linkish" onClick={send}>{sent ? 'Send again' : 'Send a test'}</button>
    </Hint>
  )
}

/** A new deploy is waiting. It applies on reload, never mid-task. */
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

// The wrapper takes the placement class (e.g. the account menu's divider), the text keeps its own type.
const Hint = ({ className, children, ...rest }) => (
  <div className={className}><p className="install-hint" {...rest}>{children}</p></div>
)

// Safari's own buttons, drawn so the hint matches what is on screen. The word
// beside each carries the meaning, so screen readers skip the drawing.
const ShareGlyph = () => (
  <svg className="glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M8 1v9M5 4l3-3 3 3M4.5 7H3.5v7.5h9V7h-1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const MoreGlyph = () => (
  <>
    <svg className="glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
    <span className="sr-only">the More button</span>
  </>
)
