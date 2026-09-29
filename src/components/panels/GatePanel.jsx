import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { runGate } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { stageByKey, resolveNext, openGates, staysAtStage } from '../../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../../domain/constants.js'

const TAB_LABEL = { defense: 'Defense', documents: 'Documents', logs: 'Weekly logs', forms: 'Forms & signatures', overview: 'Overview' }

/** The stage gate at the project's current position. */
export default function GatePanel({ b, ctx, goTo }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const stage = stageByKey(b.project.currentStage)
  const gates = openGates(stage, b)
  if (!stage || !gates.length) {
    return <p className="small muted">This project has completed its life cycle.</p>
  }

  const mine = gates.filter(g => can(ctx, g.capability))

  if (!mine.length) {
    const who = [...new Set(gates.map(g => g.actorHint))].join(' or ')
    const blocker = gates.map(g => g.requires(b, me)).find(Boolean)
    // Holding the right role is not enough under CAAC — say which part of the
    // context rules this user out.
    const ruledOut = gates
      .map(g => ctx.dormant.find(d => d.cap === g.capability))
      .find(Boolean)
    return (
      <div className="gate blocked">
        <h3>Waiting on {who}</h3>
        <p className="small muted" style={{ margin: '4px 0 0' }}>{gates[0].label}.</p>
        {ruledOut && (
          <p className="blocker">
            Your {ruledOut.role} role can take this step only if {ruledOut.unmet.join('; ')} — not the case here.
          </p>
        )}
        {gates[0].steps
          ? <StepList steps={gates[0].steps(b)} b={b} ctx={ctx} goTo={goTo} />
          : blocker && <p className="small faint" style={{ margin: '6px 0 0' }}>Still needed: {blocker}</p>}
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
              {staysAtStage(gate)
                ? 'Stays at this stage'
                : <>Advances to <span className="mono">{stageByKey(next)?.label ?? next}</span></>}
              {' '}· granted by <span className="mono">{gate.capability}</span>
            </div>
            {gate.steps
              ? <StepList steps={gate.steps(b)} b={b} ctx={ctx} goTo={goTo} />
              : blocker && <p className="blocker">{blocker}</p>}
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

/**
 * Who acts, in which order: done steps are ticked, the current one is marked
 * "Now" (with a shortcut when it is yours), later ones wait. Steps that share
 * an order can happen in any order among themselves.
 */
function StepList({ steps, b, ctx, goTo }) {
  const { snap, me } = useApp()
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name
  const peopleFor = (st) => {
    if (st.userId) return [st.userId]
    if (st.role === 'Group') return b.members.map(m => m.userId)
    if (Object.values(P).includes(st.role)) return b.assignments.filter(a => a.roleType === st.role).map(a => a.userId)
    return users.filter(u => (u.globalRoles ?? []).includes(st.role) &&
      (st.role !== G.COORDINATOR || (u.programScope ?? []).includes(b.project.program))).map(u => u.id)
  }
  const current = steps.find(st => !st.done)
  const nowOrder = current?.order
  const shared = (st) => steps.filter(x => x.order === st.order).length > 1

  return (
    <ol className="steps" aria-label="Steps, in order">
      {steps.map((st, i) => {
        const state = st.done ? 'done' : st.order === nowOrder ? 'now' : 'later'
        const ids = peopleFor(st)
        const mine = ids.includes(me.id)
        const who = st.role === 'Group'
          ? (ctx.isMember ? 'Your group' : `The group (${ids.length} students)`)
          : ids.length ? ids.map(nameOf).join(', ') : 'not assigned yet'
        return (
          <li key={i} className={`step is-${state}`}>
            <span className="step-mark" aria-hidden="true">{st.done ? '✓' : i + 1}</span>
            <div className="step-body">
              <div>
                <span className="visually-hidden">{state === 'done' ? 'Done: ' : state === 'now' ? 'Now: ' : 'Later: '}</span>
                <strong>{st.role === 'Group' ? 'Students' : st.role}</strong>
                <span className="muted"> · {who}{mine && st.role !== 'Group' && ' (you)'}</span>
                {state === 'now' && <span className="step-now">Now</span>}
              </div>
              <div className="small">
                {st.label}
                {shared(st) && !st.done && <span className="faint"> · in any order with the step{st.order === steps[i + 1]?.order ? ' below' : ' above'}</span>}
                {!st.done && st.tab && <span className="faint"> · {TAB_LABEL[st.tab]} tab</span>}
              </div>
              {state === 'now' && mine && st.tab && st.tab !== 'overview' && !st.gate && (
                <button className="small" style={{ marginTop: 8 }} onClick={() => goTo(st.tab)}>Open {TAB_LABEL[st.tab]}</button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
