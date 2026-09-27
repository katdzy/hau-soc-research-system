import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { runGate } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { stageByKey, resolveNext } from '../../domain/stages.js'

const TAB_LABEL = { defense: 'Defense' }

/** The stage gate at the project's current position. */
export default function GatePanel({ b, ctx, goTo }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const stage = stageByKey(b.project.currentStage)
  if (!stage || !stage.gates.length) {
    return <p className="small muted">This project has completed its life cycle.</p>
  }

  const mine = stage.gates.filter(g => can(ctx, g.capability))

  if (!mine.length) {
    const who = [...new Set(stage.gates.map(g => g.actorHint))].join(' or ')
    const blocker = stage.gates.map(g => g.requires(b, me)).find(Boolean)
    // Holding the right role is not enough under CAAC — say which part of the
    // context rules this user out.
    const ruledOut = stage.gates
      .map(g => ctx.dormant.find(d => d.cap === g.capability))
      .find(Boolean)
    return (
      <div className="gate blocked">
        <h3>Waiting on {who}</h3>
        <p className="small muted" style={{ margin: '4px 0 0' }}>{stage.gates[0].label}.</p>
        {ruledOut && (
          <p className="blocker">
            Your {ruledOut.role} role can take this step only if {ruledOut.unmet.join('; ')} — not the case here.
          </p>
        )}
        {blocker && <p className="small faint" style={{ margin: '6px 0 0' }}>Still needed: {blocker}</p>}
      </div>
    )
  }

  return (
    <>
      {mine.map(gate => {
        const blocker = gate.requires(b, me)
        const next = resolveNext(gate, b)
        return (
          <div className={`gate ${blocker ? 'blocked' : ''}`} key={gate.action}>
            <h3>{gate.label}</h3>
            <div className="small faint" style={{ marginTop: 4 }}>
              Advances to <span className="mono">{stageByKey(next)?.label ?? next}</span>
              {' '}· granted by <span className="mono">{gate.capability}</span>
            </div>
            {blocker && <p className="blocker">{blocker}</p>}
            {!blocker && (
              <div className="actions" style={{ marginTop: 16 }}>
                {gate.handledIn
                  ? <button className="primary" onClick={() => goTo(gate.handledIn)}>
                      Continue in the {TAB_LABEL[gate.handledIn]} tab
                    </button>
                  : <button className="primary" disabled={busy}
                      onClick={() => run(() => runGate(me, snap, b.project.id, gate))}>
                      {gate.label}
                    </button>}
              </div>
            )}
            <ActionError error={error} />
          </div>
        )
      })}
    </>
  )
}
