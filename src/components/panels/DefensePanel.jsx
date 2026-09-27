import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { stageByKey } from '../../domain/stages.js'
import { scheduleDefense, recordVerdict, defenseTypeAt } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, Countdown, verdictTone, fmtDateTime } from '../ui.jsx'
import { VERDICTS, REVISION_WINDOW_DAYS, FORMS } from '../../domain/constants.js'

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
  const [verdict, setVerdict] = useState(VERDICTS.MINOR)
  const [remarks, setRemarks] = useState('')

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
        <Section title="Record the official verdict">
          <p className="small muted">
            Recorded on {FORMS.F2004.code}. Minor revisions are due in {REVISION_WINDOW_DAYS.Minor} days
            and major revisions in {REVISION_WINDOW_DAYS.Major}. A re-defense returns the project to
            scheduling. Private panel notes are released to the group once you record the verdict.
          </p>
          <fieldset className="choice">
            <legend className="label">Verdict</legend>
            {Object.values(VERDICTS).map(v => (
              <label key={v} className="inline small">
                <input type="radio" name="verdict" value={v} checked={verdict === v} onChange={() => setVerdict(v)} />
                {v}
              </label>
            ))}
          </fieldset>
          <Field label="Required revisions">
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} />
          </Field>
          <button className="primary" disabled={busy}
            onClick={() => run(async () => {
              await recordVerdict(me, snap, b.project.id, { verdict, remarks })
              setRemarks('')
            })}>
            Record verdict
          </button>
          <ActionError error={error} />
        </Section>
      )}

      {open && !can(ctx, 'verdict.record') && (
        <p className="small muted">Only this project’s Panel Chair can record the verdict.</p>
      )}
    </>
  )
}
