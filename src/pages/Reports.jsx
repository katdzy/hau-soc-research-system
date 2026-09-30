import { useApp } from '../state/AppContext.jsx'
import { Section, Badge, Empty, Restricted, downloadCsv } from '../components/ui.jsx'
import { PHASES, stageByKey, stageIndex, sectionNow } from '../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, programCode } from '../domain/constants.js'
import { can, resolveInstitution } from '../domain/caac.js'

// Aggregate reporting. Figures cover projects the viewer may not be able to
// open — reports show counts and stages, never documents. A Program
// Chair/Coordinator's reports are scoped to the programs they coordinate.

/**
 * The projects a user's reports cover: school-wide for the Dean, Associate
 * Dean and System Administrator; the coordinated programs for a Program
 * Chair/Coordinator (NEW-11: counts and status only, never documents).
 */
export function reportScope(me, snap) {
  const schoolWide = (me.globalRoles ?? []).some(r => [G.DEAN, G.ASSOCIATE_DEAN, G.ADMIN].includes(r))
  const scope = schoolWide ? null : (me.programScope ?? [])
  return { scope, projects: (snap.projects ?? []).filter(p => !scope || scope.includes(p.program)) }
}

export default function Reports() {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  if (!can(inst, 'report.generate')) {
    return <Restricted>Reports are for the Dean, Associate Dean, Program Chair/Coordinator and System Administrator.</Restricted>
  }

  const { scope, projects } = reportScope(me, snap)
  const ids = new Set(projects.map(p => p.id))
  const assignments = (snap.projectAssignments ?? []).filter(a => ids.has(a.projectId))
  const users = snap.users ?? []

  const archived = projects.filter(p => p.currentStage === 'ARCHIVED')
  const inCapstone2 = projects.filter(p =>
    stageIndex(p.currentStage) >= stageIndex('IMPLEMENTATION') && p.currentStage !== 'ARCHIVED')
  const overdue = projects.filter(p => p.revisionDeadline && new Date(p.revisionDeadline) < Date.now())
  const completion = projects.length ? Math.round((archived.length / projects.length) * 100) : 0

  const byPhase = Object.values(PHASES).map(phase => ({
    phase, n: projects.filter(p => stageByKey(p.currentStage)?.phase === phase).length,
  }))

  const load = users
    .map(u => {
      const mine = assignments.filter(a => a.userId === u.id)
      const count = (...roles) => mine.filter(a => roles.includes(a.roleType)).length
      return {
        user: u,
        advisees: count(P.ADVISER),
        panels: count(P.PANEL_CHAIR, P.PANEL_MEMBER),
        instructing: count(P.INSTRUCTOR_1, P.INSTRUCTOR_2),
      }
    })
    .filter(r => r.advisees || r.panels || r.instructing)
    .sort((a, b) => (b.advisees + b.panels) - (a.advisees + a.panels))

  // Status data only — no document, annotation or summary content.
  const csv = () => downloadCsv(
    'capstone-projects.csv',
    ['Project', 'Program', 'Section', 'Course', 'Stage', 'Status', 'Result'],
    projects.map(p => [p.title, p.program, sectionNow(p).section, sectionNow(p).course, stageByKey(p.currentStage)?.label, p.status, p.archiveResult]),
  )

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Reports</div>
        <h1>{scope ? 'Program reports' : 'School of Computing reports'}</h1>
        <p className="lede">
          {scope
            ? `Scoped to the programs you coordinate: ${scope.map(programCode).join(', ')}.`
            : 'Project statuses, completion and faculty workload across the School of Computing.'}
        </p>
      </header>

      <div className="stat-row">
        <div className="stat"><div className="n">{projects.length}</div><div className="label">Projects</div></div>
        <div className="stat"><div className="n">{completion}%</div><div className="label">Completed</div></div>
        <div className="stat"><div className="n">{inCapstone2.length}</div><div className="label">In Capstone 2 or clearance</div></div>
        <div className="stat">
          <div className={`n${overdue.length ? ' is-stop' : ''}`}>{overdue.length}</div>
          <div className="label">Overdue revisions</div>
        </div>
      </div>

      <Section title="Projects by phase" aside={<button className="small" onClick={csv}>Export CSV</button>}>
        <table>
          <thead><tr><th>Phase</th><th className="tight">Projects</th><th>Share</th></tr></thead>
          <tbody>
            {byPhase.map(({ phase, n }) => (
              <tr key={phase}>
                <td>{phase}</td>
                <td className="tight mono">{n}</td>
                <td><div className="bar" style={{ width: `${projects.length ? (n / projects.length) * 100 : 0}%` }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Current stage by project">
        {projects.length === 0 && <Empty>No projects in scope.</Empty>}
        <div className="table-scroll"><table>
          <thead><tr><th>Project</th><th>Program</th><th>Stage</th><th className="tight">Result</th></tr></thead>
          <tbody>
            {[...projects].sort((a, b) => stageIndex(a.currentStage) - stageIndex(b.currentStage)).map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td className="small muted" title={p.program}>{programCode(p.program)}</td>
                <td><Badge>{stageByKey(p.currentStage)?.label}</Badge></td>
                <td className="tight">{p.archiveResult ? <Badge tone="ok">{p.archiveResult}</Badge> : <span className="faint small">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Section>

      <Section title="Faculty workload">
        {load.length === 0 && <Empty>No assignments recorded.</Empty>}
        {load.length > 0 && (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>Faculty</th><th>Global Roles</th>
                <th className="tight">Advisees</th><th className="tight">Panel seats</th><th className="tight">Instructing</th>
              </tr>
            </thead>
            <tbody>
              {load.map(r => (
                <tr key={r.user.id}>
                  <td>{r.user.name}</td>
                  <td className="small muted">{(r.user.globalRoles ?? []).join(', ') || '—'}</td>
                  <td className="tight mono">{r.advisees}</td>
                  <td className="tight mono">{r.panels}</td>
                  <td className="tight mono">{r.instructing}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}
