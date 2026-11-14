import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { adviserReturnBlocker, adviserReturnOf } from '../../domain/stages.js'
import { returnAdviserAssignment } from '../../services/api.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Field, fmtDateTime } from '../ui.jsx'
import { Act } from '../ViewOnly.jsx'

/**
 * S2.2 return path (NEW-7, flag ADVISER_RETURN_PATH). At Adviser Approval the
 * Dean or Associate Dean may send the assignment back with remarks; back at
 * Adviser Assignment the Program Chair reads them above the step.
 * Shown under "Next step"; renders nothing for anyone else.
 */
export default function AdviserReturn({ b, ctx }) {
  const { snap, me } = useApp()
  const returned = can(ctx, 'adviser.assign') ? adviserReturnOf(b) : null
  const canReturn = can(ctx, 'adviser.return') && !adviserReturnBlocker(b, me)

  if (returned) {
    const by = (snap.users ?? []).find(u => u.id === returned.by)?.name ?? returned.hat
    return (
      <div className="note stop mt-2" role="note">
        <strong className="small">Returned by the {returned.hat}</strong>
        <p className="small m-0 mt-half measure">{returned.remarks}</p>
        <p className="small muted m-0 mt-half">
          Keep or change the Adviser, then route the assignment again. Both offices approve it afresh.
        </p>
        <div className="faint small mt-half">{by} · {fmtDateTime(returned.at)}</div>
      </div>
    )
  }
  return canReturn ? <Act><ReturnForm b={b} /></Act> : null
}

function ReturnForm({ b }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [open, setOpen] = useState(false)
  const [remarks, setRemarks] = useState('')

  if (!open) {
    return (
      <div className="actions mt-2">
        <button className="quiet" onClick={() => setOpen(true)}>Return to the Program Chair…</button>
      </div>
    )
  }
  return (
    <div className="subform">
      <Field label="Why it is returned (required)" hint="Emailed to the Program Chair and the other office. Not to the proposed Adviser or the students.">
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} required autoFocus />
      </Field>
      <p className="small muted">
        The project goes back to Adviser Assignment and any approval already given is cleared.
      </p>
      <div className="actions">
        <button disabled={busy || !remarks.trim()}
          onClick={() => run(async () => {
            await returnAdviserAssignment(me, snap, b.project.id, { remarks })
            setRemarks(''); setOpen(false)
          })}>
          Return the assignment
        </button>
        <button className="quiet" disabled={busy} onClick={() => { setOpen(false); setRemarks('') }}>Cancel</button>
      </div>
      <ActionError error={error} />
    </div>
  )
}
