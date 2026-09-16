import { useApp } from '../../state/AppContext.jsx'
import { Section, Empty, Badge, fmtDateTime } from '../ui.jsx'
import { stageLabel } from '../../domain/stages.js'

export default function HistoryPanel({ b }) {
  const { snap } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const logs = (snap.auditLogs ?? [])
    .filter(l => l.projectId === b.project.id)
    .sort((a, c) => new Date(c.at) - new Date(a.at))

  return (
    <>
      <Section title="Workflow history">
        {b.history.length === 0 && <Empty>No stage transitions recorded.</Empty>}
        {[...b.history].reverse().map(h => (
          <div className="entry" key={h.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>
                {h.fromStage ? `${stageLabel(h.fromStage)} → ` : ''}{stageLabel(h.toStage)}
              </strong>
              <span className="faint small">{fmtDateTime(h.at)}</span>
            </div>
            <div className="small muted" style={{ marginTop: 3 }}>
              {nameOf(h.actorId)} · <span className="mono">{h.action}</span>
              {h.note && <> — {h.note}</>}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Audit trail for this project"
        aside={<span className="faint small">Append-only · {logs.length} entries</span>}
      >
        {logs.length === 0 && <Empty>No audit entries.</Empty>}
        {logs.length > 0 && (
          <table>
            <thead><tr><th>Action</th><th>Actor</th><th>Entity</th><th className="tight">When</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td><Badge>{l.action}</Badge></td>
                  <td className="small">{nameOf(l.actorId)}</td>
                  <td className="mono faint" style={{ fontSize: 11.5 }}>{l.entityType}/{l.entityId}</td>
                  <td className="tight small faint">{fmtDateTime(l.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  )
}
