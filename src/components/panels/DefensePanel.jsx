import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { stageByKey } from '../../domain/stages.js'
import { Link } from 'react-router-dom'
import { scheduleDefense, defenseTypeAt } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, Countdown, verdictTone, fmtDateTime } from '../ui.jsx'


export default function DefensePanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  const stage = b.project.currentStage
  const type = defenseTypeAt(stage)
  const gate = stageByKey(stage)?.gates[0]
  const scheduling = stage.endsWith('_SCHEDULING')
  const open = b.defenses.find(d => d.type === type && !d.verdict)

  const [when, setWhen] = useState('')
  const [venue, setVenue] = useState('SOC Conference Room, 3rd Floor')
  const [instructions, setInstructions] = useState('')

  return (
    <>
      <Section title="Defense record">
        {b.defenses.length === 0 && <Empty>No defense has been scheduled.</Empty>}
        {[...b.defenses].reverse().map(d => (
          <div className="entry" key={d.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>{d.type} Defense</strong>
              <Badge tone={verdictTone(d.verdict)}>{d.verdict ?? 'Verdict pending'}</Badge>
            </div>
            <dl className="kv" style={{ marginTop: 8 }}>
              <dt>Schedule</dt><dd>{fmtDateTime(d.scheduledAt)}</dd>
              <dt>Venue or link</dt><dd>{d.venue}</dd>
              {d.instructions && <><dt>Instructions</dt><dd className="small">{d.instructions}</dd></>}
              <dt>Published by</dt><dd>{nameOf(d.createdBy)}</dd>
              {d.verdict && <>
                <dt>Recorded by</dt><dd>{nameOf(d.recordedBy)} · {fmtDateTime(d.recordedAt)}</dd>
                <dt>Revisions</dt>
                <dd>
                  {d.revisionClass ?? 'Re-defense required'}
                  {d.revisionStatus === 'Completed' && <> · <Badge tone="ok">completed</Badge></>}
                  {d.revisionStatus === 'Pending' && <> <Countdown deadline={d.revisionDeadline} /></>}
                </dd>
              </>}
              {d.remarks && <><dt>Required revisions</dt><dd className="small">{d.remarks}</dd></>}
            </dl>
          </div>
        ))}
      </Section>

      {scheduling && can(ctx, 'defense.schedule') && (
        <Section title={`Publish the ${type.toLowerCase()} defense schedule`}>
          <div className="row">
            <Field label="Date and time">
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            </Field>
            <Field label="Venue or online link"><input value={venue} onChange={e => setVenue(e.target.value)} /></Field>
          </div>
          <Field label="Instructions for the group (optional)">
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} />
          </Field>
          <p className="small muted">
            Publishing emails the group, Adviser and panel, generates the AI summary of the latest
            {type === 'Proposal' ? ' Proposal' : ' Final'} Manuscript, and moves the project to the {type.toLowerCase()} defense.
          </p>
          <button className="primary" disabled={busy || !when || !venue}
            onClick={() => run(async () => {
              await scheduleDefense(me, snap, b.project.id, {
                scheduledAt: new Date(when).toISOString(), venue, instructions,
              })
              setWhen(''); setInstructions('')
            })}>
            Publish schedule
          </button>
          {gate?.requires(b, me) && <p className="blocker">{gate.requires(b, me)}</p>}
          <ActionError error={error} />
        </Section>
      )}

      {open && can(ctx, 'verdict.record') && (
        <p className="small"><Link to={`/verdict?p=${b.project.id}`}>Record the verdict</Link> from Verdict Recording once every panelist has submitted an evaluation.</p>
      )}

      {open && !can(ctx, 'verdict.record') && (
        <p className="small muted">Only this project’s Panel Chair can record the verdict.</p>
      )}
    </>
  )
}
