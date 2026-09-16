import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/cac.js'
import { runGate } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { stageByKey, resolveNext } from '../../domain/stages.js'

/** The stage gate(s) available at the project's current position. */
export default function GatePanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const stage = stageByKey(b.project.currentStage)
  if (!stage || !stage.gates.length) return null

  const visible = stage.gates.filter(g => can(ctx, g.capability))

  if (!visible.length) {
    const hint = [...new Set(stage.gates.map(g => g.actorHint))].join(' or ')
    return (
      <div className="gate blocked">
        <h3>Waiting on {hint}</h3>
        <p className="small muted" style={{ margin: '4px 0 0' }}>{stage.blurb}</p>
      </div>
    )
  }

  return (
    <>
      {visible.map(gate => {
        const blocker = gate.requires(b)
        const next = resolveNext(gate, b)
        return (
          <div className={`gate ${blocker ? 'blocked' : ''}`} key={gate.action}>
            <h3>{gate.label}</h3>
            <p className="small muted" style={{ margin: '2px 0 0' }}>{stage.blurb}</p>
            <div className="small faint" style={{ marginTop: 6 }}>
              Advances to <span className="mono">{stageByKey(next)?.label ?? next}</span> · requires <span className="mono">{gate.capability}</span>
            </div>
            {blocker
              ? <p className="blocker">{blocker}</p>
              : (
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="primary" disabled={busy}
                    onClick={() => run(() => runGate(me, snap, b.project.id, gate))}>
                    {gate.label}
                  </button>
                </div>
              )}
            <ActionError error={error} />
          </div>
        )
      })}
    </>
  )
}
