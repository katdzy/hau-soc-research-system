import { useState } from 'react'
import { STAGES, stageIndex, courseOfStage } from '../domain/stages.js'
import { COURSES, DOC_STATUS } from '../domain/constants.js'
import { allowedDocTypes } from '../domain/caac.js'
import { fmtDate } from './ui.jsx'

/**
 * The progress trail (Figma: Trail / Step) — every stage of one course,
 * date-stamped from the workflow history. Capstone 2 stays locked until the
 * project gets there.
 */
export default function ProgressTrail({ b, history }) {
  const at = stageIndex(b.project.currentStage)
  const course = courseOfStage(b.project.currentStage)
  const [shown, setShown] = useState(course)
  const c2Open = course !== COURSES.C1
  const steps = STAGES.map((s, i) => ({ s, i })).filter(({ s }) => courseOfStage(s.key) === shown)
  const done = steps.filter(({ i }) => i < at).length
  // A returned submission at the current stage marks the step red.
  const returned = allowedDocTypes(b.project.currentStage).some(t => b.documents
    .filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0]?.status === DOC_STATUS.FOR_REVISION)
  const left = (key) => history.filter(h => h.fromStage === key && h.toStage !== key).at(-1)?.at
  const since = (key) => history.filter(h => h.toStage === key).at(-1)?.at

  return (
    <section className="section" aria-labelledby="trail-h">
      <div className="label">Progress trail</div>
      <h2 id="trail-h" className="m-0 mt-1 mb-half">{shown}{shown === course && STAGES[at] ? ` — ${STAGES[at].label}` : ''}</h2>
      <p className="small faint m-0">{done} of {steps.length} completed</p>
      <div className="seg m-0 mt-2" role="group" aria-label="Course">
        {[COURSES.C1, COURSES.C2].map(c => (
          <button key={c} type="button" aria-pressed={shown === c}
            disabled={c === COURSES.C2 && !c2Open} onClick={() => setShown(c)}>
            {c === COURSES.C2 && !c2Open ? `${c} · locked` : c}
          </button>
        ))}
      </div>
      <div className="trail-progress" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="trail">
        {steps.map(({ s, i }, n) => {
          const state = i < at ? 'done' : i === at ? (returned ? 'returned' : 'now') : 'later'
          const date = state === 'done' ? left(s.key) : state !== 'later' ? since(s.key) : null
          return (
            <li key={s.key} className={`trail-step is-${state}`} aria-current={i === at ? 'step' : undefined}>
              <span className="trail-mark" aria-hidden="true">
                {state === 'done'
                  ? <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : n + 1}
              </span>
              <div>
                <div className="trail-name">{s.label}</div>
                <div className="trail-meta">
                  {state === 'done' ? (date ? `Completed ${fmtDate(date)}` : 'Completed')
                    : state === 'later' ? 'Not started'
                      : date ? `Since ${fmtDate(date)}` : 'In progress'}
                </div>
              </div>
              <span className={`badge ${state === 'done' ? 'ok' : state === 'returned' ? 'stop' : state === 'now' ? 'warn' : ''}`}>
                {state === 'done' ? 'Done' : state === 'returned' ? 'Returned' : state === 'now' ? 'In progress' : 'Pending'}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
