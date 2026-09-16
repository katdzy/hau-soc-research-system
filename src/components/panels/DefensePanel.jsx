import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/cac.js'
import { scheduleDefense, recordVerdict } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, Countdown, verdictTone, fmtDateTime } from '../ui.jsx'
import { VERDICTS, REVISION_WINDOW_DAYS } from '../../domain/constants.js'

const defenseTypeFor = (stage) =>
  stage.startsWith('FINAL') || stage === 'IMPLEMENTATION' ? 'Final' : 'Proposal'

export default function DefensePanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  const type = defenseTypeFor(b.project.currentStage)
  const [when, setWhen] = useState('')
  const [venue, setVenue] = useState('SOC Conference Room, 3rd Floor PGN Building')
  const [verdict, setVerdict] = useState(VERDICTS.PASSED_MINOR)
  const [remarks, setRemarks] = useState('')

  const openDefense = b.defenses.find(d => !d.verdict)

  return (
    <>
      <Section title="Defense record">
        {b.defenses.length === 0 && <Empty>No defense has been scheduled.</Empty>}
        {b.defenses.map(d => (
          <div className="entry" key={d.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>{d.type} Defense</strong>
              <Badge tone={verdictTone(d.verdict)}>{d.verdict ?? 'Verdict pending'}</Badge>
            </div>
            <dl className="kv" style={{ marginTop: 8 }}>
              <dt>Scheduled</dt><dd>{fmtDateTime(d.scheduledAt)}</dd>
              <dt>Venue</dt><dd>{d.venue}</dd>
              <dt>Scheduled by</dt><dd>{nameOf(d.createdBy)}</dd>
              {d.verdict && <>
                <dt>Recorded by</dt><dd>{nameOf(d.recordedBy)} · {fmtDateTime(d.recordedAt)}</dd>
                <dt>Revision class</dt>
                <dd>{d.revisionClass ?? 'None'} {d.revisionDeadline && <Countdown deadline={d.revisionDeadline} />}</dd>
              </>}
              {d.remarks && <><dt>Panel remarks</dt><dd className="small">{d.remarks}</dd></>}
            </dl>
          </div>
        ))}
      </Section>

      {can(ctx, 'defense.schedule') && (
        <Section title={`Schedule the ${type.toLowerCase()} defense`}>
          <div className="row">
            <Field label="Date and time">
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            </Field>
            <Field label="Venue"><input value={venue} onChange={e => setVenue(e.target.value)} /></Field>
          </div>
          <button className="primary" disabled={busy || !when}
            onClick={() => run(async () => {
              await scheduleDefense(me, snap, b.project.id, {
                type, scheduledAt: new Date(when).toISOString(), venue,
              })
              setWhen('')
            })}>
            Schedule and notify the panel
          </button>
          <ActionError error={error} />
        </Section>
      )}

      {can(ctx, 'verdict.record') && openDefense && (
        <Section title="Record the official verdict">
          <div className="note" style={{ marginBottom: 14 }}>
            Only the Panel Chair may record the verdict. Recording it starts the revision
            countdown ({REVISION_WINDOW_DAYS.Minor} days for minor, {REVISION_WINDOW_DAYS.Major} for major)
            and generates the revision form for panel signatures.
          </div>
          <Field label="Verdict">
            <select value={verdict} onChange={e => setVerdict(e.target.value)}>
              {Object.values(VERDICTS).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Panel remarks and required revisions">
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} />
          </Field>
          <button className="primary" disabled={busy}
            onClick={() => run(async () => {
              await recordVerdict(me, snap, b.project.id, openDefense.id, { verdict, remarks })
              setRemarks('')
            })}>
            Record verdict
          </button>
          <ActionError error={error} />
        </Section>
      )}

      {!can(ctx, 'verdict.record') && openDefense && (
        <p className="small muted">
          The verdict for this defense can only be recorded by the Panel Chair.
        </p>
      )}
    </>
  )
}
