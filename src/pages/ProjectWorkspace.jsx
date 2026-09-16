import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { bundle } from '../services/core.js'
import { resolveContext, projectAccess, can } from '../domain/cac.js'
import { stageByKey } from '../domain/stages.js'
import { Badge, Countdown, Empty } from '../components/ui.jsx'
import StageTimeline from '../components/StageTimeline.jsx'
import CacInspector from '../components/CacInspector.jsx'
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

  if (access.level === 'none') {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Access not granted</h1>
          <p className="lede">{access.reason}</p>
        </header>
        <Link className="btn" to="/">Back to worklist</Link>
      </div>
    )
  }

  const readOnly = access.level === 'observe'

  return (
    <div className="page">
      <header className="page-head">
        <Link className="small muted" to="/projects" style={{ textDecoration: 'none' }}>← All projects</Link>
        <h1 style={{ marginTop: 10 }}>{b.project.title}</h1>
        <div className="inline" style={{ marginTop: 8 }}>
          <Badge tone="accent">{stage?.label}</Badge>
          <Badge>{b.project.program}</Badge>
          <span className="faint small">{b.project.term}</span>
          <Countdown deadline={b.project.revisionDeadline} />
          {readOnly && <Badge tone="warn">observation only</Badge>}
        </div>
        {stage && <p className="lede" style={{ marginTop: 10 }}>{stage.blurb}</p>}
      </header>

      {readOnly ? (
        <div className="split">
          <div>
            <div className="note" style={{ marginBottom: 22 }}>
              This project has not been endorsed to your gate yet, so it is visible for
              oversight only. {access.reason}.
            </div>
            <HistoryPanel b={b} />
          </div>
          <div>
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 12 }}>Lifecycle</div>
              <StageTimeline current={b.project.currentStage} history={b.history} />
            </div>
            <CacInspector ctx={ctx} access={access} project={b.project} />
          </div>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {TABS.map(t => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="split">
            <div>
              {tab === 'overview' && <OverviewPanel b={b} ctx={ctx} />}
              {tab === 'documents' && <DocumentsPanel b={b} ctx={ctx} />}
              {tab === 'logs' && <LogsPanel b={b} ctx={ctx} />}
              {tab === 'defense' && <DefensePanel b={b} ctx={ctx} />}
              {tab === 'forms' && <FormsPanel b={b} ctx={ctx} />}
              {tab === 'history' && <HistoryPanel b={b} />}
            </div>

            <div>
              <div className="panel" style={{ marginBottom: 14 }}>
                <div className="label" style={{ marginBottom: 12 }}>Lifecycle</div>
                <StageTimeline current={b.project.currentStage} history={b.history} />
              </div>
              <CacInspector ctx={ctx} access={access} project={b.project} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
