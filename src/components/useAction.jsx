import { useState } from 'react'
import { isViewOnly, VIEW_ONLY_MESSAGE } from './ViewOnly.jsx'

/**
 * Runs an async action, surfacing the guard message instead of throwing.
 * Refuses on a phone or upright tablet (ViewOnly.jsx), should a control slip
 * past <Act>.
 */
export function useAction() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn) => {
    if (isViewOnly()) { setError(VIEW_ONLY_MESSAGE); return }
    setError(''); setBusy(true)
    try { await fn() } catch (e) { setError(e.message ?? String(e)) } finally { setBusy(false) }
  }
  return { run, error, busy, setError }
}

export const ActionError = ({ error }) =>
  error ? <p className="small error-text mt-1">{error}</p> : null
