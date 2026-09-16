import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { bundle } from '../services/core.js'
import { setPublicGallery } from '../services/actions.js'
import { resolveContext, can } from '../domain/cac.js'
import { Section, Empty, Badge, fmtDate } from '../components/ui.jsx'
import { DOC_TYPES } from '../domain/constants.js'

export default function Archive() {
  const { snap, me } = useApp()
  const [query, setQuery] = useState('')
  const institutional = resolveContext(me, null)
  const isAdmin = can(institutional, 'admin.users')

  const archived = (snap.projects ?? []).filter(p => p.currentStage === 'ARCHIVED')
  const gallery = archived.filter(p => p.publicGallery)

  const match = (p) =>
    !query ||
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.researchArea.toLowerCase().includes(query.toLowerCase())

  const abstractOf = (p) => {
    const b = bundle(snap, p.id)
    return b?.documents.find(d => d.docType === DOC_TYPES.FINAL_MANUSCRIPT)?.abstract ?? ''
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Archive</div>
        <h1>Institutional archive</h1>
        <p className="lede">
          Cleared projects are sealed with a Pass/Fail result — no grades are stored. Selected
          projects are published to the public Colloquium Gallery with their abstracts.
        </p>
      </header>

      <Section
        title={`Archived projects (${archived.length})`}
        aside={<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title or research area" style={{ width: 280 }} />}
      >
        {archived.filter(match).length === 0 && <Empty>Nothing archived yet.</Empty>}
        {archived.filter(match).map(p => (
          <div className="entry" key={p.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 14 }}>{p.title}</strong>
              <span className="inline">
                <Badge tone={p.archiveResult === 'Pass' ? 'ok' : 'stop'}>{p.archiveResult}</Badge>
                {p.publicGallery && <Badge tone="accent">Colloquium Gallery</Badge>}
              </span>
            </div>
            <div className="faint small" style={{ marginTop: 3 }}>
              {p.program} · {p.researchArea} · cleared {fmtDate(p.uroClearedAt)}
            </div>
            {abstractOf(p) && <p className="small muted" style={{ margin: '8px 0 0', maxWidth: '72ch' }}>{abstractOf(p)}</p>}
            {isAdmin && (
              <button className="quiet small" style={{ marginTop: 8 }}
                onClick={() => setPublicGallery(me, p.id, !p.publicGallery)}>
                {p.publicGallery ? 'Remove from public gallery' : 'Publish to public gallery'}
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title={`Public Colloquium Gallery (${gallery.length})`}>
        <p className="small muted">
          What an unauthenticated visitor would see. Confidential documents are never exposed here —
          only the title, programme, research area and abstract.
        </p>
        {gallery.length === 0 && <Empty>No projects have been published.</Empty>}
        {gallery.map(p => (
          <div className="entry" key={p.id}>
            <strong style={{ fontSize: 14 }}>{p.title}</strong>
            <div className="faint small">{p.program} · {p.term}</div>
            <p className="small muted" style={{ margin: '6px 0 0', maxWidth: '72ch' }}>{abstractOf(p)}</p>
          </div>
        ))}
      </Section>
    </div>
  )
}
