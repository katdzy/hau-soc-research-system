import { useMemo, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can, allowedDocTypes } from '../../domain/cac.js'
import { stageIndex } from '../../domain/stages.js'
import { submitDocument, addAnnotation, submitReview, generateAiSummary } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, docTone, fmtDateTime, fmtSize } from '../ui.jsx'
import { DECISIONS, DOC_STATUS, DOC_TYPES, AI_MILESTONES } from '../../domain/constants.js'

const milestoneFor = (docType) =>
  docType === DOC_TYPES.PROPOSAL_MANUSCRIPT ? 'Proposal Defense'
    : (docType === DOC_TYPES.FINAL_MANUSCRIPT || docType === DOC_TYPES.REVISED_MANUSCRIPT) ? 'Final Defense'
      : null

export default function DocumentsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [selected, setSelected] = useState(b.documents[0]?.id ?? null)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  const uploadable = allowedDocTypes(b.project.currentStage)
  const doc = b.documents.find(d => d.id === selected) ?? null
  const currentIdx = stageIndex(b.project.currentStage)

  // Panel annotations stay private to their author until the project moves
  // past the stage they were written in (FR-25).
  const visibleAnnotations = useMemo(() => {
    if (!doc) return []
    return b.annotations.filter(a => {
      if (a.documentId !== doc.id) return false
      if (a.visibility !== 'private') return true
      if (a.authorId === me.id) return true
      return a.stageAtCreation ? currentIdx > stageIndex(a.stageAtCreation) : false
    })
  }, [b.annotations, doc, me.id, currentIdx])

  const hiddenCount = doc
    ? b.annotations.filter(a => a.documentId === doc.id).length - visibleAnnotations.length
    : 0

  const summary = doc ? b.aiSummaries.find(s => s.documentId === doc.id) : null
  const reviews = doc ? b.reviews.filter(r => r.documentId === doc.id) : []

  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)', gap: 32 }}>
      <div>
        <Section title="Versions">
          {b.documents.length === 0 && <Empty>Nothing submitted yet.</Empty>}
          <div>
            {b.documents.map(d => (
              <button key={d.id}
                onClick={() => setSelected(d.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 0,
                  borderLeft: `3px solid ${d.id === selected ? 'var(--accent)' : 'transparent'}`,
                  borderBottom: '1px solid var(--rule)', borderRadius: 0,
                  background: d.id === selected ? 'var(--accent-wash)' : 'transparent',
                  padding: '10px 12px',
                }}>
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 13 }}>{d.docType}</strong>
                  <span className="mono faint">v{d.versionNumber}</span>
                </div>
                <div className="inline" style={{ marginTop: 4 }}>
                  <Badge tone={docTone(d.status)}>{d.status}</Badge>
                  {d.milestone && <Badge tone="info">{d.milestone}</Badge>}
                </div>
                <div className="faint small" style={{ marginTop: 3 }}>
                  {nameOf(d.submittedBy)} · {fmtDateTime(d.submittedAt)}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {can(ctx, 'document.submit') && (
          <Section title="New submission">
            {uploadable.length === 0
              ? <p className="small muted">This stage does not accept uploads.</p>
              : <UploadForm types={uploadable} b={b} onDone={setSelected} />}
          </Section>
        )}
      </div>

      <div>
        {!doc && <Empty>Select a version to review it.</Empty>}
        {doc && (
          <>
            <Section title={`${doc.docType} — version ${doc.versionNumber}`}>
              <dl className="kv">
                <dt>File</dt>
                <dd className="mono">{doc.fileName} <span className="faint">({fmtSize(doc.fileSize)})</span></dd>
                <dt>Submitted</dt><dd>{nameOf(doc.submittedBy)} · {fmtDateTime(doc.submittedAt)}</dd>
                <dt>Status</dt><dd><Badge tone={docTone(doc.status)}>{doc.status}</Badge></dd>
                <dt>Supersedes</dt>
                <dd className="mono faint">{doc.supersedes ?? 'first version'}</dd>
                {doc.milestone && <><dt>Milestone</dt><dd>{doc.milestone}</dd></>}
              </dl>
              {doc.abstract && (
                <>
                  <div className="label" style={{ margin: '16px 0 4px' }}>Abstract as submitted</div>
                  <p className="small muted" style={{ maxWidth: '68ch' }}>{doc.abstract}</p>
                </>
              )}
              <p className="faint small" style={{ marginTop: 12 }}>
                The stored file is never altered. Reviews and annotations are layered on top of it.
              </p>
            </Section>

            {can(ctx, 'ai.view') && AI_MILESTONES.includes(doc.milestone) && (
              <Section title="AI-assisted summary">
                {!summary ? (
                  <>
                    <p className="small muted">
                      No summary has been generated for this version. Summaries are produced once per
                      defense milestone, never per revision.
                    </p>
                    <button disabled={busy}
                      onClick={() => run(() => generateAiSummary(me, snap, b.project.id, doc.id))}>
                      Generate summary
                    </button>
                  </>
                ) : (
                  <>
                    <div className="note ai" style={{ marginBottom: 14 }}>{summary.label}</div>
                    <dl className="kv">
                      {Object.entries(summary.structured).map(([k, v]) => (
                        <div key={k} style={{ display: 'contents' }}>
                          <dt>{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</dt>
                          <dd className="small">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="faint small" style={{ marginTop: 10 }}>
                      Generated {fmtDateTime(summary.generatedAt)} · {summary.model}
                    </p>
                  </>
                )}
                <ActionError error={error} />
              </Section>
            )}

            <Section
              title="Annotations"
              aside={hiddenCount > 0
                ? <span className="faint small">{hiddenCount} private annotation(s) withheld until the defense concludes</span>
                : null}
            >
              {visibleAnnotations.length === 0 && <Empty>No annotations visible to you on this version.</Empty>}
              {visibleAnnotations.map(a => (
                <div className="entry" key={a.id}>
                  <div className="entry-head">
                    <strong style={{ fontSize: 13 }}>{nameOf(a.authorId)}</strong>
                    <span className="inline">
                      <Badge tone="accent">{a.authorRole}</Badge>
                      {a.visibility === 'private' && <Badge tone="warn">private</Badge>}
                    </span>
                  </div>
                  <div className="mono faint" style={{ margin: '3px 0 5px' }}>{a.anchor}</div>
                  <p className="small" style={{ margin: 0 }}>{a.text}</p>
                  <div className="faint small" style={{ marginTop: 4 }}>{fmtDateTime(a.createdAt)}</div>
                </div>
              ))}

              {can(ctx, 'document.annotate') && (
                <AnnotationForm b={b} ctx={ctx} doc={doc} />
              )}
            </Section>

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

              {can(ctx, 'review.decide') && doc.status !== DOC_STATUS.SUPERSEDED && doc.status !== DOC_STATUS.ARCHIVED && (
                <ReviewForm b={b} ctx={ctx} doc={doc} />
              )}
            </Section>
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
  const [isMilestone, setIsMilestone] = useState(false)
  const milestone = milestoneFor(docType)

  return (
    <div>
      <Field label="Document type">
        <select value={docType} onChange={e => { setDocType(e.target.value); setIsMilestone(false) }}>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Title" hint={docType === DOC_TYPES.TOPIC_PROPOSAL ? 'For a topic proposal this becomes the registered project title.' : undefined}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`${docType}…`} />
      </Field>
      {(docType.includes('Manuscript') || docType === DOC_TYPES.TOPIC_PROPOSAL) && (
        <Field label="Abstract">
          <textarea value={abstract} onChange={e => setAbstract(e.target.value)} />
        </Field>
      )}
      <Field label="File" hint="The prototype records the filename and size only; Cloud Storage holds the binary in the Firebase build.">
        <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {milestone && (
        <label className="inline small" style={{ marginBottom: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }}
            checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} />
          This is the complete manuscript for the {milestone}
        </label>
      )}
      <button className="primary" disabled={busy || !title}
        onClick={() => run(async () => {
          const created = await submitDocument(me, snap, b.project.id, {
            docType, title, abstract,
            fileName: file?.name, fileSize: file?.size,
            milestone: isMilestone ? milestone : null,
          })
          setTitle(''); setAbstract(''); setFile(null); setIsMilestone(false)
          onDone(created.id)
        })}>
        Submit version
      </button>
      <ActionError error={error} />
      <p className="faint small" style={{ marginTop: 10 }}>
        Submitting creates version {(b.documents.filter(d => d.docType === docType).length) + 1} — the previous
        version is retained and marked superseded.
      </p>
    </div>
  )
}

function AnnotationForm({ b, ctx, doc }) {
  const { me } = useApp()
  const { run, error, busy } = useAction()
  const [anchor, setAnchor] = useState('')
  const [text, setText] = useState('')
  const isPanel = ctx.projectRoles.some(r => r.startsWith('Panel'))
  const role = ctx.projectRoles.find(r => ['Adviser', 'Panel Chair', 'Panel Member', 'Instructor 1'].includes(r)) ?? ctx.globalRole

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
      <div className="label" style={{ marginBottom: 8 }}>Add annotation as {role}</div>
      <div className="row">
        <Field label="Anchor"><input value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="p. 12, §2.3" /></Field>
      </div>
      <Field label="Comment"><textarea value={text} onChange={e => setText(e.target.value)} /></Field>
      {isPanel && (
        <p className="small muted" style={{ marginTop: -6 }}>
          Panel annotations are recorded as private and released to the group once the defense concludes.
        </p>
      )}
      <button disabled={busy || !text}
        onClick={() => run(async () => {
          await addAnnotation(me, b.project.id, doc.id, {
            anchor, text, authorRole: role,
            visibility: isPanel ? 'private' : 'shared',
            stageAtCreation: b.project.currentStage,
          })
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
  const role = ctx.projectRoles.find(r => ['Adviser', 'Instructor 1'].includes(r)) ?? ctx.globalRole

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
      <div className="label" style={{ marginBottom: 8 }}>Record a decision as {role}</div>
      <Field label="Decision">
        <select value={decision} onChange={e => setDecision(e.target.value)}>
          {Object.values(DECISIONS).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Comment to the group"><textarea value={comment} onChange={e => setComment(e.target.value)} /></Field>
      <button className="primary" disabled={busy}
        onClick={() => run(async () => {
          await submitReview(me, snap, b.project.id, doc.id, { decision, comment, reviewerRole: role })
          setComment('')
        })}>
        Submit decision
      </button>
      <ActionError error={error} />
    </div>
  )
}
