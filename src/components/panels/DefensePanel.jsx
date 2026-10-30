import { Fragment, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { STAGES, stageByKey, stageIndex, openGates, defenseNotHeld, verdictCorrectionBlocker } from '../../domain/stages.js'
import { scheduleDefense, recordVerdict, correctVerdict, defenseTypeAt } from '../../services/api.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, Countdown, verdictTone, fmtDateTime } from '../ui.jsx'
import { VERDICTS, FORMS } from '../../domain/constants.js'
import { FLAGS } from '../../domain/flags.js'
import { revisionDaysOf } from '../../domain/settings.js'
import { Act } from '../ViewOnly.jsx'
import { SignedCopyField, signedCopyReady, StoredFileLink } from '../FormFiles.jsx'
import { copiesOf } from '../../domain/forms.js'
import { PANEL_ROLES } from '../../domain/constants.js'

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
              <strong className="text-sm">{d.type} Defense</strong>
              <Badge tone={verdictTone(d.verdict)}>{d.verdict ?? 'Verdict pending'}</Badge>
            </div>
            <dl className="kv mt-1">
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
              {d.remarks && <><dt>{d.verdict === VERDICTS.REDEFENSE ? 'Required changes' : 'Required revisions'}</dt><dd className="small pre-line">{d.remarks}</dd></>}
              {/* F-03 — the Capstone Revision Form the Panel Chair uploaded, read-only. */}
              {copiesOf(b.forms.find(f => f.formType === FORMS.F2004.code && f.payload?.defenseId === d.id)).map(c => (
                <Fragment key={c.n}>
                  <dt>{FORMS.F2004.code}</dt>
                  <dd className="small">
                    <span className="mono">{c.fileName}</span> <span className="faint">· uploaded by {nameOf(c.uploadedBy)}, {fmtDateTime(c.uploadedAt)}</span>
                    <span className="inline"><StoredFileLink storagePath={c.storagePath} fileName={c.fileName} /><StoredFileLink storagePath={c.storagePath} fileName={c.fileName} download /></span>
                  </dd>
                </Fragment>
              ))}
            </dl>
          </div>
        ))}
      </Section>

      {scheduling && can(ctx, 'defense.schedule') && <Act>
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
      </Act>}

      {upcoming && <Act>
        <Section title={`Publish the ${defenseTypeAt(upcoming.key).toLowerCase()} defense schedule`}>
          <p className="small muted mt-0">
            Opens at {upcoming.label}, after:
          </p>
          <ul className="todo">
            {before.map(g => <li key={g.action}>{g.label} <span className="faint">— {g.actorHint}</span></li>)}
          </ul>
          <div className="actions mt-2">
            <button className="primary" disabled aria-describedby="schedule-not-yet">Publish schedule</button>
          </div>
          <p id="schedule-not-yet" className="small faint mt-1">
            Not available until the project reaches {upcoming.label}.
          </p>
        </Section>
      </Act>}

      {open && can(ctx, 'verdict.record') && <Act>
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
            <>
              <PanelComments b={b} nameOf={nameOf} />
              <VerdictForm busy={busy} submitLabel="Submit verdict & form" b={b} nameOf={nameOf}
                onSubmit={({ verdict: v, remarks: r, file }) => run(() => recordVerdict(me, snap, b.project.id, { verdict: v, remarks: r, file }))} />
            </>
          )}
          {FLAGS.VERDICT_CORRECTION_HOURS > 0 && (
            <p className="faint small mt-1">
              You can correct the verdict once, within {FLAGS.VERDICT_CORRECTION_HOURS} hours, until the group or the Adviser acts on it.
            </p>
          )}
          <ActionError error={error} />
        </Section>
      </Act>}

      {corrigible && <Act>
        <Section title="Correct the verdict">
          <p className="small muted">
            Recorded {fmtDateTime(corrigible.recordedAt)}. You can correct it once, until{' '}
            {fmtDateTime(new Date(new Date(corrigible.recordedAt).getTime() + FLAGS.VERDICT_CORRECTION_HOURS * 36e5).toISOString())}
            {' '}and only while nobody has acted on it. The countdown still runs from the original recording.
          </p>
          <VerdictForm busy={busy} submitLabel="Correct verdict" initial={corrigible} withReason b={b} nameOf={nameOf}
            onSubmit={(input) => run(() => correctVerdict(me, snap, b.project.id, { ...input, defenseId: corrigible.id }))} />
          <ActionError error={error} />
        </Section>
      </Act>}

      {open && !can(ctx, 'verdict.record') && (
        <p className="small muted">Only this project’s Panel Chair can record the verdict.</p>
      )}
    </>
  )
}

/**
 * M-18 — before the verdict: what each panelist left on the defense manuscript.
 * Shared comments only; private notes are their author's, and even their
 * number would leak (R12).
 */
function PanelComments({ b, nameOf }) {
  const panel = b.assignments.filter(a => PANEL_ROLES.includes(a.roleType))
  const latestIds = new Set(b.documents.filter(d => d.status !== 'Superseded').map(d => d.id))
  return (
    <div className="mb-2">
      <div className="label">Panel comments</div>
      <ul className="plain-list">
        {panel.map(a => {
          const n = b.annotations.filter(x => x.authorId === a.userId && x.visibility !== 'private' && latestIds.has(x.documentId)).length
          return (
            <li key={a.id ?? a.userId} className="small">
              <strong>{nameOf(a.userId)}</strong> <span className="faint">· {a.roleType} · {n ? `${n} shared comment${n > 1 ? 's' : ''} on the manuscript` : 'no shared comments'}</span>
            </li>
          )
        })}
      </ul>
      <p className="faint small m-0 mt-half">Read them in the Documents tab before recording the verdict.</p>
    </div>
  )
}

/**
 * The verdict, its required text and FM-2004 signed outside the system (M-19);
 * for a correction, also the reason and the corrected copy.
 */
function VerdictForm({ busy, submitLabel, onSubmit, b, nameOf, initial = null, withReason = false }) {
  const [verdict, setVerdict] = useState(initial?.verdict ?? VERDICTS.MINOR)
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')
  const [reason, setReason] = useState('')
  const [copy, setCopy] = useState(null)
  const ready = remarks.trim() && (!withReason || reason.trim()) && signedCopyReady(copy)
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
        hint="One per line. Shown to the group and the Adviser; the panel members check each one when they verify the revisions.">
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} required />
      </Field>
      {withReason && (
        <Field label="Why the verdict is being corrected (required)" hint="Recorded in the audit trail and sent to the group and the Adviser.">
          <input value={reason} onChange={e => setReason(e.target.value)} required />
        </Field>
      )}
      <div className="label mt-2">{FORMS.F2004.code} · {FORMS.F2004.name}</div>
      <SignedCopyField formType={FORMS.F2004.code} group={b.project.title} value={copy} onChange={setCopy} nameOf={nameOf}
        intro={withReason ? 'Fill in the corrected verdict; you and the proponents sign it again.' : 'Fill in the verdict and the recommendations; you and the proponents sign it.'} />
      <button className="primary mt-2" disabled={busy || !ready}
        onClick={() => onSubmit({ verdict, remarks, reason, file: copy.file })}>
        {busy ? 'Uploading…' : submitLabel}
      </button>
    </>
  )
}
