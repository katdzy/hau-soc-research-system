import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { visibleProjects, gateRows } from '../../services/views.js'
import { runGate, signForm, assignRole } from '../../services/actions.js'
import { canSign } from '../../domain/forms.js'
import { stageLabel } from '../../domain/stages.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, Empty } from '../../components/blocks.jsx'
import { fmtDate } from '../../components/ui.jsx'
import { ANNOTATION_STATUS as A, PROJECT_ROLES as P, ACCOUNT_STATUS, accountType } from '../../domain/constants.js'

// Pages used by more than one context.

/** Adviser "Annotations" and Panel "My Annotations": everything you wrote. */
export function MyAnnotations() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me).flatMap(({ b }) =>
    b.annotations.filter(a => a.authorId === me.id).map(a => ({ a, b, d: b.documents.find(x => x.id === a.documentId) })))
    .sort((x, y) => new Date(y.a.createdAt) - new Date(x.a.createdAt))

  return (
    <div className="page">
      <PageHead title="My annotations"
        lede="Every comment you have written in this context. Drafts are yours alone until you send feedback; panel notes stay private until the verdict." />
      {rows.length === 0 ? <Empty>You have not annotated anything in this context.</Empty> : (
        <div className="panel flush">
          <div className="table-scroll"><table>
            <thead><tr><th>Group · version</th><th>Location</th><th>Comment</th><th>Status</th><th className="tight" /></tr></thead>
            <tbody>
              {rows.map(({ a, b, d }) => (
                <tr key={a.id}>
                  <td className="small"><strong>{b.project.groupName}</strong><div className="muted">{d?.docType} v{d?.versionNumber}</div></td>
                  <td className="small mono">{a.anchor}</td>
                  <td className="small">{a.text}{a.studentResponse && <div className="muted">Group: “{a.studentResponse}”</div>}</td>
                  <td>
                    <Chip tone={a.status === A.RESOLVED ? 'ok' : a.status === A.DRAFT ? 'warn' : undefined}>
                      {a.visibility === 'private' && !a.releasedAt ? 'Private' : a.status}
                    </Chip>
                  </td>
                  <td className="tight"><Link className="btn small" to={`/review/${a.documentId}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}

/**
 * Adviser "Revision Verification" and Panel "Revision Confirmation": the forms
 * waiting on your signature, in their signing order.
 */
export function RevisionSignoffs() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const rows = visibleProjects(snap, me).flatMap(({ b }) =>
    b.forms.filter(f => f.signatories.some(s => s.userId === me.id && !s.signedAt && !s.viaGate))
      .map(f => ({ f, b, check: canSign(f, me, b) })))

  return (
    <div className="page">
      <PageHead title={me.actingAs === P.ADVISER ? 'Revision verification' : 'Revision confirmation'}
        lede="FM-AAC-SOC-2004 is signed by the Adviser first, after approving the revised manuscript, then by the Panel Members. The Approval Sheet follows the same order." />
      {rows.length === 0 && <Empty>No form is waiting on your signature in this context.</Empty>}
      {rows.map(({ f, b, check }) => (
        <section key={f.id} className="panel form-card">
          <div className="panel-head">
            <h2>{b.project.groupName} · {f.formType}</h2>
            <span className="faint small">{f.payload?.verdict ?? f.name}</span>
          </div>
          {f.payload?.remarks && <p className="small muted">Required revisions: {f.payload.remarks}</p>}
          <ol className="sign-order">
            {[...f.signatories].sort((x, y) => x.order - y.order).map((s, i) => (
              <li key={i} className={s.signedAt ? 'is-done' : undefined}>
                <span>{s.role} <span className="faint small">· {s.name ?? nameOf(s.userId)}</span></span>
                <Chip tone={s.signedAt ? 'ok' : undefined}>{s.signedAt ? `Signed ${fmtDate(s.signedAt)}` : 'Pending'}</Chip>
              </li>
            ))}
          </ol>
          <div className="actions" style={{ marginTop: 16 }}>
            {check.ok
              ? <button className="primary" disabled={busy} onClick={() => run(() => signForm(me, snap, b.project.id, f.id))}>Sign as {check.line.role}</button>
              : <span className="small faint">{check.reason}</span>}
            <Link className="small" to={`/projects/${b.project.id}`}>Open the project</Link>
          </div>
        </section>
      ))}
      <ActionError error={error} />
    </div>
  )
}

/**
 * A list of workflow steps this context can take, one row per group — used for
 * Defense Clearance (Adviser), Defense Endorsement and Clearance Routing
 * (Coordinator).
 */
export function GateListPage({ title, lede, capabilities, empty, withInstructor2 = false }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const rows = gateRows(snap, me, capabilities)

  return (
    <div className="page">
      <PageHead title={title} lede={lede} />
      {rows.length === 0 && <Empty>{empty}</Empty>}
      {rows.map(({ b, gate, blocker }) => (
        <section key={b.project.id} className={`gate${blocker ? ' blocked' : ''}`}>
          <h3>{b.project.groupName} — {gate.label}</h3>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{b.project.title} · {stageLabel(b.project.currentStage)}</p>
          {withInstructor2 && !b.assignments.some(a => a.roleType === P.INSTRUCTOR_2) && <Instructor2Picker b={b} />}
          {blocker
            ? <p className="blocker">{blocker}</p>
            : (
              <div className="actions" style={{ marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={() => run(() => runGate(me, snap, b.project.id, gate))}>{gate.label}</button>
                <Link className="small" to={`/projects/${b.project.id}`}>Open the project</Link>
              </div>
            )}
        </section>
      ))}
      <ActionError error={error} />
    </div>
  )
}

function Instructor2Picker({ b }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [pick, setPick] = useState('')
  const faculty = (snap.users ?? []).filter(u => accountType(u.email) === 'Faculty' && u.status === ACCOUNT_STATUS.ACTIVE)
  return (
    <div className="row inline-form">
      <label className="field">
        <span className="label">Instructor 2 (publishes the final defense schedule)</span>
        <select value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">Select faculty…</option>
          {faculty.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <div className="inline-form-action">
        <button disabled={!pick || busy} onClick={() => run(() => assignRole(me, snap, b.project.id, pick, P.INSTRUCTOR_2))}>Assign</button>
      </div>
      <ActionError error={error} />
    </div>
  )
}
