import { useApp } from '../../state/AppContext.jsx'
import { signForm } from '../../services/actions.js'
import { canSign } from '../../domain/forms.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, fmtDateTime } from '../ui.jsx'

// Forms are issued by workflow events, never by hand: FM-AAC-SOC-2004 when the
// Panel Chair records a verdict, FM-AAC-SOC-2005 when the Adviser recommends
// the group, and the Approval Sheet when final revisions close.

export default function FormsPanel({ b }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const forms = [...b.forms].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))

  return (
    <Section title="Institutional forms">
      {forms.length === 0 && <Empty>No forms yet. They are issued automatically as the workflow reaches them.</Empty>}
      {forms.map(f => {
        const check = canSign(f, me, b)
        const myLine = f.signatories.find(s => s.userId === me.id && !s.signedAt)
        return (
          <div className="entry form-entry" key={f.id}>
            <div className="entry-head">
              <div>
                <strong className="text-sm">{f.formType}</strong>
                {f.name !== f.formType && <div className="faint small">{f.name}</div>}
              </div>
              <Badge tone={f.status === 'Signed' ? 'ok' : 'warn'}>{f.status}</Badge>
            </div>

            {f.payload?.verdict && (
              <p className="small muted m-0 mt-1">
                {f.payload.defenseType} defense · {f.payload.verdict}
                {f.payload.remarks && <> — {f.payload.remarks}</>}
              </p>
            )}

            <table className="mt-2">
              <thead><tr><th className="tight">Step</th><th>Role</th><th>Signatory</th><th className="tight">Signed</th></tr></thead>
              <tbody>
                {[...f.signatories].sort((x, y) => x.order - y.order).map((s, i) => (
                  <tr key={i}>
                    <td className="tight mono faint">{s.order}</td>
                    <td className="small">{s.role}</td>
                    <td className="small muted">{s.name ?? nameOf(s.userId)}</td>
                    <td className="tight small">
                      {s.signedAt
                        ? <span className="mono signed">{fmtDateTime(s.signedAt)}</span>
                        : <span className="faint">pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {check.ok && (
              <div className="actions mt-2">
                <button className="primary" disabled={busy}
                  onClick={() => run(() => signForm(me, snap, b.project.id, f.id))}>
                  Sign as {check.line.role}
                </button>
                <span className="faint small">Records your name, role and the time against this form.</span>
              </div>
            )}
            {!check.ok && myLine && check.reason && (
              <p className="small faint mt-2">{check.reason}</p>
            )}
          </div>
        )
      })}
      <ActionError error={error} />
    </Section>
  )
}
