import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist, isActionable } from '../services/worklist.js'
import { Badge, Section, Empty, Countdown, fmtDate, firstName } from '../components/ui.jsx'
import { can, resolveInstitution } from '../domain/caac.js'
import { GLOBAL_ROLES as G } from '../domain/constants.js'

const OFFICES = [G.COORDINATOR, G.ASSOCIATE_DEAN, G.DEAN, G.URO]

/** The roles actually granting something on this project right now. */
const activeRoles = (ctx) =>
  [...new Set([...ctx.grants.values()].map(g => g.role))].filter(r => r !== G.STUDENT)

export default function Dashboard() {
  const { snap, me } = useApp()
  const rows = worklist(snap, me)
  const inst = resolveInstitution(me, snap)

  const actionable = rows.filter(isActionable)
  const watching = rows.filter(r => !isActionable(r))
  const holdsOffice = (me.globalRoles ?? []).some(r => OFFICES.includes(r))

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

      {can(inst, 'group.create') && (
        <div className="actions" style={{ marginBottom: 32 }}>
          <Link className="btn" to="/projects?new=1">Create a project group</Link>
          <span className="faint small">for {inst.sections.map(s => s.block).join(', ')}</span>
        </div>
      )}

      <Section title="Needs your action">
        {actionable.length === 0 && <Empty>Your queue is clear.</Empty>}
        <div className="stack">
          {actionable.map(r => (
            <article className="gate" key={r.project.id}>
              <div className="entry-head">
                <div>
                  <Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {r.project.program} · <span className="mono">{r.stage?.label}</span>
                  </div>
                </div>
                <div className="inline">
                  {activeRoles(r.ctx).map(role => <Badge key={role} tone="accent">{role}</Badge>)}
                  <Countdown deadline={r.project.revisionDeadline} />
                </div>
              </div>

              <ul className="todo">
                {r.gates.map(g => (
                  <li key={g.gate.action} className={g.blocker ? 'muted' : undefined}>
                    <strong>{g.gate.label}</strong>
                    {g.blocker
                      ? <span className="blocker-inline"> — {g.blocker}</span>
                      : <span className="ok-inline"> — ready</span>}
                  </li>
                ))}
                {r.tasks.map((t, i) => (
                  <li key={i} className={t.urgent ? 'urgent' : undefined}>{t.label}</li>
                ))}
              </ul>

              <div className="actions" style={{ marginTop: 16 }}>
                <Link className="btn" to={`/projects/${r.project.id}`}>Open workspace</Link>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Your other projects">
        {watching.length === 0 && <Empty>No other projects are visible to you at their current stage.</Empty>}
        {watching.length > 0 && (
          <table>
            <thead>
              <tr><th>Project</th><th>Access through</th><th>Stage</th><th className="tight">Updated</th></tr>
            </thead>
            <tbody>
              {watching.map(r => (
                <tr key={r.project.id}>
                  <td><Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link></td>
                  <td className="small muted" title={r.access.reason}>{r.access.via}</td>
                  <td><Badge>{r.stage?.label}</Badge></td>
                  <td className="tight small faint">{fmtDate(r.bundle.history.at(-1)?.at ?? r.project.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {holdsOffice && (
        <p className="faint small" style={{ maxWidth: '72ch' }}>
          Progressive visibility: a project appears here only while its stage involves your office.
          {can(inst, 'report.generate') && <> School-wide figures are under <Link to="/reports">Reports</Link>.</>}
        </p>
      )}
    </div>
  )
}
