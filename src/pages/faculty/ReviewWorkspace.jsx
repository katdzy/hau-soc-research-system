import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { bundle } from '../../services/core.js'
import { addAnnotation, discardDraftAnnotation, sendFeedback } from '../../services/actions.js'
import { resolveContext, can, why } from '../../domain/caac.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, EmailPreview, Empty } from '../../components/blocks.jsx'
import { Field, Badge, docTone, fmtDate } from '../../components/ui.jsx'
import { DECISIONS, DOC_STATUS, ANNOTATION_CATEGORIES, ANNOTATION_STATUS as A } from '../../domain/constants.js'

// Wireframe S-08. The reviewer annotates a version; each comment is a draft
// only they can see. "Send feedback" releases every draft together with the
// review decision and emails the group ONCE — that email is how a student
// learns their manuscript came back with annotations. Panel members use the
// same workspace, but their notes are private until the verdict and they
// record no decision.

const DECISION_HELP = {
  [DECISIONS.APPROVE]: 'Accept this version as it is.',
  [DECISIONS.MINOR]: 'Accept, with small changes for the next version.',
  [DECISIONS.MAJOR]: 'Return it. The group revises and submits a new version.',
  [DECISIONS.REJECT]: 'Reject this version outright.',
  [DECISIONS.ENDORSE]: 'Approve and endorse to the next stage.',
}

