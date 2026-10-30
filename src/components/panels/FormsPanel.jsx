import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { signForm, holdRevisions } from '../../services/api.js'
import { canSign, copiesOf, lineMethod } from '../../domain/forms.js'
import { FORMS, PROJECT_ROLES as P } from '../../domain/constants.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDateTime } from '../ui.jsx'
import { Act } from '../ViewOnly.jsx'
import { BlankFormLink, CopyRow, SignedCopyField, signedCopyReady } from '../FormFiles.jsx'

// Forms are issued by workflow events, never by hand: FM-AAC-SOC-2004 when the
// Panel Chair records a verdict, FM-AAC-SOC-2005 when the Adviser recommends
// the group, and the Approval Sheet when final revisions close. Nothing is
// filled in or signed here: each signatory downloads the latest copy, signs it
// outside the system and uploads it, or — for the lines recorded in the system
// — confirms (lineMethod). Uploaded copies are read-only (F-02, F-04, F-07, F-09).

const STATUS_TONE = { Signed: 'ok', 'Not Recommended': 'stop', Void: 'neutral' }

export default function FormsPanel({ b }) {
  const { snap, me } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const forms = [...b.forms].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))

  return (
    <Section title="Institutional forms" aside={<span className="faint small">Signed outside the system and uploaded</span>}>
      {forms.length === 0 && <Empty>No forms yet. They are issued automatically as the workflow reaches them.</Empty>}
      {forms.map(f => <FormEntry key={f.id} f={f} b={b} me={me} snap={snap} nameOf={nameOf} />)}
    </Section>
  )
}

