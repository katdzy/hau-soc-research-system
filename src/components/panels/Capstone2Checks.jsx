import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { stageIndex, milestoneStatus, milestoneBlocker, readinessBlocker, postDefenseBlocker } from '../../domain/stages.js'
import { confirmMilestones, confirmReadiness, confirmPostDefenseRequirements } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Badge, Field, fmtDateTime } from '../ui.jsx'
import { CAPSTONE2_MILESTONES, FORMS, PROJECT_ROLES as P } from '../../domain/constants.js'
import { FLAGS } from '../../domain/flags.js'

/**
 * Instructor 2's Capstone 2 checks, as the group, the Adviser and Instructor 2
 * see them: S6.5 milestones, S6.7 readiness for final defense (NEW-43) and,
 * after the final defense, S8.5 post-defense course requirements (NEW-44).
 * Who may confirm is decided by capability; the group and the other project
 * faculty read the status.
 */
export default function Capstone2Checks({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const at = stageIndex(b.project.currentStage)
  // For the group and the project's own faculty; an office opening the project
  // for its own step (URO, Dean, AD) does not need Instructor 2's course checks.
  if (at < stageIndex('IMPLEMENTATION') || (!ctx.isMember && !ctx.projectRoles.length)) return null

  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id
  const instructors = b.assignments.filter(a => a.roleType === P.INSTRUCTOR_2).map(a => nameOf(a.userId))
  const milestones = milestoneStatus(b.project)
  const p = b.project

  const rows = [
    ...CAPSTONE2_MILESTONES.map(m => ({
      id: 'S6.5', label: `Milestone: ${m.label.toLowerCase()}`,
      done: milestones[m.key] && { at: milestones[m.key].at, by: milestones[m.key].by, note: milestones[m.key].note },
      canAct: can(ctx, 'milestone.confirm') && !milestoneBlocker(b, m.key),
      act: (note) => confirmMilestones(me, snap, p.id, m.key, note),
    })),
    ...(FLAGS.I2_READINESS_CHECK === 'own-step' ? [{
      id: 'S6.7', label: 'Ready for final defense',
      hint: `Checked with the Adviser. The Adviser can submit ${FORMS.F2005.code} once this is confirmed.`,
      done: p.readinessConfirmedAt && { at: p.readinessConfirmedAt, by: p.readinessConfirmedBy, note: p.readinessNote },
      waiting: can(ctx, 'readiness.confirm') && !p.readinessConfirmedAt ? readinessBlocker(b) : null,
      canAct: can(ctx, 'readiness.confirm') && !readinessBlocker(b),
      act: (note) => confirmReadiness(me, snap, p.id, note),
    }] : []),
    ...(at >= stageIndex('FINAL_REVISION') ? [{
      id: 'S8.5', label: 'Post-defense course requirements',
      done: p.postDefenseConfirmedAt && { at: p.postDefenseConfirmedAt, by: p.postDefenseConfirmedBy, note: p.postDefenseNote },
      waiting: can(ctx, 'requirements.confirm') && !p.postDefenseConfirmedAt ? postDefenseBlocker(b) : null,
      canAct: can(ctx, 'requirements.confirm') && !postDefenseBlocker(b),
      act: (note) => confirmPostDefenseRequirements(me, snap, p.id, note),
    }] : []),
  ]

  return (
    <Section title="Capstone 2 checks" aside={<span className="faint small">Instructor 2 · {instructors.join(', ') || 'not assigned'}</span>}>
      {rows.map(r => <CheckRow key={r.label} r={r} busy={busy} run={run} nameOf={nameOf} />)}
      <ActionError error={error} />
    </Section>
  )
}

function CheckRow({ r, busy, run, nameOf }) {
  const [note, setNote] = useState('')
  return (
    <div className="entry">
      <div className="entry-head">
        <span><span className="mono faint small">{r.id}</span> <strong style={{ fontSize: 13 }}>{r.label}</strong></span>
        <Badge tone={r.done ? 'ok' : 'neutral'}>{r.done ? 'Confirmed' : 'Not yet'}</Badge>
      </div>
      {r.done && (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {nameOf(r.done.by)} · {fmtDateTime(r.done.at)}{r.done.note && <> — “{r.done.note}”</>}
        </p>
      )}
      {!r.done && r.hint && <p className="small faint" style={{ margin: '4px 0 0' }}>{r.hint}</p>}
      {r.waiting && <p className="small faint" style={{ margin: '4px 0 0' }}>{r.waiting}</p>}
      {r.canAct && (
        <div className="row inline-form">
          <Field label="Note (optional)">
            <input value={note} onChange={e => setNote(e.target.value)} aria-label={`Note on ${r.label.toLowerCase()} (optional)`} />
          </Field>
          <div className="inline-form-action">
            <button className="primary" disabled={busy} aria-label={`Confirm ${r.label.toLowerCase()}`}
              onClick={() => run(() => r.act(note))}>Confirm</button>
          </div>
        </div>
      )}
    </div>
  )
}
