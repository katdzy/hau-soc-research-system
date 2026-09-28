import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { can, why, allowedDocTypes } from '../../domain/caac.js'
import { submitDocument, addAnnotation, submitReview, generateAiSummary } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, docTone, fmtDateTime, fmtSize } from '../ui.jsx'
import {
  DECISIONS, DOC_STATUS, DOC_TYPES, ANNOTATION_CATEGORIES, REVIEWABLE_TYPES, LINK_TYPES,
} from '../../domain/constants.js'

const SUMMARISED = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT]

export default function DocumentsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  // Without `document.history` (the panel), only the current version of each
  // document type is shown; older versions stay stored but out of view.
  const fullHistory = can(ctx, 'document.history')
  const versions = useMemo(() => fullHistory
    ? b.documents
    : b.documents.filter(d => d.status !== DOC_STATUS.SUPERSEDED), [b.documents, fullHistory])

  const [selected, setSelected] = useState(versions[0]?.id ?? null)
  const doc = versions.find(d => d.id === selected) ?? null

  // Private panel notes are withheld from everyone but their author until the
  // Panel Chair records the verdict (`releasedAt`).
  const docAnnotations = doc ? b.annotations.filter(a => a.documentId === doc.id) : []
  const visibleAnnotations = docAnnotations.filter(a => a.authorId === me.id ||
    (a.status !== 'Draft' && (a.visibility !== 'private' || a.releasedAt)))
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
          <p className="small"><Link to="/submit">Submit a new version</Link> from Submissions — you confirm the version before it goes in.</p>
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
              <Section title="AI summary (Gemini Flash)">
                {!summary ? (
                  <div>
                    <p className="small muted" style={{ marginBottom: 12 }}>
                      Generated automatically from the complete manuscript when the defense is
                      scheduled — processed strictly via Google Gemini Flash API on an active paid billing tier.
                    </p>
                    <button className="primary small" disabled={busy} onClick={() => run(() => generateAiSummary(me, snap, b.project.id, doc.id))}>
                      ✨ Generate Gemini Flash Summary
                    </button>
                  </div>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                      <p className="faint small" style={{ margin: 0 }}>
                        {summary.milestone} · version {summary.documentVersion} · generated {fmtDateTime(summary.generatedAt)} · {summary.model}
                      </p>
                      <button className="quiet small" disabled={busy} onClick={() => run(() => generateAiSummary(me, snap, b.project.id, doc.id))}>
                        🔄 Refresh Summary
                      </button>
                    </div>
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

              {(can(ctx, 'document.annotate') || can(ctx, 'review.decide')) && reviewable && (
                <Link className="btn" to={`/review/${doc.id}`}>Open in the review workspace</Link>
              )}
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
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