export default function ReviewWorkspace() {
  const { docId } = useParams()
  const { snap, me } = useApp()
  const navigate = useNavigate()
  const doc = (snap.documents ?? []).find(d => d.id === docId)
  const b = doc ? bundle(snap, doc.projectId) : null
  const ctx = b ? resolveContext(me, b) : null

  const [anchor, setAnchor] = useState('')
  const [category, setCategory] = useState(ANNOTATION_CATEGORIES[0])
  const [text, setText] = useState('')
  const [decision, setDecision] = useState('')
  const [summary, setSummary] = useState('')
  const [sent, setSent] = useState(null)
  const [comparePrev, setComparePrev] = useState(false)
  const note = useAction()
  const send = useAction()

  if (!doc || !b || !can(ctx, 'project.view')) {
    return <div className="page"><Empty title="Not available">This version is not open to you in your current context.</Empty></div>
  }

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const siblings = b.documents.filter(d => d.docType === doc.docType).sort((x, y) => y.versionNumber - x.versionNumber)
  const previous = siblings.find(d => d.versionNumber === doc.versionNumber - 1)
  const isCurrent = ![DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)
  const privateNotes = can(ctx, 'annotation.private')
  // Reviewer drafts go out with a decision, so they belong on an undecided version.
  const canAnnotate = can(ctx, 'document.annotate') && isCurrent && (privateNotes || doc.status === DOC_STATUS.SUBMITTED)
  const canDecide = can(ctx, 'review.decide') && isCurrent && doc.status === DOC_STATUS.SUBMITTED
  const role = why(ctx, 'document.annotate')?.role ?? why(ctx, 'review.decide')?.role

  // What this reviewer may see: their own notes (drafts included), sent shared
  // notes, and private notes only once released.
  const visible = (a) => a.authorId === me.id || (a.status !== A.DRAFT && (a.visibility === 'shared' || a.releasedAt))
  const notes = b.annotations.filter(a => a.documentId === doc.id && visible(a))
  const drafts = notes.filter(a => a.authorId === me.id && a.status === A.DRAFT)
  const prevNotes = previous ? b.annotations.filter(a => a.documentId === previous.id && visible(a)) : []

  return (
    <div className="page page-wide">
      <PageHead
        eyebrow={`${b.project.groupName} · ${role ?? 'Read only'}`}
        title={`Review ${doc.docType.toLowerCase()} — ${b.project.groupName}, v${doc.versionNumber}`}
        lede="Annotations are layered, never applied to the source file. The student’s upload cannot be altered or deleted."
      />

      <div className="toolbar panel">
        <label className="picker">
          <span className="label">Version</span>
          <select value={doc.id} onChange={e => navigate(`/review/${e.target.value}`)}>
            {siblings.map(d => <option key={d.id} value={d.id}>v{d.versionNumber}{d.id === siblings[0].id ? ' (current)' : ''}</option>)}
          </select>
        </label>
        {previous && (
          <label className="inline small">
            <input type="checkbox" checked={comparePrev} onChange={e => setComparePrev(e.target.checked)} />
            Compare with v{previous.versionNumber}
          </label>
        )}
        <span className="toolbar-end inline">
          {canAnnotate && <Chip>{privateNotes ? 'Private notes · logged to audit trail' : 'Drafts saved · logged to audit trail'}</Chip>}
          {canDecide && (
            <button className="primary" disabled={send.busy || !decision}
              onClick={() => send.run(async () => {
                const { email } = await sendFeedback(me, snap, b.project.id, doc.id, { decision, summary })
                setSent(email); setSummary(''); setDecision('')
              })}>
              Send feedback
            </button>
          )}
        </span>
      </div>
      <ActionError error={send.error} />
      {sent && (
        <EmailPreview email={sent}
          recipients={sent.to.map(nameOf).join(', ')}
          onClose={() => setSent(null)} />
      )}

      <div className="review-grid">
        <section className="panel doc-sheet" aria-label="Document">
          <div className="doc-sheet-head">
            <span className="mono">{doc.fileName ?? doc.link}</span>
            <Badge tone={docTone(doc.status)}>{doc.status}</Badge>
          </div>
          <dl className="kv kv-tight">
            <dt>Version</dt><dd>v{doc.versionNumber}{doc.scope ? ` · ${doc.scope}` : ''}</dd>
            <dt>Submitted</dt><dd>{nameOf(doc.submittedBy)} · {fmtDate(doc.submittedAt)}</dd>
            {doc.versionNote && <><dt>Contains</dt><dd className="small">{doc.versionNote}</dd></>}
            {doc.notesToReviewer && <><dt>Note to you</dt><dd className="small">{doc.notesToReviewer}</dd></>}
          </dl>
          {doc.abstract && <p className="small muted" style={{ marginTop: 16 }}>{doc.abstract}</p>}
          <p className="faint small" style={{ marginTop: 16 }}>
            The PDF viewer with highlight-and-comment replaces this panel in the Firebase build. Give each comment a page and section below.
          </p>

          {canAnnotate && (
            <div className="subform">
              <div className="label">New comment</div>
              <div className="row">
                <Field label="Location"><input value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="p. 12 · Research design" /></Field>
                <Field label="Category">
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    {ANNOTATION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Comment"><textarea value={text} onChange={e => setText(e.target.value)} /></Field>
              <button disabled={note.busy || !text.trim()}
                onClick={() => note.run(async () => {
                  await addAnnotation(me, snap, b.project.id, doc.id, { anchor, category, text })
                  setAnchor(''); setText('')
                })}>
                {privateNotes ? 'Save private note' : 'Add to draft feedback'}
              </button>
              <ActionError error={note.error} />
            </div>
          )}

          {comparePrev && previous && (
            <div className="subform">
              <div className="label">v{previous.versionNumber} — {fmtDate(previous.submittedAt)}</div>
              <p className="small muted">{previous.versionNote || 'No description was given.'}</p>
              <ul className="plain-list small">
                {prevNotes.map(a => (
                  <li key={a.id}>{a.anchor} · <Chip tone={a.status === A.RESOLVED ? 'ok' : undefined}>{a.status}</Chip>
                    {a.studentResponse && <span className="muted"> — “{a.studentResponse}”</span>}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="side">
          {canDecide && (
            <section className="panel">
              <div className="panel-head">
                <h2>Review decision</h2>
                <span className="faint small">Recorded with your name, role and time</span>
              </div>
              <fieldset className="choice">
                <legend className="sr-only">Decision</legend>
                {Object.values(DECISIONS).map(d => (
                  <label key={d} className="choice-card">
                    <input type="radio" name="decision" checked={decision === d} onChange={() => setDecision(d)} />
                    <span><strong>{d}</strong><span className="small muted">{DECISION_HELP[d]}</span></span>
                  </label>
                ))}
              </fieldset>
              <Field label="Summary of required changes">
                <textarea value={summary} onChange={e => setSummary(e.target.value)} />
              </Field>
              <p className="small muted" style={{ margin: 0 }}>
                {drafts.length
                  ? 'Send feedback releases your draft annotations below and emails the group once, listing each one.'
                  : 'Send feedback emails the group your decision and summary.'}
              </p>
            </section>
          )}
          {privateNotes && (
            <section className="note">
              <strong>Your notes are private.</strong> Other panelists and the group do not see them until the
              Panel Chair records the verdict. Only the Chair records the verdict.
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h2>Annotations on v{doc.versionNumber}</h2></div>
            {notes.length === 0 && <p className="small muted">None yet.</p>}
            <ul className="note-list">
              {notes.map(a => (
                <li key={a.id}>
                  <div className="entry-head">
                    <span className="small"><strong>{a.anchor}</strong> <span className="faint">· {a.category}</span></span>
                    <Chip tone={a.status === A.RESOLVED ? 'ok' : a.status === A.DRAFT ? 'warn' : undefined}>
                      {a.visibility === 'private' && !a.releasedAt ? 'Private' : a.status}
                    </Chip>
                  </div>
                  <p className="small" style={{ margin: '4px 0 0' }}>{a.text}</p>
                  <div className="faint small">{nameOf(a.authorId)} · {a.authorRole}</div>
                  {a.studentResponse && <p className="small response">Group: “{a.studentResponse}”</p>}
                  {a.status === A.DRAFT && a.authorId === me.id && (
                    <button className="quiet small" onClick={() => note.run(() => discardDraftAnnotation(me, snap, b.project.id, a.id))}>
                      Discard draft
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <p className="small"><Link to={`/projects/${b.project.id}`}>Open the full project workspace</Link></p>
        </aside>
      </div>
    </div>
  )
}
