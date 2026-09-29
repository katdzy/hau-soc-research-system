import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { STAGES, stageByKey, stageIndex, openGates, defenseNotHeld, verdictCorrectionBlocker } from '../../domain/stages.js'
import { scheduleDefense, recordVerdict, correctVerdict, defenseTypeAt } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, Countdown, verdictTone, fmtDateTime } from '../ui.jsx'
import { VERDICTS, FORMS } from '../../domain/constants.js'
import { FLAGS } from '../../domain/flags.js'
import { revisionDaysOf } from '../../domain/settings.js'

export default function DefensePanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const days = revisionDaysOf(snap)

  const stage = b.project.currentStage
  const type = defenseTypeAt(stage)
  const gate = stageByKey(stage)?.gates[0]
  const scheduling = stage.endsWith('_SCHEDULING')
  const open = b.defenses.find(d => d.type === type && !d.verdict)

  const [when, setWhen] = useState('')
  const [venue, setVenue] = useState('SOC Conference Room, 3rd Floor')
  const [instructions, setInstructions] = useState('')
  // NEW-42: the last verdict this Chair may still correct.
  const lastRecorded = [...b.defenses].filter(d => d.verdict).sort((x, y) => new Date(y.recordedAt) - new Date(x.recordedAt))[0]
  const corrigible = lastRecorded && can(ctx, 'verdict.correct') && !verdictCorrectionBlocker(b, lastRecorded) ? lastRecorded : null
  // T7 / S7.1 — whoever will publish the next schedule in this phase sees the
  // step ahead of time, disabled, with the steps that still come first.
  const upcoming = !scheduling && ctx.dormant.some(d => d.cap === 'defense.schedule')
    ? STAGES.slice(stageIndex(stage) + 1).find(s => s.key.endsWith('_SCHEDULING') && s.phase === stageByKey(stage)?.phase)
    : null
  const before = upcoming
    ? STAGES.slice(stageIndex(stage), stageIndex(upcoming.key)).flatMap(s => (s.key === stage ? openGates(s, b) : s.gates))
    : []

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
                {d.correctedAt && <>
                  <dt>Corrected</dt>
                  <dd className="small">{nameOf(d.correctedBy)} · {fmtDateTime(d.correctedAt)} — was “{d.previousVerdict}”: {d.correctionReason}</dd>
                </>}
                <dt>Revisions</dt>
                <dd>
                  {d.revisionClass === 'Re-defense' ? 'Changes required before the re-defense' : d.revisionClass ?? '—'}
                  {d.revisionStatus === 'Completed' && <> · <Badge tone="ok">completed</Badge></>}
                  {d.revisionStatus === 'Pending' && <> <Countdown deadline={d.revisionDeadline} /></>}
                  {/* S8.2 — the flag stays visible here until the revisions are verified. */}
                  {d.revisionStatus === 'Overdue' && <> · <Badge tone="stop">overdue</Badge> <Countdown deadline={d.revisionDeadline} /></>}
                </dd>
              </>}
              {d.remarks && <><dt>{d.verdict === VERDICTS.REDEFENSE ? 'Required changes' : 'Required revisions'}</dt><dd className="small">{d.remarks}</dd></>}
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

      {upcoming && (
        <Section title={`Publish the ${defenseTypeAt(upcoming.key).toLowerCase()} defense schedule`}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Opens at {upcoming.label}, after:
          </p>
          <ul className="todo">
            {before.map(g => <li key={g.action}>{g.label} <span className="faint">— {g.actorHint}</span></li>)}
          </ul>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="primary" disabled aria-describedby="schedule-not-yet">Publish schedule</button>
          </div>
          <p id="schedule-not-yet" className="small faint" style={{ marginTop: 8 }}>
            Not available until the project reaches {upcoming.label}.
          </p>
        </Section>
      )}

      {open && can(ctx, 'verdict.record') && (
        <Section title="Record the official verdict">
          <p className="small muted">
            Recorded on {FORMS.F2004.code}. Minor revisions are due in {days.Minor} days
            and major revisions in {days.Major}. A re-defense gives the group the required changes and
            {' '}{days[FLAGS.REDEFENSE_REVISION_DAYS]} days; once the Adviser approves the revised manuscript,
            the defense is scheduled again. Private panel notes are released to the group once you record the verdict.
          </p>
          {defenseNotHeld(open) ? (
            // NEW-40 (flag VERDICT_AFTER_SCHEDULED_TIME): the form opens after the scheduled time.
            <p className="note small" role="note">{defenseNotHeld(open)}</p>
          ) : (
            <VerdictForm busy={busy} submitLabel="Record verdict"
              onSubmit={({ verdict: v, remarks: r }) => run(() => recordVerdict(me, snap, b.project.id, { verdict: v, remarks: r }))} />
          )}
          {FLAGS.VERDICT_CORRECTION_HOURS > 0 && (
            <p className="faint small" style={{ marginTop: 8 }}>
              You can correct the verdict once, within {FLAGS.VERDICT_CORRECTION_HOURS} hours, until the group or the Adviser acts on it.
            </p>
          )}
          <ActionError error={error} />
        </Section>
      )}

      {corrigible && (
        <Section title="Correct the verdict">
          <p className="small muted">
            Recorded {fmtDateTime(corrigible.recordedAt)}. You can correct it once, until{' '}
            {fmtDateTime(new Date(new Date(corrigible.recordedAt).getTime() + FLAGS.VERDICT_CORRECTION_HOURS * 36e5).toISOString())}
            {' '}and only while nobody has acted on it. The countdown still runs from the original recording.
          </p>
          <VerdictForm busy={busy} submitLabel="Correct verdict" initial={corrigible} withReason
            onSubmit={(input) => run(() => correctVerdict(me, snap, b.project.id, { ...input, defenseId: corrigible.id }))} />
          <ActionError error={error} />
        </Section>
      )}

      {open && !can(ctx, 'verdict.record') && (
        <p className="small muted">Only this project’s Panel Chair can record the verdict.</p>
      )}
    </>
  )
}

/** The verdict and its required text; for a correction, also the reason. */
function VerdictForm({ busy, submitLabel, onSubmit, initial = null, withReason = false }) {
  const [verdict, setVerdict] = useState(initial?.verdict ?? VERDICTS.MINOR)
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')
  const [reason, setReason] = useState('')
  const ready = remarks.trim() && (!withReason || reason.trim())
  return (
    <>
      <fieldset className="choice">
        <legend className="label">Verdict</legend>
        {Object.values(VERDICTS).map(v => (
          <label key={v} className="inline small">
            <input type="radio" name={`verdict-${submitLabel}`} value={v} checked={verdict === v} onChange={() => setVerdict(v)} />
            {v}
          </label>
        ))}
      </fieldset>
      <Field label={verdict === VERDICTS.REDEFENSE ? 'Changes required before the re-defense (required)' : 'Required revisions (required)'}
        hint="Shown to the group and the Adviser, and recorded on the form.">
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} required />
      </Field>
      {withReason && (
        <Field label="Why the verdict is being corrected (required)" hint="Recorded in the audit trail and sent to the group and the Adviser.">
          <input value={reason} onChange={e => setReason(e.target.value)} required />
        </Field>
      )}
      <button className="primary" disabled={busy || !ready}
        onClick={() => onSubmit({ verdict, remarks, reason })}>
        {submitLabel}
      </button>
    </>
  )
}
