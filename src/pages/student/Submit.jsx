import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup, latestOf } from '../../services/views.js'
import { submitDocument, nextVersionOf } from '../../services/actions.js'
import { resolveContext, can, why, allowedDocTypes } from '../../domain/caac.js'
import { stageLabel } from '../../domain/stages.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { Field, Badge, docTone, fmtDate } from '../../components/ui.jsx'
import { PageHead, Empty } from '../../components/blocks.jsx'
import { DOC_TYPES, LINK_TYPES, MANUSCRIPT_SCOPES, ACCOUNT_STATUS } from '../../domain/constants.js'

// Wireframe S-03, without the required-documents panel. Before anything is
// submitted the student states WHICH version it is: the version number it
// will become, whether it is a chapter draft or the complete manuscript, and
// what it contains — then confirms. The number is re-checked on submit.

const MANUSCRIPTS = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT]

export default function Submit() {
  const { snap, me } = useApp()
  const navigate = useNavigate()
  const b = myGroup(snap, me)
  const ctx = b ? resolveContext(me, b) : null
  const types = b ? allowedDocTypes(b.project.currentStage) : []

  const [docType, setDocType] = useState(types[0] ?? '')
  const [file, setFile] = useState(null)
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [versionNote, setVersionNote] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { run, error, busy } = useAction()

  // Who the submission routes to: whoever can review or annotate it now.
  const routesTo = useMemo(() => {
    if (!b) return []
    const seen = new Map()
    for (const u of snap.users ?? []) {
      if (u.status !== ACCOUNT_STATUS.ACTIVE) continue
      const c = resolveContext(u, b)
      const grant = why(c, 'review.decide') ?? why(c, 'document.annotate')
      if (grant && !seen.has(grant.role)) seen.set(grant.role, u.name)
    }
    return [...seen.entries()].map(([role, name]) => `${role} (${name})`)
  }, [b, snap.users])

  if (!b) return <div className="page"><PageHead title="Submit document" /><Empty>You are not in a project group yet.</Empty></div>

  const type = types.includes(docType) ? docType : types[0]
  const isLink = LINK_TYPES.includes(type)
  const isManuscript = MANUSCRIPTS.includes(type)
  const previous = type ? latestOf(b, type) : null
  const version = type ? nextVersionOf(b, type) : 1
  const ready = type && (isLink ? link : file) && (!isManuscript || (scope && versionNote.trim())) && confirmed

  const reset = () => { setFile(null); setLink(''); setTitle(''); setScope(''); setVersionNote(''); setNotes(''); setConfirmed(false) }

  return (
    <div className="page">
      <PageHead title="Submit document"
        lede="Submissions are permanent. Each upload creates a new immutable version — nothing is overwritten or deleted." />

      {!can(ctx, 'document.submit') ? (
        <Empty title={`Nothing to submit at ${stageLabel(b.project.currentStage)}`}>
          This stage does not accept submissions from the group. Your <Link to="/">checklist</Link> shows what happens next.
        </Empty>
      ) : (
        <div className="two-col wide-left">
          <form className="panel" onSubmit={e => { e.preventDefault() }} noValidate>
            <div className="row">
              <Field label="Submission type">
                <select value={type} onChange={e => { setDocType(e.target.value); setConfirmed(false); setScope('') }}>
                  {types.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Workflow stage"><input value={stageLabel(b.project.currentStage)} readOnly /></Field>
            </div>
            <Field label="Routes to"><input value={routesTo.join(' → ') || '—'} readOnly /></Field>

            {isLink ? (
              <Field label="Video link" hint="Videos are not stored — link to where the video is hosted.">
                <input type="url" value={link} onChange={e => { setLink(e.target.value); setConfirmed(false) }} placeholder="https://" />
              </Field>
            ) : (
              <Field label="Upload file" hint="PDF only. The prototype records the file name and size; Cloud Storage holds the file in production.">
                <label className="dropzone">
                  <input type="file" accept="application/pdf,.pdf" onChange={e => { setFile(e.target.files?.[0] ?? null); setConfirmed(false) }} />
                  <span>{file ? <><strong>{file.name}</strong> · {Math.round(file.size / 1024)} KB</> : 'Choose a PDF, or drop it here'}</span>
                </label>
              </Field>
            )}

            {type === DOC_TYPES.TOPIC_PROPOSAL && (
              <Field label="Proposed title" hint="If approved and registered, this becomes the project title.">
                <input value={title} onChange={e => setTitle(e.target.value)} />
              </Field>
            )}

            {isManuscript && (
              <fieldset className="choice">
                <legend className="label">What version is this?</legend>
                {MANUSCRIPT_SCOPES.map(s => (
                  <label key={s} className="choice-card">
                    <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => { setScope(s); setConfirmed(false) }} />
                    <span>
                      <strong>{s}</strong>
                      <span className="small muted">
                        {s === 'Chapter draft'
                          ? 'Part of the manuscript, for the Adviser’s feedback.'
                          : 'Every chapter. Only a complete manuscript goes to the defense and is summarised by the AI.'}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {(isManuscript || type === DOC_TYPES.CONCEPT_PAPER) && (
              <Field label="What this version contains" hint="For example: “Chapters 1–3; adds the sampling design; answers the v2 annotations on p. 41 and 44.”">
                <textarea value={versionNote} onChange={e => { setVersionNote(e.target.value); setConfirmed(false) }} />
              </Field>
            )}
            <Field label="Notes to reviewer (optional)">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </Field>

            <div className="confirm-box">
              <p className="small" style={{ margin: 0 }}>
                You are submitting <strong>{type} v{version}</strong>
                {isManuscript && scope ? <> — {scope.toLowerCase()}</> : null}.
                {previous
                  ? <> v{previous.versionNumber} ({previous.status.toLowerCase()}) stays in the history as superseded.</>
                  : <> This is the first version of this document.</>}
              </p>
              <label className="inline small" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                I confirm this is v{version} and it cannot be changed after submitting.
              </label>
            </div>

            <div className="actions" style={{ marginTop: 16 }}>
              <button className="primary" type="button" disabled={busy || !ready}
                onClick={() => run(async () => {
                  const created = await submitDocument(me, snap, b.project.id, {
                    docType: type, title, link, fileName: file?.name, fileSize: file?.size,
                    scope, versionNote, notesToReviewer: notes, expectedVersion: version,
                  })
                  reset()
                  navigate(`/versions?highlight=${created.id}`)
                })}>
                Submit v{version} for review
              </button>
            </div>
            <ActionError error={error} />
          </form>

          <aside className="side">
            {previous && (
              <section className="panel">
                <div className="label">Latest {type}</div>
                <p style={{ margin: '8px 0 4px' }}><strong>v{previous.versionNumber}</strong> · {fmtDate(previous.submittedAt)}</p>
                <Badge tone={docTone(previous.status)}>{previous.status}</Badge>
                {previous.versionNote && <p className="small muted" style={{ margin: '8px 0 0' }}>{previous.versionNote}</p>}
                <p className="small" style={{ margin: '12px 0 0' }}><Link to={`/feedback?v=${previous.id}`}>See its feedback</Link></p>
              </section>
            )}
            <section className="note">
              <strong>Submissions are immutable.</strong> Once submitted, a file cannot be replaced or
              deleted. Revisions go in as a new version and every version stays in the history.
            </section>
            <p className="small faint">
              AI summaries are generated only for a complete manuscript, at the proposal and final defense milestones.
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
