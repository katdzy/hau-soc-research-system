import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup } from '../../services/views.js'
import { PageHead, Empty } from '../../components/blocks.jsx'
import { Badge, docTone, fmtDate } from '../../components/ui.jsx'
import { stageLabel } from '../../domain/stages.js'
import { DOC_STATUS, ANNOTATION_STATUS } from '../../domain/constants.js'

// Wireframe S-04. Every submission is a numbered, read-only version; pick any
// two to compare. The prototype does not parse PDFs, so the comparison sets
// out what each version declared and what came back on it.

export default function VersionHistory() {
  const { snap, me } = useApp()
  const [params] = useSearchParams()
  const b = myGroup(snap, me)
  const docs = b ? [...b.documents].sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt)) : []
  const [picked, setPicked] = useState(() => docs.slice(0, 2).map(d => d.id))

  if (!b) return <div className="page"><PageHead title="Version history" /><Empty>You are not in a project group yet.</Empty></div>

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const reviewOf = (d) => b.reviews.filter(r => r.documentId === d.id).at(-1)
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p.slice(-1), id])
  const compare = picked.map(id => docs.find(d => d.id === id)).filter(Boolean)
    .sort((x, y) => new Date(x.submittedAt) - new Date(y.submittedAt))

  return (
    <div className="page">
      <PageHead title="Version history"
        lede="Every submission is preserved as a numbered, read-only version. Select any two versions to compare." />

      {docs.length === 0 ? <Empty>Nothing submitted yet.</Empty> : (
        <div className="panel flush">
          <div className="table-scroll"><table className="versions">
            <thead>
              <tr>
                <th className="tight"><span className="sr-only">Compare</span></th>
                <th>Version</th><th>Document</th><th>Submitted</th><th>Stage</th><th>Status</th><th>Reviewer</th><th className="tight" />
              </tr>
            </thead>
            <tbody>
              {docs.map(d => {
                const r = reviewOf(d)
                const current = d.status !== DOC_STATUS.SUPERSEDED && d.status !== DOC_STATUS.ARCHIVED
                return (
                  <tr key={d.id} className={params.get('highlight') === d.id ? 'is-new' : undefined}>
                    <td className="tight">
                      <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)}
                        aria-label={`Compare ${d.docType} v${d.versionNumber}`} />
                    </td>
                    <td>
                      <strong>v{d.versionNumber}</strong>
                      {current && <div><span className="chip small-chip">Current</span></div>}
                    </td>
                    <td>
                      <div>{d.fileName ?? d.link}</div>
                      <div className="faint small">{d.docType}{d.scope ? ` · ${d.scope}` : ''} · immutable</div>
                    </td>
                    <td className="small">{fmtDate(d.submittedAt)}</td>
                    <td className="small muted">{stageLabel(d.workflowStage ?? '') || '—'}</td>
                    <td><Badge tone={docTone(d.status)}>{r && d.status !== DOC_STATUS.SUPERSEDED ? r.decision : d.status}</Badge></td>
                    <td className="small">{r ? `${nameOf(r.reviewerId)}` : <span className="faint">Awaiting review</span>}</td>
                    <td className="tight small"><Link to={`/feedback?v=${d.id}`}>Feedback</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {compare.length === 2 && (
        <section className="section" style={{ marginTop: 40 }}>
          <div className="section-head">
            <h2>Compare versions</h2>
            <span className="faint small">
              {compare[0].docType} v{compare[0].versionNumber} → {compare[1].docType} v{compare[1].versionNumber}
            </span>
          </div>
          <div className="compare">
            {compare.map(d => {
              const r = reviewOf(d)
              const notes = b.annotations.filter(a => a.documentId === d.id && a.status !== ANNOTATION_STATUS.DRAFT && a.visibility === 'shared')
              return (
                <article key={d.id} className="panel">
                  <h3>v{d.versionNumber} — {fmtDate(d.submittedAt)}</h3>
                  <dl className="kv kv-tight" style={{ marginTop: 12 }}>
                    <dt>Document</dt><dd>{d.docType}</dd>
                    <dt>Version</dt><dd>{d.scope ?? '—'}</dd>
                    <dt>Contains</dt><dd className="small">{d.versionNote || <span className="faint">Not stated</span>}</dd>
                    <dt>Submitted by</dt><dd className="small">{nameOf(d.submittedBy)}</dd>
                    <dt>Decision</dt><dd className="small">{r ? `${r.decision} — ${nameOf(r.reviewerId)}` : 'Not reviewed'}</dd>
                  </dl>
                  {r?.comment && <p className="small muted" style={{ marginTop: 12 }}>{r.comment}</p>}
                  {notes.length > 0 && (
                    <>
                      <div className="label" style={{ marginTop: 16 }}>Annotated locations</div>
                      <ul className="plain-list small">
                        {notes.map(a => <li key={a.id}>{a.anchor} <span className="faint">· {a.status}</span></li>)}
                      </ul>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
