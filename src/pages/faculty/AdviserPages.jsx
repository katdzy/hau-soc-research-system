import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { visibleProjects, reviewQueue, currentVersion, daysSince, gateRows } from '../../services/views.js'
import { decideWeeklyLog } from '../../services/actions.js'
import { can } from '../../domain/caac.js'
import { stageLabel, STAGES } from '../../domain/stages.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, ContextsPanel, StatTile, Empty } from '../../components/blocks.jsx'
import { Badge, Field, docTone, fmtDate } from '../../components/ui.jsx'
import { FORMS, PROGRAMS } from '../../domain/constants.js'

// Adviser context: Dashboard, My Advisees, Review Queue (S-07) and Weekly Log
// Sign-off (S-09). Every list comes from CAAC resolution in the Adviser
// context, so only advisee groups appear.

export function AdviserDashboard() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me)
  const queue = reviewQueue(snap, me)
  const logs = queue.filter(q => q.kind === 'Weekly log').length
  const recommend = gateRows(snap, me, ['finaldefense.recommend'])

  return (
    <div className="page">
      <PageHead title="Dashboard" lede={`Advising ${rows.length} group${rows.length === 1 ? '' : 's'}.`} />
      <div className="stat-row">
        <StatTile label="Awaiting your review" value={queue.length - logs} note={<Link to="/queue">Review queue</Link>} />
        <StatTile label="Weekly logs to sign" value={logs} note={<Link to="/logs">Sign-off</Link>} />
        <StatTile label="Ready for FM-AAC-SOC-2005" value={recommend.filter(r => !r.blocker).length} note={<Link to="/clearance">Defense clearance</Link>} />
      </div>
      <div className="two-col wide-left">
        <AdviseeTable rows={rows} />
        <ContextsPanel me={me} snap={snap} />
      </div>
    </div>
  )
}

