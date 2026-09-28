import { useApp } from '../state/AppContext.jsx'
import { Section, Badge, Empty, Restricted } from '../components/ui.jsx'
import { PHASES, stageByKey, stageIndex } from '../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../domain/constants.js'
import { can, resolveInstitution } from '../domain/caac.js'

// Aggregate reporting. Figures cover projects the viewer may not be able to
// open — reports show counts and stages, never documents. A Program
// Chair/Coordinator's reports are scoped to the programs they coordinate.

export default function Reports() {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  if (!can(inst, 'report.generate')) {
    return <Restricted>Reports are for the Dean, Associate Dean, Program Chair/Coordinator and System Administrator.</Restricted>
  }

  const schoolWide = (me.globalRoles ?? []).some(r => [G.DEAN, G.ASSOCIATE_DEAN, G.ADMIN].includes(r))
  const scope = schoolWide ? null : (me.programScope ?? [])
  const projects = (snap.projects ?? []).filter(p => !scope || scope.includes(p.program))
  const ids = new Set(projects.map(p => p.id))
  const assignments = (snap.projectAssignments ?? []).filter(a => ids.has(a.projectId))
  const members = (snap.projectMembers ?? []).filter(m => ids.has(m.projectId))
  const users = snap.users ?? []

  const archived = projects.filter(p => p.currentStage === 'ARCHIVED')
  const inCapstone2 = projects.filter(p =>
    stageIndex(p.currentStage) >= stageIndex('IMPLEMENTATION') && p.currentStage !== 'ARCHIVED')
  const overdue = projects.filter(p => p.revisionDeadline && new Date(p.revisionDeadline) < Date.now())

  // Student Roster Export Data
  const studentRoster = members.map(m => {
    const studentUser = users.find(u => u.id === m.userId)
    const project = projects.find(p => p.id === m.projectId)
    const adviserAssignment = assignments.find(a => a.projectId === m.projectId && a.roleType === P.ADVISER && a.status !== 'Declined')
    const adviserUser = adviserAssignment ? users.find(u => u.id === adviserAssignment.userId) : null

    return {
      studentName: studentUser?.name ?? m.userId,
      studentId: studentUser?.idNumber ?? '—',
      email: studentUser?.email ?? '—',
      program: studentUser?.program || project?.program || '—',
      block: studentUser?.block || project?.block || '—',
      projectTitle: project?.title ?? '—',
      adviser: adviserUser?.name ?? 'Not Assigned',
      stage: stageByKey(project?.currentStage)?.label ?? '—',
    }
  }).sort((a, b) => a.studentName.localeCompare(b.studentName))

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
    .filter(r => r.advisees || r.panels || r.instructing || (r.user.globalRoles ?? []).length > 0)
    .sort((a, b) => (b.advisees + b.panels) - (a.advisees + a.panels))

  // Export CSV Helper
  const downloadCsv = (filename, headerStr, rowsArr) => {
    const content = [headerStr, ...rowsArr].join('\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const exportProjectsCsv = () => {
    const header = 'Project Title,Program,Block,Stage,Status,Archive Result'
    const lines = projects.map(p =>
      [p.title, p.program, p.block, stageByKey(p.currentStage)?.label, p.status, p.archiveResult ?? '']
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    downloadCsv('capstone-projects-report.csv', header, lines)
  }

  const exportRosterCsv = () => {
    const header = 'Student Name,Student ID,Email,Program,Block,Project Title,Adviser,Stage'
    const lines = studentRoster.map(s =>
      [s.studentName, s.studentId, s.email, s.program, s.block, s.projectTitle, s.adviser, s.stage]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    downloadCsv('student-roster-report.csv', header, lines)
  }

  const exportFacultyCsv = () => {
    const header = 'Faculty Name,Email,Global Roles,Advisees Count,Panel Seats Count,Instructing Count'
    const lines = load.map(r =>
      [r.user.name, r.user.email, (r.user.globalRoles ?? []).join('; '), r.advisees, r.panels, r.instructing]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    downloadCsv('faculty-workload-report.csv', header, lines)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Reports &amp; Export Center</div>
        <h1>{scope ? 'Program Reports' : 'School of Computing Reports'}</h1>
        <p className="lede">
          {scope
            ? `Exportable roster, status, and workload records scoped to ${scope.join(', ')}.`
            : 'Exportable student rosters, project group statuses, and faculty workload listings across HAU-SOC.'}
        </p>
      </header>

      <div className="stat-row">
        <div className="stat"><div className="n">{projects.length}</div><div className="label">Total Projects</div></div>
        <div className="stat"><div className="n">{studentRoster.length}</div><div className="label">Enrolled Students</div></div>
        <div className="stat"><div className="n">{inCapstone2.length}</div><div className="label">In Capstone 2</div></div>
        <div className="stat">
          <div className={`n${overdue.length ? ' is-stop' : ''}`}>{overdue.length}</div>
          <div className="label">Overdue Revisions</div>
        </div>
      </div>

      {/* Student Roster Report */}
      <Section title={`Student & Project Group Roster (${studentRoster.length})`} aside={<button className="small primary" onClick={exportRosterCsv}>Export Roster CSV</button>}>
        <p className="small muted" style={{ marginBottom: 12 }}>
          List of all research students, their assigned project group title, program, block, and assigned adviser.
        </p>
        {studentRoster.length === 0 && <Empty>No student records in scope.</Empty>}
        {studentRoster.length > 0 && (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Program &amp; Block</th>
                <th>Project Group Title</th>
                <th>Adviser</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {studentRoster.map((s, idx) => (
                <tr key={idx}>
                  <td>
                    <div><strong>{s.studentName}</strong></div>
                    <div className="mono faint" style={{ fontSize: 11 }}>{s.email}</div>
                  </td>
                  <td className="small muted">{s.program} · {s.block}</td>
                  <td className="small">{s.projectTitle}</td>
                  <td className="small muted">{s.adviser}</td>
                  <td><Badge>{s.stage}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>

      {/* Project Statuses Report */}
      <Section title={`Project Group Statuses (${projects.length})`} aside={<button className="small" onClick={exportProjectsCsv}>Export Projects CSV</button>}>
        {projects.length === 0 && <Empty>No projects in scope.</Empty>}
        {projects.length > 0 && (
          <div className="table-scroll"><table>
            <thead><tr><th>Project Group Title</th><th>Program &amp; Block</th><th>Current Stage</th><th className="tight">Result</th></tr></thead>
            <tbody>
              {[...projects].sort((a, b) => stageIndex(a.currentStage) - stageIndex(b.currentStage)).map(p => (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong></td>
                  <td className="small muted">{p.program} · {p.block}</td>
                  <td><Badge>{stageByKey(p.currentStage)?.label}</Badge></td>
                  <td className="tight">{p.archiveResult ? <Badge tone="ok">{p.archiveResult}</Badge> : <span className="faint small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>

      {/* Faculty Workload Report */}
      <Section title="Faculty Workload &amp; Assignments" aside={<button className="small" onClick={exportFacultyCsv}>Export Faculty CSV</button>}>
        {load.length === 0 && <Empty>No assignments recorded.</Empty>}
        {load.length > 0 && (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>Faculty Member</th>
                <th>Global Roles</th>
                <th className="tight">Advisees</th>
                <th className="tight">Panel Seats</th>
                <th className="tight">Instructing</th>
              </tr>
            </thead>
            <tbody>
              {load.map(r => (
                <tr key={r.user.id}>
                  <td><strong>{r.user.name}</strong></td>
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
