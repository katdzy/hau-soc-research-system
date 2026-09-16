import { STAGES, stageIndex } from '../domain/stages.js'

export default function StageTimeline({ current, history = [] }) {
  const at = stageIndex(current)
  let lastPhase = null

  return (
    <div className="timeline">
      {STAGES.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'current' : 'todo'
        const entry = history.find(h => h.toStage === s.key)
        const newPhase = s.phase !== lastPhase
        lastPhase = s.phase
        return (
          <div key={s.key} className={newPhase ? 'tl-phase' : undefined}>
            {newPhase && <div className="label" style={{ marginBottom: 6 }}>{s.phase}</div>}
            <div className={`tl-step ${state}`}>
              <div className="tl-dot"><i />{i < STAGES.length - 1 && <s />}</div>
              <div className="tl-label">
                {s.label}
                {entry && <div className="faint mono" style={{ fontSize: 11 }}>
                  {new Date(entry.at).toLocaleDateString()}
                </div>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