function FormEntry({ f, b, me, snap, nameOf }) {
  const check = canSign(f, me, b)
  const myLine = f.signatories.find(s => s.userId === me.id && !s.signedAt)
  const copies = copiesOf(f)

  return (
    <div className="entry form-entry">
      <div className="entry-head">
        <div>
          <strong className="text-sm">{f.formType}</strong>
          {f.name !== f.formType && <div className="faint small">{f.name}</div>}
        </div>
        <Badge tone={STATUS_TONE[f.status] ?? 'warn'}>{f.status}</Badge>
      </div>

      {f.payload?.verdict && (
        <p className="small muted m-0 mt-1">
          {f.payload.defenseType} defense · {f.payload.verdict}
          {f.payload.remarks && <> — {f.payload.remarks}</>}
        </p>
      )}
      {f.payload?.outcome && (
        <p className="small muted m-0 mt-1">
          Outcome: {f.payload.outcome}{f.payload.reasons && <> — {f.payload.reasons}</>}
        </p>
      )}

      <table className="mt-2 cards">
        <thead><tr><th className="tight">Step</th><th>Role</th><th>Signatory</th><th className="tight">How</th><th className="tight">Done</th></tr></thead>
        <tbody>
          {[...f.signatories].sort((x, y) => x.order - y.order).map((s, i) => (
            <tr key={i}>
              <td className="tight mono faint" data-label="Step">{s.order}</td>
              <td className="small card-title">{s.final ? `${s.role} (final copy)` : s.role}</td>
              <td className="small muted" data-label="Signatory">{s.name ?? nameOf(s.userId)}</td>
              <td className="tight small faint" data-label="How">
                {lineMethod(f, s) === 'upload' ? 'Uploads signed copy' : f.formType === FORMS.F2004.code ? 'Confirms in the system' : 'Clears in the system'}
              </td>
              <td className="tight small card-status">
                {s.signedAt
                  ? <span className="mono signed">{fmtDateTime(s.signedAt)}</span>
                  : s.heldAt
                    ? <span className="faint">not confirmed yet</span>
                    : <span className="faint">pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {copies.length > 0 && (
        <div className="copy-list" aria-label={`Uploaded copies of ${f.formType}`}>
          {copies.map(c => <CopyRow key={c.n} copy={c} nameOf={nameOf} />)}
        </div>
      )}
      {copies.length === 0 && f.signatories.some(s => s.signedAt && lineMethod(f, s) === 'upload') && (
        <p className="faint small mt-1">Signed before uploads were recorded — no copy is stored for this form.</p>
      )}

      {check.ok && <Act>
        {check.method === 'upload'
          ? <UploadTurn f={f} b={b} me={me} snap={snap} line={check.line} nameOf={nameOf} />
          : check.line.role === P.PANEL_MEMBER
            ? <ConfirmRevisions f={f} b={b} me={me} snap={snap} />
            : <ConfirmTurn f={f} b={b} me={me} snap={snap} line={check.line} />}
      </Act>}
      {!check.ok && myLine && check.reason && <p className="small faint mt-2">{check.reason}</p>}
      {!check.ok && !myLine && f.status !== 'Signed' && f.status !== 'Void' && (
        <div className="inline mt-2"><BlankFormLink code={f.formType} className="btn small">Blank {f.formType}</BlankFormLink></div>
      )}
    </div>
  )
}

/** E-00/E-01 — the signatory's turn on an 'upload' line. */
function UploadTurn({ f, b, me, snap, line, nameOf }) {
  const { run, error, busy } = useAction()
  const [copy, setCopy] = useState(null)
  return (
    <div className="subform">
      <h4 className="m-0">{line.final ? `Upload the final ${f.formType}` : `Your turn: sign as ${line.role}`}</h4>
      <SignedCopyField formType={f.formType} form={f} group={b.project.title} value={copy} onChange={setCopy} nameOf={nameOf}
        intro={line.final ? 'Collect the panel members’ signatures on the same copy.' : undefined} />
      <div className="actions mt-2">
        <button className="primary" disabled={busy || !signedCopyReady(copy)}
          onClick={() => run(async () => {
            await signForm(me, snap, b.project.id, f.id, { file: copy.file, formType: f.formType })
            setCopy(null)
          })}>
          {busy ? 'Uploading…' : 'Submit signed copy'}
        </button>
        <span className="faint small">The upload becomes the official copy. The next signatory is emailed.</span>
      </div>
      <ActionError error={error} />
    </div>
  )
}

/** A 'confirm' line other than a panel member's: the Adviser verifies the revisions. */
function ConfirmTurn({ f, b, me, snap, line }) {
  const { run, error, busy } = useAction()
  return (
    <div className="subform">
      <p className="small muted m-0">
        You checked the revised manuscript. Verifying records it in the system; the panel members confirm next.
      </p>
      <div className="actions mt-2">
        <button className="primary" disabled={busy} onClick={() => run(() => signForm(me, snap, b.project.id, f.id))}>
          Verify the revisions as {line.role}
        </button>
      </div>
      <ActionError error={error} />
    </div>
  )
}

/** The verdict's required revisions, one per line or numbered ("1. … 2. …"). */
const requiredRevisions = (remarks = '') => {
  const lines = remarks.split(/\n+/).map(x => x.trim()).filter(Boolean)
  const parts = lines.length > 1 ? lines : remarks.split(/(?:^|\s)\d+[.)]\s+/)
  return parts.map(x => x.replace(/^[-•\s]+/, '').trim()).filter(Boolean)
}

/**
 * M-16/M-17 — a panel member checks each required revision, then confirms, or
 * records "not yet" with a note only they can read.
 */
function ConfirmRevisions({ f, b, me, snap }) {
  const { run, error, busy } = useAction()
  const items = requiredRevisions(f.payload?.remarks)
  const [marks, setMarks] = useState(() => items.map(() => null))
  const [note, setNote] = useState('')
  const all = marks.every(m => m === true)
  const decided = marks.every(m => m !== null)
  return (
    <div className="subform">
      <h4 className="m-0">Verify the revisions</h4>
      <p className="small muted m-0 mt-half">Check each required revision against the latest revised manuscript (Documents tab).</p>
      <ul className="plain-list mt-1">
        {items.map((item, i) => (
          <li key={i} className="inline small">
            <span>{item}</span>
            <label className="inline"><input type="radio" name={`rev-${f.id}-${i}`} checked={marks[i] === true}
              onChange={() => setMarks(m => m.map((x, j) => (j === i ? true : x)))} /> Addressed</label>
            <label className="inline"><input type="radio" name={`rev-${f.id}-${i}`} checked={marks[i] === false}
              onChange={() => setMarks(m => m.map((x, j) => (j === i ? false : x)))} /> Not addressed</label>
          </li>
        ))}
      </ul>
      {decided && !all && (
        <Field label="Private note (only you can see it)" hint="The Panel Chair sees only that you have not confirmed yet.">
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="What is still missing" />
        </Field>
      )}
      <div className="actions mt-2">
        {all
          ? <button className="primary" disabled={busy} onClick={() => run(() => signForm(me, snap, b.project.id, f.id))}>
              Confirm revisions
            </button>
          : <button disabled={busy || !decided} onClick={() => run(async () => { await holdRevisions(me, snap, b.project.id, f.id, { note }); setNote('') })}>
              Save as not yet confirmed
            </button>}
        <span className="faint small">You sign {FORMS.F2004.code} outside the system; the Panel Chair uploads the signed copy.</span>
      </div>
      <ActionError error={error} />
    </div>
  )
}
