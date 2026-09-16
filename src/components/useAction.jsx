import { useState } from 'react'

/** Runs an async action, surfacing the guard message instead of throwing. */
export function useAction() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn) => {
    setError(''); setBusy(true)
    try { await fn() } catch (e) { setError(e.message ?? String(e)) } finally { setBusy(false) }
  }
  return { run, error, busy, setError }
}

export const ActionError = ({ error }) =>
  error ? <p className="small" style={{ color: 'var(--stop)', marginTop: 8 }}>{error}</p> : null
