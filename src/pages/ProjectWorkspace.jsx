import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { bundle } from '../services/core.js'
import { resolveContext, can } from '../domain/caac.js'
import { viewBundle } from '../domain/guard.js'
import { stageByKey, sectionNow } from '../domain/stages.js'
import { Badge, Countdown, programShort } from '../components/ui.jsx'
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
  const [params, setParams] = useSearchParams()
  // `?tab=` lets a worklist item (or the rail) open the tab where its work is done.
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (key) => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })

  const raw = bundle(snap, id)
  // Everything below renders from the guard-filtered bundle, never the raw one.
  const b = viewBundle(me, raw)

  // Progressive visibility: completing your own step can move the project to a
  // stage that no longer involves you (the Program Chair routing an adviser to
  // the Dean). Instead of a dead end, return to the worklist and say where it went.
  const navigate = useNavigate()
  const seen = useRef(null)
  // Only for the same signed-in user: a persona switch must not reveal the title.
  if (b) seen.current = { id, title: b.project.title, userId: me.id }
  useEffect(() => {
    if (!b && seen.current?.id === id && seen.current?.userId === me.id && raw) {
      navigate('/', {
        replace: true,
        state: {
          forUserId: me.id,
          notice: `“${seen.current.title}” moved to ${stageByKey(raw.project.currentStage)?.label}. That step is not yours, so it has left your worklist.`,
        },
      })
    }
  }, [b, id, raw, navigate, me.id])

  // A missing project and one you may not open look the same, so a pasted URL
  // reveals neither the title nor the stage.
  if (!b) {
    return (
      <div className="page">
        <header className="page-head">
          <div className="label">Not available</div>
          <h1>This project is not available to you</h1>
          <p className="lede">
            Projects open only to their group, the faculty assigned to them, and the offices whose
            step is active at the project’s current stage.
          </p>
        </header>
        <Link className="btn" to="/">Back to worklist</Link>
      </div>
    )
  }

  const ctx = resolveContext(me, raw)
  const stage = stageByKey(b.project.currentStage)
  // No document access (the System Administrator) → the record and its history only.
  const tabs = can(ctx, 'document.read') ? TABS : TABS.filter(t => ['overview', 'history'].includes(t.key))
  const shown = tabs.some(t => t.key === tab) ? tab : 'overview'

  return (
    <div className="page">
      <header className="page-head">
        {!ctx.isMember && <Link className="small muted back" to="/projects">← All projects</Link>}
        <h1>{b.project.title}</h1>
        <p className="lede">
          {(({ section, course, term }) => `${section} · ${programShort(b.project.program)} · ${course} · ${term}`)(sectionNow(b.project))}
        </p>
        <div className="inline mt-2">
          <Badge tone="accent">Stage: {stage?.label}</Badge>
          <Countdown deadline={b.project.revisionDeadline} />
        </div>
        {stage && <p className="small muted mt-2 measure mb-0">{stage.blurb}</p>}
      </header>

      <StageTimeline current={b.project.currentStage} history={b.history} />

      <div className="tabs" role="tablist" aria-label="Project workspace">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={shown === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="split">
        <div role="tabpanel">
          {shown === 'overview' && <OverviewPanel b={b} ctx={ctx} goTo={setTab} />}
          {shown === 'documents' && <DocumentsPanel b={b} ctx={ctx} />}
          {shown === 'logs' && <LogsPanel b={b} ctx={ctx} />}
          {shown === 'defense' && <DefensePanel b={b} ctx={ctx} />}
          {shown === 'forms' && <FormsPanel b={b} ctx={ctx} />}
          {shown === 'history' && <HistoryPanel b={b} />}
        </div>

        <aside className="side">
          <CaacInspector ctx={ctx} project={b.project} />
        </aside>
      </div>
    </div>
  )
}
