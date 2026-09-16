import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/cac.js'
import { signForm, generateApprovalSheet, submitRecommendationForm } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, fmtDateTime } from '../ui.jsx'
import { FORMS } from '../../domain/constants.js'

export default function FormsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  const hasRecommendation = b.forms.some(f => f.formType === FORMS.F2005.code)
  const hasApprovalSheet = b.forms.some(f => f.formType === FORMS.APPROVAL.code)

  return (
    <>
      <Section title="Institutional forms">
        {b.forms.length === 0 && <Empty>No forms have been generated for this project.</Empty>}
        {b.forms.map(f => {
          const mine = f.signatories?.find(s => s.userId === me.id && !s.signedAt)
          return (
            <div className="entry" key={f.id}>
              <div className="entry-head">
                <div>
                  <strong style={{ fontSize: 13 }}>{f.formType}</strong>
                  <div className="faint small">{f.name}</div>
                </div>
                <Badge tone={f.status === 'Completed' ? 'ok' : 'warn'}>{f.status}</Badge>
              </div>

              {f.payload?.verdict && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  Verdict: {f.payload.verdict} · {f.payload.revisionClass ?? 'no'} revisions
                  {f.payload.remarks && <> — {f.payload.remarks}</>}
                </div>
              )}

              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Signatory</th><th>Role</th><th className="tight">Signed</th></tr></thead>
                <tbody>
                  {(f.signatories ?? []).map((s, i) => (
                    <tr key={i}>
                      <td>{s.name ?? nameOf(s.userId)}</td>
                      <td className="small muted">{s.role}</td>
                      <td className="tight small">
                        {s.signedAt
                          ? <span className="mono" style={{ color: 'var(--ok)' }}>{fmtDateTime(s.signedAt)}</span>
                          : <span className="faint">pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {mine && can(ctx, 'form.sign') && (
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="primary" disabled={busy}
                    onClick={() => run(() => signForm(me, snap, b.project.id, f.id))}>
                    Sign as {mine.role}
                  </button>
                  <span className="faint small">
                    Records your name, role and timestamp against this form.
                  </span>
                </div>
              )}
            </div>
          )
        })}
        <ActionError error={error} />
      </Section>

      <Section title="Generate a form">
        <div className="actions">
          {can(ctx, 'finaldefense.recommend') && !hasRecommendation && (
            <button disabled={busy}
              onClick={() => run(() => submitRecommendationForm(me, snap, b.project.id))}>
              Submit {FORMS.F2005.code}
            </button>
          )}
          {can(ctx, 'form.sign') && !hasApprovalSheet && (
            <button disabled={busy}
              onClick={() => run(() => generateApprovalSheet(me, snap, b.project.id))}>
              Generate Approval Sheet
            </button>
          )}
          {hasRecommendation && hasApprovalSheet && <span className="faint small">All applicable forms exist.</span>}
        </div>
        <ActionError error={error} />
      </Section>
    </>
  )
}
