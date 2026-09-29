import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Section, Badge, Empty, fmtDateTime } from '../components/ui.jsx'
import { useAction, ActionError } from '../components/useAction.jsx'
import { STAGES, stageLabel, macroStageOf } from '../domain/stages.js'
import { applyStage } from '../backend/stageBuilder.js'
import { SEED_ROLES } from '../backend/seed.js'
import { FLAGS, FLAG_NOTES } from '../domain/flags.js'
import { PROJECT_ROLES } from '../domain/constants.js'
import { allowedActions } from '../domain/guard.js'
import { verifyEmail, flagOverdueRevisions } from '../services/actions.js'
import { SCENARIOS, scenarioStore } from './scenarios.js'
import { projectLabel } from './personas.js'
import { toStore } from './checkpoint.js'
import ResetControls from './ResetControls.jsx'
import './dev.css'


const show = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/**
 * Dev-only (R9): scenario controls, stage controls, reset, the mock email
 * outbox, the audit log / workflow history, and the flag and allowedActions
 * tables. Excluded from the production build.
 */
export default function DevTools() {
  const { snap, me, replaceStore, signIn } = useApp()
  const { run, error, busy } = useAction()
  const projects = snap.projects ?? []
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [stage, setStage] = useState('GROUP_FORMATION')
  const [logProject, setLogProject] = useState('')
  const [notice, setNotice] = useState('')

  const nameOf = (id) => id === 'system' ? 'System' : (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const titleOf = (id) => projectLabel(projects.find(p => p.id === id))

  async function loadScenario(sc) {
    await replaceStore(scenarioStore(sc.id))
    signIn(sc.loginAs)
    setNotice(`Loaded ${sc.id}. Signed in as ${nameOf(sc.loginAs)}. Look at: ${sc.look}.`)
  }

  async function setProjectStage() {
    const store = applyStage(toStore(snap), projectId, stage, { roles: SEED_ROLES[projectId] })
    const id = `l_dev_${Date.now().toString(36)}`
    store.auditLogs[id] = {
      id, actorId: me.id, hat: 'Dev tools', action: 'DEV_SET_STAGE', entityType: 'projects', entityId: projectId,
      projectId, before: { stage: snap.projects.find(p => p.id === projectId)?.currentStage }, after: { stage },
      at: new Date().toISOString(), meta: {},
    }
    await replaceStore(store)
    setNotice(`${titleOf(projectId)} is now at ${stageLabel(stage)} with its prerequisites filled in.`)
  }

  const outbox = [...(snap.outbox ?? [])].sort((a, b) => new Date(b.at) - new Date(a.at))
  const trail = useMemo(() => [
    ...(snap.auditLogs ?? []).map(l => ({ ...l, kind: 'Audit' })),
    ...(snap.workflowHistory ?? []).map(h => ({
      ...h, kind: 'History',
      before: h.fromStage ? { stage: h.fromStage } : null,
      after: h.fromStage === h.toStage ? null : { stage: h.toStage },
    })),
  ].filter(r => !logProject || r.projectId === logProject)
    .sort((a, b) => new Date(b.at) - new Date(a.at)), [snap.auditLogs, snap.workflowHistory, logProject])

  const hats = Object.values(PROJECT_ROLES)

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Dev tools <span className="dev-flag">not in production builds</span></div>
        <h1>Test harness</h1>
        <p className="lede">
          Scenario and stage controls, the mock email outbox, and the audit trail. These bypass the
          guard on purpose — they set data up, they do not act as anyone.
        </p>
      </header>

      {notice && <p className="note" role="status" style={{ marginBottom: 24 }}>{notice}</p>}
      <ActionError error={error} />

      <Section title="Demo data">
        <ResetControls compact />
      </Section>

      <Section title="§7 scenarios">
        <div className="table-scroll"><table className="dev-scenarios">
          <thead><tr><th className="tight">#</th><th>Log in as</th><th>Look at</th><th>Expected</th><th className="tight" /></tr></thead>
          <tbody>
            {SCENARIOS.map(sc => (
              <tr key={sc.id}>
                <td className="tight">{sc.id}</td>
                <td className="small">{nameOf(sc.loginAs)}</td>
                <td className="small muted">{sc.look}</td>
                <td className="small">{sc.expect}</td>
                <td className="tight"><button className="small" disabled={busy} onClick={() => run(() => loadScenario(sc))}>Load</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Section>

      <div className="dev-grid">
        <Section title="Set project to stage">
          <div className="dev-switch">
            <label className="label" htmlFor="dev-project">Project</label>
            <select id="dev-project" value={projectId} onChange={e => setProjectId(e.target.value)}>
              {projects.map(p => <option key={p.id} value={p.id}>{projectLabel(p)} — {stageLabel(p.currentStage)}</option>)}
            </select>
            <label className="label" htmlFor="dev-stage">Stage</label>
            <select id="dev-stage" value={stage} onChange={e => setStage(e.target.value)}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{macroStageOf(s.key)} · {s.label}</option>)}
            </select>
          </div>
          <button className="primary" disabled={busy || !projectId} onClick={() => run(setProjectStage)}>Apply</button>
          <p className="faint small" style={{ marginTop: 12 }}>
            Rebuilds the project’s documents, reviews, defenses, forms, logs and history so every
            earlier gate is satisfied and this stage’s own work is still open.
          </p>
        </Section>

        <Section title="System jobs">
          <button disabled={busy} onClick={() => run(async () => {
            const n = await flagOverdueRevisions()
            setNotice(n ? `${n} revision(s) flagged overdue.` : 'No revisions are past their deadline.')
          })}>
            Run overdue check (S8.2)
          </button>
          <p className="faint small" style={{ marginTop: 12 }}>Also runs on load and every minute.</p>
        </Section>
      </div>

      <Section title={`Outbox — mock emails (${outbox.length})`}>
        {outbox.length === 0 && <Empty>No emails yet.</Empty>}
        {outbox.slice(0, 60).map(m => (
          <div className="outbox-entry" key={m.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>{m.subject}</strong>
              <span className="inline"><Badge tone="info">{m.event}</Badge><span className="faint small">{fmtDateTime(m.at)}</span></span>
            </div>
            <div className="mono faint" style={{ margin: '3px 0 5px' }}>To: {(m.to ?? []).join(', ') || '—'}</div>
            <p className="small muted" style={{ margin: 0 }}>{m.body}</p>
            {m.link?.kind === 'verify' && (
              <button className="small" style={{ marginTop: 8 }} disabled={busy}
                onClick={() => run(async () => { await verifyEmail(m.link.token); setNotice(`Verified ${m.to?.[0]}.`) })}>
                {m.link.label}
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title={`Audit log and workflow history (${trail.length})`} aside={
        <select value={logProject} onChange={e => setLogProject(e.target.value)} aria-label="Filter by project" style={{ width: 'auto' }}>
          <option value="">All projects and accounts</option>
          {projects.map(p => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}
        </select>
      }>
        {trail.length === 0 && <Empty>Nothing recorded yet.</Empty>}
        {trail.length > 0 && (
          <div className="table-scroll"><table>
            <thead><tr>
              <th className="tight">When</th><th className="tight">Kind</th><th className="tight">Action</th>
              <th className="tight">Actor · hat</th><th className="tight">Project</th><th>Before → after</th>
            </tr></thead>
            <tbody>
              {trail.slice(0, 200).map(r => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td className="tight mono faint" style={{ fontSize: 11.5 }}>{fmtDateTime(r.at)}</td>
                  <td className="tight small">{r.kind}</td>
                  <td className="tight"><Badge>{r.action}</Badge></td>
                  <td className="tight small">{nameOf(r.actorId)}<div className="faint">{r.hat ?? '—'}</div></td>
                  <td className="tight small muted">{r.projectId ? titleOf(r.projectId) : '—'}</td>
                  <td className="kv-diff">{show(r.before)} → {show(r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>

      <Section title="Config flags">
        <div className="table-scroll"><table>
          <thead><tr><th>Flag</th><th>Value</th><th>Source</th><th>Wired in</th></tr></thead>
          <tbody>
            {Object.entries(FLAGS).map(([k, v]) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td className="kv-diff">{show(v)}</td>
                <td className="small">{FLAG_NOTES[k]?.source} · <span className="muted">{FLAG_NOTES[k]?.kind}</span></td>
                <td className="small muted">{FLAG_NOTES[k]?.wired}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Section>

      <Section title="allowedActions — role hat × stage">
        <p className="small muted">
          Generated from the CAAC policies (guard.js). Relationship conditions — group membership,
          program scope, not approving yourself — are checked per user on top of this table.
        </p>
        {hats.map(hat => (
          <details className="policy-group" key={hat}>
            <summary><span className="tag">{hat}</span></summary>
            <table>
              <thead><tr><th>Stage</th><th>Actions</th></tr></thead>
              <tbody>
                {STAGES.map(s => {
                  const actions = allowedActions(hat, s.key)
                  return (
                    <tr key={s.key}>
                      <td className="small">{s.label}</td>
                      <td className="kv-diff">{actions.length ? actions.join(', ') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        ))}
      </Section>
    </div>
  )
}
