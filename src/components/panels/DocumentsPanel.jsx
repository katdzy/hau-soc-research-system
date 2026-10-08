import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can, why, allowedDocTypes, uploadBlocker } from '../../domain/caac.js'
import { submitDocument, addAnnotation, submitReview } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import ManuscriptViewer from '../ManuscriptViewer.jsx'
import { anchorOf } from '../../domain/annotations.js'
import { FLAGS } from '../../domain/flags.js'
import { sampleFileFor } from '../../backend/sampleFiles.js'
import { Section, Empty, Badge, Field, docTone, fmtDateTime, fmtSize } from '../ui.jsx'
import {
  DECISIONS, DOC_STATUS, DOC_TYPES, ANNOTATION_CATEGORIES, REVIEWABLE_TYPES, LINK_TYPES,
  TOPIC_COUNT, MAX_PDF_MB, isPdfFile, isVideoLink, topicsProblem,
} from '../../domain/constants.js'

const SUMMARISED = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT]

export default function DocumentsPanel({ b, ctx }) {
  const { snap } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  // `b` is the guard-filtered bundle (viewBundle): without `document.history`
  // (the panel) it already holds only the current version of each document,
  // and private panel notes the user may not read are already removed.
  const versions = b.documents
  // One group per document type, newest version first (T13 version history).
  const groups = [...new Set(versions.map(d => d.docType))].map(type => ({
    type, rows: versions.filter(d => d.docType === type).sort((x, y) => y.versionNumber - x.versionNumber),
  }))

  const [selected, setSelected] = useState(versions[0]?.id ?? null)
  const doc = versions.find(d => d.id === selected) ?? null
  const uploadable = allowedDocTypes(b.project.currentStage, b).map(type => ({ type, blocker: uploadBlocker(b, type) }))
  // S9.4 — the URO's remarks on a returned certificate version.
  const uroReturn = doc ? (b.project.uroReturns ?? []).find(r => r.documentIds.includes(doc.id)) : null
  const approvedTopic = doc?.topics ? b.reviews.filter(r => r.documentId === doc.id && r.approvedTopic).at(-1)?.approvedTopic : null
  const visibleAnnotations = doc ? b.annotations.filter(a => a.documentId === doc.id) : []

  const summary = doc ? b.aiSummaries.find(s => s.documentId === doc.id) : null
  const reviews = doc ? b.reviews.filter(r => r.documentId === doc.id) : []
  const reviewable = doc && REVIEWABLE_TYPES.includes(doc.docType)
    && ![DOC_STATUS.SUPERSEDED, DOC_STATUS.ARCHIVED].includes(doc.status)

  return (
    <div className="docs">
      <div>
        <Section title="Versions">
          {b.latestOnly && (
            <p className="faint small">Panel members see the current version of each document only.</p>
          )}
          {versions.length === 0 && <Empty>Nothing submitted yet.</Empty>}
          {groups.map(g => (
            <div className="version-group" key={g.type}>
              <h3 className="label version-group-head">
                {g.type}
                {!b.latestOnly && g.rows.length > 1 && <span className="faint"> · {g.rows.length} versions</span>}
              </h3>
              <ul className="version-list">
                {g.rows.map(d => (
                  <li key={d.id}>
                    <button className={`version${d.id === selected ? ' is-selected' : ''}`}
                      aria-pressed={d.id === selected} onClick={() => setSelected(d.id)}>
                      <span className="version-head">
                        <strong>{d.title}</strong>
                        <span className="mono faint">v{d.versionNumber}</span>
                      </span>
                      <span className="inline mt-half">
                        <Badge tone={docTone(d.status)}>{d.status}</Badge>
                        {d.milestone && <Badge tone="info">{d.milestone}</Badge>}
                      </span>
                      <span className="faint small">{nameOf(d.submittedBy)} · {fmtDateTime(d.submittedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        {can(ctx, 'document.submit') && (
          <Section title="New submission">
            <UploadForm
              key={`${b.project.currentStage}:${uploadable.filter(t => !t.blocker).map(t => t.type).join()}`}
              types={uploadable} b={b} onDone={setSelected} />
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
                {!b.latestOnly && (
                  <>
                    <dt>Supersedes</dt>
                    <dd className="small muted">{doc.supersedes ? `version ${doc.versionNumber - 1}` : 'first version'}</dd>
                  </>
                )}
              </dl>
              {doc.topics && (
                <>
                  <div className="label m-0 mt-2 mb-half">Proposed topics</div>
                  <ol className="topic-list">
                    {doc.topics.map(t => (
                      <li key={t} className={t === approvedTopic ? 'is-approved' : undefined}>
                        {t}{t === approvedTopic && <> <Badge tone="ok">approved</Badge></>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {doc.abstract && (
                <>
                  <div className="label m-0 mt-2 mb-half">Abstract as submitted</div>
                  <p className="small muted measure">{doc.abstract}</p>
                </>
              )}
            </Section>

            {/* Keyed by version: a draft mark never carries over to another file. */}
            <Annotations key={doc.id} b={b} ctx={ctx} doc={doc} annotations={visibleAnnotations}
              canAnnotate={can(ctx, 'document.annotate') && reviewable} nameOf={nameOf} />

            {can(ctx, 'ai.view') && SUMMARISED.includes(doc.docType) && (
              <Section title="AI summary">
                {!summary ? (
                  <p className="small muted">
                    Generated automatically from the complete manuscript when the defense is
                    scheduled — once per milestone, never for drafts.
                  </p>
                ) : (
                  <>
                    <div className="note ai mb-2">{summary.label}</div>
                    <dl className="kv">
                      {Object.entries(summary.structured).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt>{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</dt>
                          <dd className="small">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="faint small mt-2">
                      {summary.milestone} · version {summary.documentVersion} · generated {fmtDateTime(summary.generatedAt)} · {summary.model}
                    </p>
                  </>
                )}
              </Section>
            )}

            {uroReturn && (
              <Section title="Returned by the URO">
                <div className="entry">
                  <div className="entry-head">
                    <strong className="text-sm">{nameOf(uroReturn.by)}</strong>
                    <Badge tone="warn">Returned</Badge>
                  </div>
                  <p className="small m-0 mt-half">{uroReturn.remarks}</p>
                  <div className="faint small mt-half">University Research Office · {fmtDateTime(uroReturn.at)}</div>
                </div>
              </Section>
            )}

            {REVIEWABLE_TYPES.includes(doc.docType) && (
              <Section title="Review decisions">
                {reviews.length === 0 && <Empty>No decision recorded on this version.</Empty>}
                {reviews.map(r => (
                  <div className="entry" key={r.id}>
                    <div className="entry-head">
                      <strong className="text-sm">{nameOf(r.reviewerId)}</strong>
                      <Badge tone={r.decision === DECISIONS.REJECT ? 'stop' : r.decision === DECISIONS.MAJOR ? 'warn' : 'ok'}>
                        {r.decision}
                      </Badge>
                    </div>
                    <p className="small m-0 mt-half">{r.comment}</p>
                    <div className="faint small mt-half">{r.reviewerRole} · {fmtDateTime(r.createdAt)}</div>
                  </div>
                ))}
                {(can(ctx, 'review.decide') || can(ctx, 'review.return')) && reviewable &&
                  [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW].includes(doc.status) &&
                  <ReviewForm key={doc.id} b={b} ctx={ctx} doc={doc} />}
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
  const { run, error, busy, setError } = useAction()
  const open = types.filter(t => !t.blocker)
  const [docType, setDocType] = useState(open[0]?.type ?? '')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [link, setLink] = useState('')
  const [topics, setTopics] = useState(() => Array(TOPIC_COUNT).fill(''))
  const [touched, setTouched] = useState(false)
  // The file input is uncontrolled; a new key clears the chosen file after a submission.
  const [fileKey, setFileKey] = useState(0)
  const isLink = LINK_TYPES.includes(docType)
  const isTopics = docType === DOC_TYPES.TOPIC_PROPOSAL
  const current = b.documents.filter(d => d.docType === docType).sort((x, y) => y.versionNumber - x.versionNumber)[0]
  const next = (current?.versionNumber ?? 0) + 1

  // The same checks the service runs, shown before the round trip.
  const problem = !docType ? 'Nothing can be submitted right now.'
    : isTopics && topicsProblem(topics) ? topicsProblem(topics)
      : isLink && !isVideoLink(link) ? 'Enter the full link to the hosted video, starting with https://.'
        : !isLink && !file ? 'Attach the PDF file.'
          : !isLink && !isPdfFile(file.name, file.type) ? 'Only PDF files can be submitted.'
            : !isLink && file.size > MAX_PDF_MB * 1024 * 1024 ? `The file is larger than ${MAX_PDF_MB} MB.`
              : null

  const reset = () => {
    setTitle(''); setFile(null); setLink(''); setTopics(Array(TOPIC_COUNT).fill('')); setTouched(false)
    setFileKey(k => k + 1)
  }

  return (
    <div>
      {open.length > 0 && (
        <Field label="Document type">
          <select value={docType} onChange={e => { setDocType(e.target.value); setError(''); setTouched(false) }}>
            {open.map(t => <option key={t.type} value={t.type}>{t.type}</option>)}
          </select>
        </Field>
      )}
      {types.filter(t => t.blocker).map(t => (
        <p key={t.type} className="small muted">{t.type}: {t.blocker}</p>
      ))}

      {docType && (
        <>
          {isTopics ? (
            <fieldset className="choice">
              <legend className="label">Your {TOPIC_COUNT} proposed topics</legend>
              {topics.map((t, i) => (
                <input key={i} value={t} aria-label={`Topic ${i + 1}`} placeholder={`Topic ${i + 1}`}
                  onChange={e => setTopics(list => list.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
              <span className="faint small">Instructor 1 approves one; it becomes your project title once registered.</span>
            </fieldset>
          ) : (
            <Field label="Label (optional)" hint={`Shown in the version list. Defaults to “${docType} v${next}”.`}>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapters 1–3" />
            </Field>
          )}
          {isLink ? (
            <Field label="Video link" hint="Videos are not stored — link to where it is hosted.">
              <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" />
            </Field>
          ) : (
            <Field label="PDF file" hint={`PDF only, up to ${MAX_PDF_MB} MB. Kept exactly as uploaded — reviewers annotate over it, never in it.`}>
              <input key={fileKey} type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          )}
          {/* R9 — dev builds only: the walkthroughs (Prompt 11) run in a browser
              that cannot open a file picker, so offer the matching dummy PDF. */}
          {FLAGS.DEV_TOOLS && !isLink && (
            <p className="inline small mt-pull">
              <button type="button" className="quiet small" onClick={async () => {
                const sample = await sampleFileFor({ projectId: b.project.id, docType, versionNumber: next, workflowStage: b.project.currentStage })
                if (!sample) return setError(`No dummy PDF for ${docType}.`)
                const blob = await (await fetch(sample.url)).blob()
                setFileKey(k => k + 1)
                setFile(new File([blob], sample.fileName, { type: 'application/pdf' }))
              }}>
                Attach dummy PDF <Badge tone="warn">dev</Badge>
              </button>
              {file && <span className="mono faint">{file.name}</span>}
            </p>
          )}
          <button className="primary" disabled={busy}
            onClick={() => {
              setTouched(true)
              if (problem) return
              run(async () => {
                const created = await submitDocument(me, snap, b.project.id, {
                  docType, title, link, topics: isTopics ? topics : undefined,
                  file: isLink ? undefined : file, fileName: file?.name, fileSize: file?.size, fileType: file?.type,
                })
                reset()
                onDone(created.id)
              })
            }}>
            Submit version {next}
          </button>
          {touched && problem && <p className="small error-text mt-1" role="alert">{problem}</p>}
          <ActionError error={error} />
          {current && (
            <p className="faint small mt-2">
              Version {current.versionNumber} is kept and marked superseded. Submitted files cannot be changed.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The file with its annotations drawn over it, the numbered list beside it and,
 * for reviewers, the form. The file itself is never written to (S3.6).
 */
function Annotations({ b, ctx, doc, annotations, canAnnotate, nameOf }) {
  const [draft, setDraft] = useState(null)
  const [focus, setFocus] = useState(null)
  const numbered = annotations.map((a, i) => ({ ...a, n: i + 1 }))
  const hasFile = !doc.link

  return (
    <div className={`review-desk${hasFile ? '' : ' is-plain'}`}>
      {hasFile && (
        <Section title="File">
          <ManuscriptViewer doc={doc} marks={numbered.filter(a => a.position)} draft={draft}
            onDraft={setDraft} canMark={canAnnotate} focus={focus} onFocus={setFocus} />
        </Section>
      )}

      <Section title={`Annotations${numbered.length ? ` · ${numbered.length}` : ''}`}>
        {canAnnotate && <AnnotationForm b={b} ctx={ctx} doc={doc} draft={draft} onClearDraft={() => setDraft(null)} hasFile={hasFile} />}
        {numbered.length === 0 && <Empty>No annotations visible to you on this version.</Empty>}
        <ol className="note-list">
          {numbered.map(a => (
            <li key={a.id} className={`entry${focus === a.id ? ' is-focus' : ''}`}>
              <div className="entry-head">
                <span className="inline">
                  <span className="note-n mono" aria-hidden="true">{a.n}</span>
                  <strong className="text-sm">{nameOf(a.authorId)}</strong>
                </span>
                <span className="inline">
                  <Badge tone="accent">{a.authorRole}</Badge>
                  {a.visibility === 'private' && <Badge tone="warn">{a.releasedAt ? 'released' : 'private'}</Badge>}
                </span>
              </div>
              <div className="mono faint small m-0 mt-half mb-half">
                {a.position
                  ? <button className="linkish" onClick={() => setFocus(a.id)}>{a.anchor}</button>
                  : a.anchor}
                {a.category ? ` · ${a.category}` : ''}
              </div>
              <p className="small m-0">{a.text}</p>
              <div className="faint small mt-half">{fmtDateTime(a.createdAt)}</div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}

function AnnotationForm({ b, ctx, doc, draft, onClearDraft, hasFile }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [anchor, setAnchor] = useState('')
  const [category, setCategory] = useState(ANNOTATION_CATEGORIES[0])
  const [text, setText] = useState('')
  const role = why(ctx, 'document.annotate')?.role

  return (
    <div className="subform mt-0 mb-2">
      <div className="label mb-1">Annotate as {role}</div>
      {/* Announced, so a screen-reader user hears that the selection became a mark. */}
      <div role="status" className="sr-only">{draft ? `Marked ${anchorOf(draft)}` : ''}</div>
      {draft ? (
        <div className="draft-anchor">
          <span className="mono small">{anchorOf(draft)}</span>
          <button className="linkish small" onClick={onClearDraft}>Clear mark</button>
        </div>
      ) : (
        <Field label="Location (optional)"
          hint={hasFile ? 'Or select words on the page, or use Mark area, to pin the comment to the file.' : undefined}>
          <input value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="e.g. Chapter 2, Scope" />
        </Field>
      )}
      <Field label="Category">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {ANNOTATION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Comment"><textarea value={text} onChange={e => setText(e.target.value)} /></Field>
      {can(ctx, 'annotation.private') && (
        <p className="small muted">
          Private: other panel members and the group will not see this until the Panel Chair records the verdict.
        </p>
      )}
      <button disabled={busy || !text.trim()}
        onClick={() => run(async () => {
          await addAnnotation(me, snap, b.project.id, doc.id, { anchor, category, text, position: draft })
          setAnchor(''); setText(''); onClearDraft()
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
  // Without `review.decide` (Instructor 1 on drafts, S4.2; the Adviser on topics
  // and concept papers, S3.2/S3.6) only returning is offered.
  const full = can(ctx, 'review.decide')
  const choices = full ? Object.values(DECISIONS) : [DECISIONS.MAJOR, DECISIONS.REJECT]
  const [decision, setDecision] = useState(choices[0])
  const [comment, setComment] = useState('')
  const [topic, setTopic] = useState('')
  const role = why(ctx, full ? 'review.decide' : 'review.return')?.role
  const approving = ![DECISIONS.MAJOR, DECISIONS.REJECT].includes(decision)
  const gateNote = full && doc.docType === DOC_TYPES.CONCEPT_PAPER && b.project.currentStage === 'TOPIC_PROPOSAL' &&
    ![DECISIONS.MAJOR, DECISIONS.REJECT].includes(decision)
  // S3.3 — approving a Topic Proposal means approving one of its topics.
  const picksTopic = doc.topics && ![DECISIONS.MAJOR, DECISIONS.REJECT].includes(decision)

  return (
    <div className="subform">
      <div className="label mb-1">Decide as {role}</div>
      <Field label="Decision">
        <select value={decision} onChange={e => setDecision(e.target.value)}>
          {choices.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      {picksTopic && (
        <Field label="Topic to approve">
          <select value={topic} onChange={e => setTopic(e.target.value)}>
            <option value="">Select one topic…</option>
            {doc.topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      )}
      <Field label="Comment to the group"><textarea value={comment} onChange={e => setComment(e.target.value)} /></Field>
      {!full && (
        <p className="small muted">
          {/* S3.2/S3.6: the Adviser returns topics and concept papers, Instructor 1 approves them; S4.2: the reverse for drafts. */}
          {b.project.currentStage === 'TOPIC_PROPOSAL' ? 'Instructor 1 approves topics and the concept paper.' : 'The Adviser approves drafts.'}
          {' '}You can return this version with your remarks.
        </p>
      )}
      {gateNote && <p className="small muted">Approving the concept paper moves the group to Proposal Development.</p>}
      <button className="primary" disabled={busy || (picksTopic && !topic) || (!approving && !comment.trim())}
        onClick={() => run(async () => {
          await submitReview(me, snap, b.project.id, doc.id, { decision, comment, approvedTopic: picksTopic ? topic : undefined })
          setComment(''); setTopic('')
        })}>
        Submit decision
      </button>
      <ActionError error={error} />
    </div>
  )
}
