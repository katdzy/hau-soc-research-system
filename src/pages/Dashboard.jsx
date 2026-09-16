import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist } from '../services/worklist.js'
import { Badge, Section, Empty, Countdown, fmtDate, firstName } from '../components/ui.jsx'
import { stageByKey } from '../domain/stages.js'
import { can, resolveContext } from '../domain/cac.js'
import { GLOBAL_ROLES } from '../domain/constants.js'

export default function Dashboard() {
  const { snap, me } = useApp()
  const rows = worklist(snap, me)
  const institutional = resolveContext(me, null)

  const actionable = rows.filter(r => r.gates.some(g => !g.blocker) || r.tasks.length)
  const watching = rows.filter(r => !actionable.includes(r) && r.access.level === 'work')
  const observing = rows.filter(r => r.access.level === 'observe')

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Worklist</div>
        <h1>Good day, {firstName(me.name)}</h1>
        <p className="lede">
          {actionable.length
            ? `${actionable.length} project${actionable.length > 1 ? 's' : ''} need${actionable.length > 1 ? '' : 's'} something from you.`
            : 'Nothing is waiting on you right now.'}
        </p>
      </header>

      {me.globalRole === GLOBAL_ROLES.INSTRUCTOR_1 && (
        <div className="actions" style={{ marginBottom: 26 }}>
          <Link className="btn" to="/projects?new=1">Create a new project group</Link>
        </div>
      )}

      <Section title="Needs your action">
        {actionable.length === 0 && <Empty>Your queue is clear.</Empty>}
        <div className="stack">
          {actionable.map(r => (
            <div className="gate" key={r.project.id}>
              <div className="entry-head">
                <div>
                  <Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {r.project.program} · <span className="mono">{r.stage?.label}</span>
                  </div>
                </div>
                <div className="inline">
                  {r.ctx.projectRoles.map(role => <Badge key={role} tone="accent">{role}</Badge>)}
                  <Countdown deadline={r.project.revisionDeadline} />
                </div>
              </div>

              <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                {r.gates.filter(g => !g.blocker).map(g => (
                  <li key={g.gate.action} className="small">
                    <strong>{g.gate.label}</strong> — ready
                  </li>
                ))}
                {r.gates.filter(g => g.blocker).map(g => (
                  <li key={g.gate.action} className="small muted">
                    {g.gate.label} — <span style={{ color: 'var(--stop)' }}>{g.blocker}</span>
                  </li>
                ))}
                {r.tasks.map((t, i) => (
                  <li key={i} className="small" style={t.urgent ? { color: 'var(--stop)' } : undefined}>{t.label}</li>
                ))}
              </ul>

              <div className="actions" style={{ marginTop: 12 }}>
                <Link className="btn" to={`/projects/${r.project.id}`}>Open workspace</Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Your other projects">
        {watching.length === 0 && <Empty>No other projects assigned to you.</Empty>}
        {watching.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Project</th><th>Your role</th><th>Stage</th><th className="tight">Updated</th>
              </tr>
            </thead>
            <tbody>
              {watching.map(r => (
                <tr key={r.project.id}>
                  <td><Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link></td>
                  <td className="small muted">{r.ctx.projectRoles.join(', ') || '—'}</td>
                  <td><Badge>{stageByKey(r.project.currentStage)?.label}</Badge></td>
                  <td className="tight small faint">{fmtDate(r.bundle.history.at(-1)?.at ?? r.project.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {can(institutional, 'report.generate') && observing.length > 0 && (
        <Section
          title="Not yet endorsed to you"
          aside={<span className="faint small">Progressive visibility — read only until the project reaches your gate</span>}
        >
          <table>
            <thead><tr><th>Project</th><th>Stage</th><th>Reason</th></tr></thead>
            <tbody>
              {observing.map(r => (
                <tr key={r.project.id}>
                  <td className="muted">{r.project.title}</td>
                  <td><Badge>{stageByKey(r.project.currentStage)?.label}</Badge></td>
                  <td className="small faint">{r.access.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  )
}
