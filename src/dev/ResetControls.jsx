import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { fmtDateTime } from '../components/ui.jsx'
import { readCheckpoint, writeCheckpoint } from './checkpoint.js'
import './dev.css'

/**
 * Dev-only reset for roleplay: back to the seed, or save / restore a
 * checkpoint of the whole store. Refuses to run against a live Firebase
 * project (AppContext.replaceStore).
 */
export default function ResetControls({ compact = false }) {
  const { snap, me, replaceStore, resetDemoData, signIn } = useApp()
  const [checkpoint, setCheckpoint] = useState(readCheckpoint)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const act = (fn) => async () => {
    setBusy(true); setStatus('')
    try { setStatus(await fn()) } catch (e) { setStatus(e.message ?? String(e)) } finally { setBusy(false) }
  }

  const reset = act(async () => {
    await resetDemoData()
    return 'Back to the seed.'
  })
  const save = act(async () => {
    setCheckpoint(writeCheckpoint(snap, me?.id))
    return 'Checkpoint saved.'
  })
  const restore = act(async () => {
    const cp = readCheckpoint()
    if (!cp) return 'No checkpoint saved yet.'
    await replaceStore(cp.store)
    // Same persona as when it was saved, when there was one.
    if (cp.signedInAs && cp.store.users?.[cp.signedInAs]) signIn(cp.signedInAs)
    return `Restored the checkpoint from ${fmtDateTime(cp.savedAt)}.`
  })

  return (
    <div className="reset-controls" aria-label="Demo data">
      {!compact && <div className="label">Demo data <span className="dev-flag">dev</span></div>}
      <div className="reset-row">
        <button className="small danger" disabled={busy} onClick={reset}
          title="Discard everything done since and reload the §6 seed">
          Reset to seed
        </button>
        {me && (
          <button className="small" disabled={busy} onClick={save}
            title="Remember the whole store as it is right now">
            Save checkpoint
          </button>
        )}
        <button className="small" disabled={busy || !checkpoint} onClick={restore}
          title={checkpoint ? `Saved ${fmtDateTime(checkpoint.savedAt)}` : 'Save a checkpoint first'}>
          Restore checkpoint
        </button>
      </div>
      <p className="faint small" role="status" aria-live="polite" style={{ margin: 0 }}>
        {status || (checkpoint ? `Checkpoint: ${fmtDateTime(checkpoint.savedAt)}` : 'No checkpoint saved.')}
      </p>
    </div>
  )
}
