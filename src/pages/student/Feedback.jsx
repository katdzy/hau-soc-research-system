import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup } from '../../services/views.js'
import { respondToAnnotation } from '../../services/actions.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, Empty } from '../../components/blocks.jsx'
import { Badge, docTone, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import { ANNOTATION_STATUS as A, DECISIONS } from '../../domain/constants.js'

// Wireframe S-05, without annotation counts. Students read the reviewers'
// annotations — never drafts, never a panelist's private note before the
// verdict — and answer each one with a resolution note.

const STATUS_FILTERS = ['Open', 'Resolved', 'All']

export default function Feedback() {
  const { snap, me } = useApp()
  const [params, setParams] = useSearchParams()
  const [reviewer, setReviewer] = useState('all')
  const [status, setStatus] = useState('All')
  const b = myGroup(snap, me)
  if (!b) return <div className="page"><PageHead title="Feedback & annotations" /><Empty>You are not in a project group yet.</Empty></div>

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const visible = (a) => a.status !== A.DRAFT && (a.visibility === 'shared' || a.releasedAt)
  // Versions that have feedback, newest first.
  const withFeedback = [...b.documents]
    .filter(d => b.reviews.some(r => r.documentId === d.id) || b.annotations.some(a => a.documentId === d.id && visible(a)))
    .sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt))
  const doc = withFeedback.find(d => d.id === params.get('v')) ?? withFeedback[0]

  if (!doc) {
    return (
      <div className="page">
        <PageHead title="Feedback & annotations" lede="Reviewer comments are layered over the document. The original PDF is never altered." />
        <Empty>No feedback yet. When a reviewer sends feedback you are emailed, and it appears here.</Empty>
      </div>
    )
  }

  const notes = b.annotations.filter(a => a.documentId === doc.id && visible(a))
  const reviewers = [...new Map(notes.map(a => [a.authorId, `${nameOf(a.authorId)} (${a.authorRole})`])).entries()]
  const shown = notes
    .filter(a => reviewer === 'all' || a.authorId === reviewer)
    .filter(a => status === 'All' || (status === 'Resolved' ? a.status === A.RESOLVED : a.status !== A.RESOLVED))
  const review = b.reviews.filter(r => r.documentId === doc.id).at(-1)

  return (
    <div className="page">
      <PageHead title={`Feedback & annotations — ${doc.docType} v${doc.versionNumber}`}
        lede="Reviewer comments are layered over the document. The original PDF is never altered." />

      <div className="toolbar panel">
        <label className="picker">
          <span className="label">Version</span>
          <select value={doc.id} onChange={e => setParams({ v: e.target.value })}>
            {withFeedback.map(d => <option key={d.id} value={d.id}>{d.docType} v{d.versionNumber}</option>)}
          </select>
        </label>
        <div className="chip-group" role="group" aria-label="Reviewer">
          <span className="label">Reviewer</span>
          <button className={`chip${reviewer === 'all' ? ' is-on' : ''}`} aria-pressed={reviewer === 'all'} onClick={() => setReviewer('all')}>All</button>
          {reviewers.map(([id, label]) => (
            <button key={id} className={`chip${reviewer === id ? ' is-on' : ''}`} aria-pressed={reviewer === id} onClick={() => setReviewer(id)}>{label}</button>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="Status">
          <span className="label">Status</span>
          {STATUS_FILTERS.map(s => (
            <button key={s} className={`chip${status === s ? ' is-on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
        <span className="faint small toolbar-end">Read-only · you cannot add, edit or delete annotations</span>
      </div>

      <div className="two-col">
        <aside className="side">
          <section className="panel">
            <div className="label">Review decision</div>
            {review ? (
              <>
                <p style={{ margin: '8px 0' }}>
                  <Badge tone={review.decision === DECISIONS.MAJOR || review.decision === DECISIONS.REJECT ? 'warn' : 'ok'}>{review.decision}</Badge>
                </p>
                <p className="small muted" style={{ margin: 0 }}>{nameOf(review.reviewerId)} · {review.reviewerRole} · {fmtDate(review.createdAt)}</p>
                {review.comment && <p className="small" style={{ margin: '12px 0 0' }}>{review.comment}</p>}
              </>
            ) : <p className="small muted">Not decided yet.</p>}
          </section>
          <section className="panel">
            <div className="label">This version</div>
            <p className="small" style={{ margin: '8px 0 0' }}>{doc.fileName ?? doc.link}</p>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{doc.scope ?? doc.docType} · submitted {fmtDate(doc.submittedAt)}</p>
            <p style={{ margin: '8px 0 0' }}><Badge tone={docTone(doc.status)}>{doc.status}</Badge></p>
          </section>
          <section className="note">
            <strong>Annotation rights.</strong> Only the Adviser, Instructor 1, Panel Chair and Panel Members
            annotate. You read and reply; the Coordinator, URO and Dean act at approval level only.
          </section>
        </aside>

        <section aria-label="Annotations">
          {shown.length === 0 && <Empty>No annotations match these filters.</Empty>}
          {shown.map(a => <AnnotationCard key={a.id} a={a} b={b} nameOf={nameOf} />)}
        </section>
      </div>
    </div>
  )
}

function AnnotationCard({ a, b, nameOf }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const resolved = a.status === A.RESOLVED

  return (
    <article className="panel annotation">
      <div className="entry-head">
        <div>
          <strong className="small">{nameOf(a.authorId)}</strong> <span className="faint small">· {a.authorRole}</span>
          <div className="mono faint">{a.anchor} · {a.category}</div>
        </div>
        <Chip tone={resolved ? 'ok' : undefined}>{resolved ? 'Resolved' : 'Open'}</Chip>
      </div>
      <p className="small" style={{ margin: '8px 0 0' }}>{a.text}</p>
      {a.visibility === 'private' && <p className="faint small" style={{ margin: '4px 0 0' }}>Panel note, released after the verdict</p>}

      {a.studentResponse && (
        <div className="response small">
          <span className="label">Resolution note</span>
          <p style={{ margin: '4px 0 0' }}>{a.studentResponse}</p>
          <span className="faint">{nameOf(a.respondedBy)} · {fmtDateTime(a.respondedAt)}</span>
        </div>
      )}

      <div className="entry-foot small">
        {!resolved && !open && (
          <button className="link" onClick={() => setOpen(true)}>Add resolution note</button>
        )}
        <span className="faint">{fmtDate(a.sentAt ?? a.releasedAt ?? a.createdAt)}</span>
      </div>
      {open && (
        <div className="subform">
          <label className="field">
            <span className="label">How did you resolve it?</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <div className="actions">
            <button className="primary small" disabled={busy || !note.trim()}
              onClick={() => run(async () => { await respondToAnnotation(me, snap, b.project.id, a.id, note); setOpen(false) })}>
              Save note
            </button>
            <button className="quiet small" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <ActionError error={error} />
        </div>
      )}
    </article>
  )
}
