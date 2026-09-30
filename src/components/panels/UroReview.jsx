import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import {
  stageByKey, uroReturnOf, uroReturnOutstanding, uroReturnBlocker, uroReturnableTypes, returnResetsSigning,
} from '../../domain/stages.js'
import { returnToGroup } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Badge, Field, docTone, fmtDate, fmtDateTime } from '../ui.jsx'

/**
 * S9.4 — what the URO verifies (both certificates and the manuscript) and the
 * return path (NEW-7, flags URO_RETURN_PATH and URO_RETURNABLE). The URO acts
 * here; the group and the Adviser read the returns and their remarks.
 */
export default function UroReview({ b, ctx, goTo }) {
  const { snap } = useApp()
  const atUro = b.project.currentStage === 'URO_VERIFICATION'
  const returns = b.project.uroReturns ?? []
  if (!atUro && !returns.length) return null

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const latest = (t) => b.documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0]
  const items = stageByKey('URO_VERIFICATION').gates[0].verifies
  const waiting = uroReturnOutstanding(b)
  const verifier = can(ctx, 'uro.verify')

  return (
    <Section title="Clearance verification" aside={<span className="faint small">University Research Office</span>}>
      {atUro && (
        <div className="table-scroll"><table>
          <thead><tr><th>Document</th><th>Version</th><th>Submitted</th><th className="tight">Status</th></tr></thead>
          <tbody>
            {items.map(t => {
              const d = latest(t)
              return (
                <tr key={t}>
                  <td>{t}</td>
                  <td className="mono small">{d ? `v${d.versionNumber}` : '—'}</td>
                  <td className="small muted">{d ? `${fmtDate(d.submittedAt)} · ${nameOf(d.submittedBy)}` : 'Not submitted'}</td>
                  <td className="tight">{d && <Badge tone={docTone(d.status)}>{d.status}</Badge>}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
      {atUro && verifier && (
        <div className="actions" style={{ marginTop: 16 }}>
          <button onClick={() => goTo('documents')}>Open the documents</button>
        </div>
      )}

      {returns.length > 0 && (
        <>
          <h3 className="label group-sub">Returned to the group</h3>
          {[...returns].reverse().map(r => (
            <div className="entry" key={r.at}>
              <div className="entry-head">
                <strong style={{ fontSize: 13 }}>{r.docTypes.join(' and ')}</strong>
                {r === uroReturnOf(b) && waiting.length
                  ? <Badge tone="warn">Waiting for a new version</Badge>
                  : <Badge tone="ok">Replaced</Badge>}
              </div>
              <p className="small" style={{ margin: '4px 0 0', maxWidth: '64ch' }}>{r.remarks}</p>
              {r.resetsSigning && (
                <p className="small muted" style={{ margin: '4px 0 0' }}>Sent back to Final Requirements; the Approval Sheet was reissued for new signatures.</p>
              )}
              <div className="faint small" style={{ marginTop: 4 }}>{nameOf(r.by)} · {fmtDateTime(r.at)}</div>
            </div>
          ))}
        </>
      )}

      {atUro && can(ctx, 'uro.return') && !waiting.length && <ReturnForm b={b} />}
    </Section>
  )
}

function ReturnForm({ b }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [picked, setPicked] = useState([])
  const [remarks, setRemarks] = useState('')
  const toggle = (t) => setPicked(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]))
  const blocker = picked.length ? uroReturnBlocker(b, picked) : null

  return (
    <div className="subform">
      <fieldset className="choice">
        <legend className="label">Return to the group</legend>
        {uroReturnableTypes().map(t => (
          <label key={t} className="inline small">
            <input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} />
            {t}
          </label>
        ))}
      </fieldset>
      <Field label="What the group has to fix (required)" hint="Emailed to the group and the Adviser, and shown on the project.">
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} required />
      </Field>
      {returnResetsSigning(picked) ? (
        <p className="note small" role="note">
          Returning the manuscript sends the project back to Final Requirements. The Approval Sheet is voided and
          reissued: once the group uploads a new Final Manuscript, the Adviser, the panel and the Program
          Chair/Coordinator sign again, and the project comes back to you after the new endorsement.
        </p>
      ) : (
        <p className="small muted">
          The project stays with you. The group uploads a new version of each certificate you return, and it comes
          back to your queue. The Approval Sheet signatures stand.
        </p>
      )}
      <button disabled={busy || !picked.length || !remarks.trim() || Boolean(blocker)}
        onClick={() => run(async () => {
          await returnToGroup(me, snap, b.project.id, { docTypes: picked, remarks })
          setPicked([]); setRemarks('')
        })}>
        Return to the group
      </button>
      {blocker && <p className="blocker">{blocker}</p>}
      <ActionError error={error} />
    </div>
  )
}
