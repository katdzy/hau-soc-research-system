import { useApp } from '../../state/AppContext.jsx'
import { Section, Empty, fmtDateTime } from '../ui.jsx'
import { stageLabel } from '../../domain/stages.js'

// WORKFLOW_HISTORY: one append-only row per state change — stage transitions
// (from → to) and every other action at the stage it happened (R6b). The system-wide AUDIT_LOG is the System
// Administrator's (Audit trail page).
export default function HistoryPanel({ b }) {
  const { snap } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  return (
    <Section
      title="Workflow history"
      aside={<span className="faint small">Append-only · {b.history.length} entries</span>}
    >
      {b.history.length === 0 && <Empty>No stage transitions recorded.</Empty>}
      {[...b.history].reverse().map(h => (
        <div className="entry" key={h.id}>
          <div className="entry-head">
            <strong className="text-sm">
              {h.fromStage === h.toStage
                ? h.note || h.action
                : <>{h.fromStage ? `${stageLabel(h.fromStage)} → ` : ''}{stageLabel(h.toStage)}</>}
            </strong>
            <span className="faint small">{fmtDateTime(h.at)}</span>
          </div>
          <div className="small muted mt-half">
            {h.actorId === 'system' ? 'System' : nameOf(h.actorId)}
            {h.hat && <> · {h.hat}</>}
            {h.fromStage !== h.toStage && h.note && <> — {h.note}</>}
          </div>
        </div>
      ))}
    </Section>
  )
}
