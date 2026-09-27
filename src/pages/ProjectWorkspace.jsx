import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { bundle } from '../services/core.js'
import { resolveContext, projectAccess } from '../domain/caac.js'
import { stageByKey } from '../domain/stages.js'
import { Badge, Countdown, Empty } from '../components/ui.jsx'
import StageTimeline from '../components/StageTimeline.jsx'
import CaacInspector from '../components/CaacInspector.jsx'
import OverviewPanel from '../components/panels/OverviewPanel.jsx'
import DocumentsPanel from '../components/panels/DocumentsPanel.jsx'
import LogsPanel from '../components/panels/LogsPanel.jsx'
import DefensePanel from '../components/panels/DefensePanel.jsx'
import FormsPanel from '../components/panels/FormsPanel.jsx'
import HistoryPanel from '../components/panels/HistoryPanel.jsx'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'logs', label: 'Weekly logs' },
  { key: 'defense', label: 'Defense' },
  { key: 'forms', label: 'Forms & signatures' },
  { key: 'history', label: 'History' },
]

export default function ProjectWorkspace() {
  const { id } = useParams()
  const { snap, me } = useApp()
  const [tab, setTab] = useState('overview')

  const b = bundle(snap, id)
  if (!b) return <div className="page"><Empty>That project no longer exists.</Empty></div>

  const ctx = resolveContext(me, b)
  const access = projectAccess(me, b)
  const stage = stageByKey(b.project.currentStage)

  if (!access.visible) {
    return (
      <div className="page">
        <header className="page-head">
          <div className="label">Access not granted</div>
          <h1>{b.project.title}</h1>
          <p className="lede">{access.reason}</p>
        </header>
        <div className="split">
          <Link className="btn" to="/" style={{ justifySelf: 'start' }}>Back to worklist</Link>
          <CaacInspector ctx={ctx} project={b.project} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <Link className="small muted back" to="/projects">← All projects</Link>
        <h1>{b.project.title}</h1>
        <div className="inline" style={{ marginTop: 8 }}>
          <Badge tone="accent">{stage?.label}</Badge>
          <Badge>{b.project.program}</Badge>
          <span className="faint small">{b.project.block} · {b.project.term}</span>
          <Countdown deadline={b.project.revisionDeadline} />
        </div>
        {stage && <p className="lede" style={{ marginTop: 16 }}>{stage.blurb}</p>}
      </header>

      <div className="tabs" role="tablist" aria-label="Project workspace">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="split">
        <div role="tabpanel">
          {tab === 'overview' && <OverviewPanel b={b} ctx={ctx} goTo={setTab} />}
          {tab === 'documents' && <DocumentsPanel b={b} ctx={ctx} />}
          {tab === 'logs' && <LogsPanel b={b} ctx={ctx} />}
          {tab === 'defense' && <DefensePanel b={b} ctx={ctx} />}
          {tab === 'forms' && <FormsPanel b={b} ctx={ctx} />}
          {tab === 'history' && <HistoryPanel b={b} />}
        </div>

        <aside className="side">
          <CaacInspector ctx={ctx} project={b.project} />
          <div className="panel">
            <div className="label" style={{ marginBottom: 12 }}>Life cycle</div>
            <StageTimeline current={b.project.currentStage} history={b.history} />
          </div>
        </aside>
      </div>
    </div>
  )
}
