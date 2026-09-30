import { STAGES, stageIndex } from '../domain/stages.js'

const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * The life cycle as one horizontal track: a segment per phase, a dot per
 * stage. Every stage's name and date sit in the dot's tooltip and accessible
 * label; the current stage and the next one are spelled out underneath.
 */
export default function StageTimeline({ current, history = [] }) {
  const at = stageIndex(current)
  const dateOf = (key) => history.filter(h => h.toStage === key).at(-1)?.at ?? null

  const phases = []
  STAGES.forEach((s, i) => {
    const last = phases.at(-1)
    if (last?.name === s.phase) last.steps.push({ s, i })
    else phases.push({ name: s.phase, steps: [{ s, i }] })
  })

  const now = STAGES[at]
  const next = STAGES[at + 1]
  const since = now && dateOf(now.key)

  return (
    <nav className="timeline" aria-label="Project life cycle">
      <ol className="tl-phases">
        {phases.map(ph => {
          const first = ph.steps[0].i
          const lastI = ph.steps.at(-1).i
          const phaseState = at > lastI ? 'done' : at >= first ? 'current' : 'todo'
          return (
            <li key={ph.name} className={`tl-phase ${phaseState}`} style={{ flexGrow: ph.steps.length }}>
              <div className="tl-phase-name">{ph.name}</div>
              <ol className="tl-track">
                {ph.steps.map(({ s, i }) => {
                  const state = i < at ? 'done' : i === at ? 'current' : 'todo'
                  const date = dateOf(s.key)
                  const text = `${s.label}${date ? ` · ${fmt(date)}` : ''}${state === 'current' ? ' (current)' : state === 'done' ? ' (done)' : ''}`
                  return (
                    <li key={s.key} className={`tl-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                      <span className="tl-dot" title={text} tabIndex={0} aria-label={text} />
                    </li>
                  )
                })}
              </ol>
            </li>
          )
        })}
      </ol>

      {now && (
        <p className="tl-now">
          <span className="tl-now-stage">{now.label}</span>
          <span className="faint">
            {since ? ` since ${fmt(since)}` : ''}
            {next ? <> · next: {next.label}</> : ' · life cycle complete'}
          </span>
          <span className="faint tl-count">Stage {at + 1} of {STAGES.length}</span>
        </p>
      )}
    </nav>
  )
}