function AdviseeTable({ rows }) {
  if (rows.length === 0) return <Empty>No advisee groups.</Empty>
  return (
    <div className="panel flush">
      <div className="table-scroll"><table>
        <thead><tr><th>Group / Project</th><th>Stage</th><th>Current version</th><th className="tight" /></tr></thead>
        <tbody>
          {rows.map(({ b }) => {
            const v = currentVersion(b)
            return (
              <tr key={b.project.id}>
                <td>
                  <strong>{b.project.groupName}</strong>
                  <div className="small muted clamp-2">{b.project.title} · {b.project.program.split(' — ')[0]}</div>
                </td>
                <td className="small">{stageLabel(b.project.currentStage)}</td>
                <td>{v ? <Badge tone={docTone(v.status)}>{v.docType} v{v.versionNumber} · {v.status}</Badge> : <span className="faint small">—</span>}</td>
                <td className="tight"><Link className="btn small" to={`/projects/${b.project.id}`}>Open</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </div>
  )
}

export function MyAdvisees() {
  const { snap, me } = useApp()
  return (
    <div className="page">
      <PageHead title="My advisees" lede="Only groups you advise are visible in this context." />
      <AdviseeTable rows={visibleProjects(snap, me)} />
    </div>
  )
}

export function ReviewQueue() {
  const { snap, me } = useApp()
  const all = reviewQueue(snap, me)
  const [program, setProgram] = useState('')
  const [stage, setStage] = useState('')
  const [kind, setKind] = useState('')
  const kinds = [...new Set(all.map(i => i.kind))]
  const items = all.filter(i =>
    (!program || i.program === program) && (!stage || i.b.project.currentStage === stage) && (!kind || i.kind === kind))

  return (
    <div className="page page-wide">
      <PageHead title="Review queue"
        lede="Only projects you are assigned to are visible. Switching context changes which actions are available (Context-Aware Access Control)." />
      <div className="toolbar panel">
        <select value={program} onChange={e => setProgram(e.target.value)} aria-label="Program">
          <option value="">Program</option>{PROGRAMS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Stage">
          <option value="">Stage</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Type">
          <option value="">Document type</option>{kinds.map(k => <option key={k}>{k}</option>)}
        </select>
        <span className="toolbar-end small muted">{items.length} item{items.length === 1 ? '' : 's'} awaiting you</span>
      </div>
      <div className="two-col wide-left">
        {items.length === 0 ? <Empty>Nothing is waiting on you.</Empty> : (
          <div className="panel flush">
            <div className="table-scroll"><table>
              <thead><tr><th>Group / Project</th><th>Submitted</th><th>Type</th><th>Waiting</th><th className="tight" /></tr></thead>
              <tbody>
                {items.map((i, n) => (
                  <tr key={n}>
                    <td>
                      <strong>{i.b.project.groupName}</strong>
                      <div className="small muted clamp-2">{i.b.project.title} · {i.program.split(' — ')[0]}</div>
                      <Chip>Your role: {i.role}</Chip>
                    </td>
                    <td className="small">{i.version != null ? (typeof i.version === 'number' ? `v${i.version}` : i.version) : '—'} · {fmtDate(i.at)}</td>
                    <td className="small">{i.kind}</td>
                    <td className="small">{daysSince(i.at)} day{daysSince(i.at) === 1 ? '' : 's'}</td>
                    <td className="tight"><Link className={`btn small${n === 0 ? ' primary' : ''}`} to={i.to}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
        <aside className="side">
          <ContextsPanel me={me} snap={snap} />
          <section className="note">
            <strong>Progressive visibility.</strong> Projects appear on higher-level dashboards only after being
            formally endorsed to that workflow gate. An Adviser sees advisees; a Coordinator sees the program;
            the Dean sees a project when it reaches the Dean’s gate.
          </section>
        </aside>
      </div>
    </div>
  )
}

export function LogSignoff() {
  const { snap, me } = useApp()
  const [params, setParams] = useSearchParams()
  const rows = visibleProjects(snap, me).filter(r => can(r.ctx, 'weeklylog.sign') || r.b.weeklyLogs.length)
  const pending = useMemo(() => rows.flatMap(({ b, ctx }) =>
    b.weeklyLogs.filter(l => l.status === 'Submitted' && can(ctx, 'weeklylog.sign')).map(l => ({ l, b })))
    .sort((x, y) => new Date(x.l.submittedAt) - new Date(y.l.submittedAt)), [rows])
  const selected = pending.find(p => p.l.id === params.get('log')) ?? pending[0]
  const groups = new Set(pending.map(p => p.b.project.id)).size

  return (
    <div className="page page-wide">
      <PageHead title="Weekly logs — sign-off"
        lede={`${FORMS.F2003.code} · review the group’s accomplishment report, then approve and sign it or return it.`} />
      <div className="two-col narrow-left">
        <section className="panel flush">
          <div className="panel-head padded">
            <h2>Awaiting your signature</h2>
            <span className="faint small">{pending.length} log{pending.length === 1 ? '' : 's'} across {groups} group{groups === 1 ? '' : 's'}</span>
          </div>
          {pending.length === 0 && <p className="small muted padded">Nothing to sign.</p>}
          <ul className="pick-list">
            {pending.map(({ l, b }) => (
              <li key={l.id}>
                <button className={selected?.l.id === l.id ? 'is-selected' : undefined} aria-pressed={selected?.l.id === l.id}
                  onClick={() => setParams({ log: l.id })}>
                  <strong>{b.project.groupName} · Week {l.weekNo}</strong>
                  <span className="small muted">Submitted {fmtDate(l.submittedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {selected ? <SignoffDetail key={selected.l.id} l={selected.l} b={selected.b} /> : <Empty>Choose a log to review.</Empty>}
      </div>
    </div>
  )
}

function SignoffDetail({ l, b }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [remarks, setRemarks] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{b.project.groupName} — Week {l.weekNo}</h2>
        <Chip>Read-only submission</Chip>
      </div>
      <p className="small muted">Consultation: {fmtDate(l.consultationDate)} · {l.consultationMode} · submitted by {nameOf(l.submittedBy)}</p>
      <div className="label" style={{ marginTop: 16 }}>Accomplishments this week</div>
      <p className="small">{l.accomplishments}</p>
      <div className="label">Tasks for next week</div>
      <p className="small">{l.nextTasks || <span className="faint">None given</span>}</p>

      <Field label="Adviser remarks"><textarea value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
      <div className="dashed small">
        <strong>Digital signature</strong>
        <div>{me.name}</div>
        <div className="faint">Adviser · {b.project.groupName} · {FORMS.F2003.code}</div>
        <div className="faint">The time is recorded on signing, with an entry in the append-only audit trail.</div>
      </div>
      <label className="inline small" style={{ margin: '16px 0' }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        I confirm this consultation took place
      </label>
      <div className="actions">
        <button className="primary" disabled={busy || !confirmed}
          onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: true, remarks, confirmed }))}>
          Approve and sign
        </button>
        <button disabled={busy || !remarks.trim()}
          onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: false, remarks }))}>
          Return to the group for revision
        </button>
      </div>
      <ActionError error={error} />
    </section>
  )
}
