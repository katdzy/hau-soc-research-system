import { useApp } from '../state/AppContext.jsx'
import { Section, Badge, Empty } from '../components/ui.jsx'
import { STAGES, stageByKey, stageIndex } from '../domain/stages.js'
import { PROGRAMS } from '../domain/constants.js'

export default function Reports() {
  const { snap } = useApp()
  const projects = snap.projects ?? []
  const users = snap.users ?? []

  const byPhase = {}
  for (const p of projects) {
    const phase = stageByKey(p.currentStage)?.phase ?? 'Unknown'
    byPhase[phase] = (byPhase[phase] ?? 0) + 1
  }

  const overdue = projects.filter(p =>
    p.revisionDeadline && new Date(p.revisionDeadline) < Date.now() && p.currentStage !== 'ARCHIVED')

  const advisoryLoad = users
    .map(u => ({
      user: u,
      count: (snap.projectAssignments ?? []).filter(a => a.userId === u.id && a.roleType === 'Adviser').length,
      panels: (snap.projectAssignments ?? []).filter(a => a.userId === u.id && a.roleType.startsWith('Panel')).length,
    }))
    .filter(r => r.count || r.panels)
    .sort((a, b) => (b.count + b.panels) - (a.count + a.panels))

  const csv = () => {
    const header = 'Project,Programme,Stage,Status,Archive result'
    const lines = projects.map(p =>
      [p.title, p.program, stageByKey(p.currentStage)?.label, p.status, p.archiveResult ?? ''].map(v => `"${v ?? ''}"`).join(','))
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'capstone-projects.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Reporting</div>
        <h1>Programme reports</h1>
        <p className="lede">Project statuses, completion and faculty load across the School of Computing.</p>
      </header>

      <div className="stat-row">
        <div className="stat"><div className="n">{projects.length}</div><div className="label">Projects</div></div>
        <div className="stat"><div className="n">{projects.filter(p => p.currentStage === 'ARCHIVED').length}</div><div className="label">Archived</div></div>
        <div className="stat"><div className="n">{projects.filter(p => stageIndex(p.currentStage) >= stageIndex('IMPLEMENTATION') && p.currentStage !== 'ARCHIVED').length}</div><div className="label">In implementation</div></div>
        <div className="stat"><div className="n" style={{ color: overdue.length ? 'var(--stop)' : undefined }}>{overdue.length}</div><div className="label">Overdue revisions</div></div>
      </div>

      <Section title="Distribution by phase" aside={<button className="small" onClick={csv}>Export CSV</button>}>
        <table>
          <thead><tr><th>Phase</th><th className="tight">Projects</th><th>Share</th></tr></thead>
          <tbody>
            {Object.entries(byPhase).map(([phase, n]) => (
              <tr key={phase}>
                <td>{phase}</td>
                <td className="tight mono">{n}</td>
                <td>
                  <div style={{ background: 'var(--accent)', height: 7, borderRadius: 2, width: `${(n / projects.length) * 100}%`, minWidth: 6 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Current stage by project">
        <table>
          <thead><tr><th>Project</th><th>Programme</th><th>Stage</th><th className="tight">Result</th></tr></thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td className="small muted">{p.program}</td>
                <td><Badge>{stageByKey(p.currentStage)?.label}</Badge></td>
                <td className="tight">{p.archiveResult ? <Badge tone="ok">{p.archiveResult}</Badge> : <span className="faint small">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Faculty load">
        {advisoryLoad.length === 0 && <Empty>No assignments recorded.</Empty>}
        {advisoryLoad.length > 0 && (
          <table>
            <thead><tr><th>Faculty</th><th>Global role</th><th className="tight">Advisees</th><th className="tight">Panel seats</th></tr></thead>
            <tbody>
              {advisoryLoad.map(r => (
                <tr key={r.user.id}>
                  <td>{r.user.name}</td>
                  <td className="small muted">{r.user.globalRole}</td>
                  <td className="tight mono">{r.count}</td>
                  <td className="tight mono">{r.panels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
