import { useMemo, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can, why, allowedDocTypes } from '../../domain/caac.js'
import { submitDocument, addAnnotation, submitReview } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, docTone, fmtDateTime, fmtSize } from '../ui.jsx'
import {
  DECISIONS, DOC_STATUS, DOC_TYPES, ANNOTATION_CATEGORIES, REVIEWABLE_TYPES, LINK_TYPES,
} from '../../domain/constants.js'

const SUMMARISED = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT]

export default function DocumentsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  // Without `document.history` (the panel), only the current version of each
  // document type is shown; older versions stay stored but out of view.
  const fullHistory = can(ctx, 'document.history')
  const versions = useMemo(() => fullHistory
    ? b.documents
    : b.documents.filter(d => d.status !== DOC_STATUS.SUPERSEDED), [b.documents, fullHistory])

  const [selected, setSelected] = useState(versions[0]?.id ?? null)
  const doc = versions.find(d => d.id === selected) ?? null
  const uploadable = allowedDocTypes(b.project.currentStage)

  // Private panel notes are withheld from everyone but their author until the
  // Panel Chair records the verdict (`releasedAt`).
  const docAnnotations = doc ? b.annotations.filter(a => a.documentId === doc.id) : []
  const visibleAnnotations = docAnnotations.filter(a =>
    a.visibility !== 'private' || a.authorId === me.id || a.releasedAt)
  const hiddenCount = docAnnotations.length - visibleAnnotations.length

  const summary = doc ? b.aiSummaries.find(s => s.documentId === doc.id) : null
  const reviews = doc ? b.reviews.filter(r => r.documentId === doc.id) : []
  const reviewable = doc && REVIEWABLE_TYPES.includes(doc.docType)
    && ![DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)

  return (
    <div className="docs">
      <div>
        <Section title="Versions">
          {!fullHistory && b.documents.length > versions.length && (
            <p className="faint small">Panel members see the current version of each document only.</p>
          )}
          {versions.length === 0 && <Empty>Nothing submitted yet.</Empty>}
          <ul className="version-list">
            {versions.map(d => (
              <li key={d.id}>
                <button className={`version${d.id === selected ? ' is-selected' : ''}`}
                  aria-pressed={d.id === selected} onClick={() => setSelected(d.id)}>
                  <span className="version-head">
                    <strong>{d.docType}</strong>
                    <span className="mono faint">v{d.versionNumber}</span>
                  </span>
                  <span className="inline" style={{ marginTop: 4 }}>
                    <Badge tone={docTone(d.status)}>{d.status}</Badge>
                    {d.milestone && <Badge tone="info">{d.milestone}</Badge>}
                  </span>
                  <span className="faint small">{nameOf(d.submittedBy)} · {fmtDateTime(d.submittedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        {can(ctx, 'document.submit') && (
          <Section title="New submission">
            <UploadForm key={b.project.currentStage} types={uploadable} b={b} onDone={setSelected} />
          </Section>
        )}
      </div>

      <div>
        {!doc && <Empty>Select a version to see it.</Empty>}
        {doc && (
          <>
            <Section title={`${doc.docType} — version ${doc.versionNumber}`}>
              <dl className="kv">
                {doc.link
                  ? <><dt>Link</dt><dd><a href={doc.link} target="_blank" rel="noreferrer noopener">{doc.link}</a></dd></>
                  : <><dt>File</dt><dd className="mono">{doc.fileName} <span className="faint">({fmtSize(doc.fileSize)})</span></dd></>}
                <dt>Submitted</dt><dd>{nameOf(doc.submittedBy)} · {fmtDateTime(doc.submittedAt)}</dd>
                <dt>Status</dt><dd><Badge tone={docTone(doc.status)}>{doc.status}</Badge></dd>
                {fullHistory && <><dt>Supersedes</dt><dd className="mono faint">{doc.supersedes ?? 'first version'}</dd></>}
              </dl>
              {doc.abstract && (
                <>
                  <div className="label" style={{ margin: '16px 0 4px' }}>Abstract as submitted</div>
                  <p className="small muted" style={{ maxWidth: '68ch' }}>{doc.abstract}</p>
                </>
              )}
              <p className="faint small" style={{ marginTop: 12 }}>
                The stored file is never altered. Reviews and annotations sit on top of it.
              </p>
            </Section>

            {can(ctx, 'ai.view') && SUMMARISED.includes(doc.docType) && (
              <Section title="AI summary">
                {!summary ? (
                  <p className="small muted">
                    Generated automatically from the complete manuscript when the defense is
                    scheduled — once per milestone, never for drafts.
                  </p>
                ) : (
                  <>
                    <div className="note ai" style={{ marginBottom: 16 }}>{summary.label}</div>
                    <dl className="kv">
                      {Object.entries(summary.structured).map(([k, v]) => (
                        <div key={k} style={{ display: 'contents' }}>
                          <dt>{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</dt>
                          <dd className="small">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="faint small" style={{ marginTop: 12 }}>
                      {summary.milestone} · version {summary.documentVersion} · generated {fmtDateTime(summary.generatedAt)} · {summary.model}
                    </p>
                  </>
                )}
              </Section>
            )}

            <Section
              title="Annotations"
              aside={hiddenCount > 0
                ? <span className="faint small">{hiddenCount} private panel note{hiddenCount > 1 ? 's' : ''} withheld until the verdict</span>
                : null}
            >
              {visibleAnnotations.length === 0 && <Empty>No annotations visible to you on this version.</Empty>}
              {visibleAnnotations.map(a => (
                <div className="entry" key={a.id}>
                  <div className="entry-head">
                    <strong style={{ fontSize: 13 }}>{nameOf(a.authorId)}</strong>
                    <span className="inline">
                      <Badge tone="accent">{a.authorRole}</Badge>
                      {a.visibility === 'private' && <Badge tone="warn">{a.releasedAt ? 'released' : 'private'}</Badge>}
                    </span>
                  </div>
                  <div className="mono faint" style={{ margin: '3px 0 5px' }}>
                    {a.anchor}{a.category ? ` · ${a.category}` : ''}
                  </div>
                  <p className="small" style={{ margin: 0 }}>{a.text}</p>
                  <div className="faint small" style={{ marginTop: 4 }}>{fmtDateTime(a.createdAt)}</div>
                </div>
              ))}

              {can(ctx, 'document.annotate') && reviewable && <AnnotationForm b={b} ctx={ctx} doc={doc} />}
            </Section>

            {REVIEWABLE_TYPES.includes(doc.docType) && (
              <Section title="Review decisions">
                {reviews.length === 0 && <Empty>No decision recorded on this version.</Empty>}
                {reviews.map(r => (
                  <div className="entry" key={r.id}>
                    <div className="entry-head">
                      <strong style={{ fontSize: 13 }}>{nameOf(r.reviewerId)}</strong>
                      <Badge tone={r.decision === DECISIONS.REJECT ? 'stop' : r.decision === DECISIONS.MAJOR ? 'warn' : 'ok'}>
                        {r.decision}
                      </Badge>
                    </div>
                    <p className="small" style={{ margin: '4px 0 0' }}>{r.comment}</p>
                    <div className="faint small" style={{ marginTop: 4 }}>{r.reviewerRole} · {fmtDateTime(r.createdAt)}</div>
                  </div>
                ))}
                {can(ctx, 'review.decide') && reviewable && <ReviewForm b={b} ctx={ctx} doc={doc} />}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function UploadForm({ types, b, onDone }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [docType, setDocType] = useState(types[0])
  const [title, setTitle] = useState('')
  const [abstract, setAbstract] = useState('')
  const [file, setFile] = useState(null)
  const [link, setLink] = useState('')
  const isLink = LINK_TYPES.includes(docType)
  const next = (b.documents.filter(d => d.docType === docType).length) + 1

  return (
    <div>
      <Field label="Document type">
        <select value={docType} onChange={e => setDocType(e.target.value)}>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Title" hint={docType === DOC_TYPES.TOPIC_PROPOSAL ? 'If approved and registered, this becomes the project title.' : undefined}>
        <input value={title} onChange={e => setTitle(e.target.value)} />
      </Field>
      {(docType.includes('Manuscript') || docType === DOC_TYPES.TOPIC_PROPOSAL || docType === DOC_TYPES.CONCEPT_PAPER) && (
        <Field label="Abstract"><textarea value={abstract} onChange={e => setAbstract(e.target.value)} /></Field>
      )}
      {isLink ? (
        <Field label="Video link" hint="Videos are not stored — link to where it is hosted.">
          <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" />
        </Field>
      ) : (
        <Field label="PDF file" hint="The prototype records the file name and size; Cloud Storage holds the file in production.">
          <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      )}
      <button className="primary" disabled={busy || !title}
        onClick={() => run(async () => {
          const created = await submitDocument(me, snap, b.project.id, {
            docType, title, abstract, link, fileName: file?.name, fileSize: file?.size,
          })
          setTitle(''); setAbstract(''); setFile(null); setLink('')
          onDone(created.id)
        })}>
        Submit version {next}
      </button>
      <ActionError error={error} />
      {next > 1 && (
        <p className="faint small" style={{ marginTop: 12 }}>
          Version {next - 1} is kept and marked superseded. Submitted files cannot be changed.
        </p>
      )}
    </div>
  )
}

function AnnotationForm({ b, ctx, doc }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [anchor, setAnchor] = useState('')
  const [category, setCategory] = useState(ANNOTATION_CATEGORIES[0])
  const [text, setText] = useState('')
  const role = why(ctx, 'document.annotate')?.role

  return (
    <div className="subform">
      <div className="label" style={{ marginBottom: 8 }}>Annotate as {role}</div>
      <div className="row">
        <Field label="Location"><input value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="p. 12, Scope" /></Field>
        <Field label="Category">
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {ANNOTATION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Comment"><textarea value={text} onChange={e => setText(e.target.value)} /></Field>
      {can(ctx, 'annotation.private') && (
        <p className="small muted">
          Private: other panel members and the group will not see this until the Panel Chair records the verdict.
        </p>
      )}
      <button disabled={busy || !text}
        onClick={() => run(async () => {
          await addAnnotation(me, snap, b.project.id, doc.id, { anchor, category, text })
          setAnchor(''); setText('')
        })}>
        Add annotation
      </button>
      <ActionError error={error} />
    </div>
  )
}

function ReviewForm({ b, ctx, doc }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [decision, setDecision] = useState(DECISIONS.APPROVE)
  const [comment, setComment] = useState('')
  const role = why(ctx, 'review.decide')?.role

  return (
    <div className="subform">
      <div className="label" style={{ marginBottom: 8 }}>Decide as {role}</div>
      <Field label="Decision">
        <select value={decision} onChange={e => setDecision(e.target.value)}>
          {Object.values(DECISIONS).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Comment to the group"><textarea value={comment} onChange={e => setComment(e.target.value)} /></Field>
      <button className="primary" disabled={busy}
        onClick={() => run(async () => {
          await submitReview(me, snap, b.project.id, doc.id, { decision, comment })
          setComment('')
        })}>
        Submit decision
      </button>
      <ActionError error={error} />
    </div>
  )
}
