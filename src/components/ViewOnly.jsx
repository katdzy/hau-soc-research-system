import { useSyncExternalStore } from 'react'
import { FLAGS } from '../domain/flags.js'

/**
 * Phones and tablets held upright are view only (Figma 06, flag PHONE_VIEW_ONLY):
 * people read their project, worklist and notifications there, and submit,
 * annotate, approve or return on a laptop, a desktop or a tablet in landscape.
 * A touch screen narrower than 1024px counts; a narrow desktop window does not.
 *
 * This is a device rule, not a permission: CAAC (guard.js) still decides what
 * each role may do. <Act> drops the controls and useAction refuses the call,
 * so nothing half-works on a phone.
 */
const QUERY = '(max-width: 1023px) and (pointer: coarse)'
const enabled = FLAGS.PHONE_VIEW_ONLY !== 'off'

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null)
const subscribe = (fn) => {
  const mq = media()
  mq?.addEventListener('change', fn)
  return () => mq?.removeEventListener('change', fn)
}
export const isViewOnly = () => enabled && !!media()?.matches

export function useViewOnly() {
  return useSyncExternalStore(subscribe, isViewOnly, () => false)
}

export const VIEW_ONLY_MESSAGE = 'View only on phone. Open the system on a laptop or desktop to submit, annotate, approve or return.'

/** Wraps a control that changes something. Renders nothing in view-only mode. */
export function Act({ children }) {
  return useViewOnly() ? null : children
}

/** The strip under the top bar on every signed-in screen (Figma R-01p). */
export function ViewOnlyBanner() {
  if (!useViewOnly()) return null
  return (
    <p className="view-only-banner">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span>{VIEW_ONLY_MESSAGE}</span>
    </p>
  )
}
