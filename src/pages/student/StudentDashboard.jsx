import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup, progressTrail, studentChecklist, nextDeadline, currentVersion, nextGate, phaseLabel } from '../../services/views.js'
import { PageHead, Chip, ProgressTrail, Checklist, DeadlineTile, StatTile, Empty } from '../../components/blocks.jsx'
import { stageLabel } from '../../domain/stages.js'
import { inCapstone1 } from '../../domain/contexts.js'
import { PROJECT_ROLES as P, PANEL_ROLES } from '../../domain/constants.js'

// Wireframe S-02, with the changes asked for: pending tasks are a checklist,
// the deadline reads "days before deadline", a progress trail replaces the
// bare stepper, and the weekly-log tile appears only once Capstone 2 starts.

export default function StudentDashboard() {
  const { snap, me } = useApp()
  const b = myGroup(snap, me)
  if (!b) {
    return (
      <div className="page">
        <PageHead title="Dashboard" />
        <Empty title="You are not in a project group yet">
          Instructor 1 adds students to groups from the block roster — students do not form their own.
          This page fills in once you are added.
        </Empty>
      </div>
    )
  }

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name
  const who = (role) => b.assignments.filter(a => a.roleType === role).map(a => nameOf(a.userId)).join(', ')
  const panel = PANEL_ROLES.flatMap(r => b.assignments.filter(a => a.roleType === r)).map(a => nameOf(a.userId))
  const current = currentVersion(b)
  const capstone2 = !inCapstone1(b.project)
  const approvedLogs = b.weeklyLogs.filter(l => l.status === 'Approved').length

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        lede={`${b.project.groupName} · ${b.project.program} · ${phaseLabel(b)}, ${b.project.term}`}
      />

      <section className="panel project-card">
        <div className="project-card-head">
          <div>
            <h2 className="project-title">{b.project.title}</h2>
            <div className="chips">
              <Chip>Stage: {stageLabel(b.project.currentStage)}</Chip>
              {current && <Chip>Version: {current.docType} v{current.versionNumber} (current)</Chip>}
              <Chip>Next gate: {nextGate(b)}</Chip>
            </div>
          </div>
          <div className="stack-actions">
            <Link className="btn primary" to="/project">Open project</Link>
            <Link className="btn" to="/submit">Submit document</Link>
          </div>
        </div>
        <dl className="people">
          <div><dt>Adviser</dt><dd>{who(P.ADVISER) || <span className="faint">Not yet assigned</span>}</dd></div>
          <div><dt>Instructor 1</dt><dd>{who(P.INSTRUCTOR_1) || '—'}</dd></div>
          {capstone2 && <div><dt>Instructor 2</dt><dd>{who(P.INSTRUCTOR_2) || <span className="faint">Not yet assigned</span>}</dd></div>}
          <div><dt>Panel</dt><dd>{panel.length ? panel.join(', ') : <span className="faint">Not yet assigned</span>}</dd></div>
        </dl>
        <ProgressTrail trail={progressTrail(b, snap)} />
      </section>

      <div className="dash-grid">
        <Checklist items={studentChecklist(b)} title="What’s next" />
        <div className="dash-side">
          <DeadlineTile deadline={nextDeadline(b)} />
          {capstone2 && (
            <StatTile
              label="Weekly logs signed"
              value={`${approvedLogs} / ${b.weeklyLogs.length}`}
              note={<Link to="/logs">Open weekly logs</Link>}
            />
          )}
        </div>
      </div>
    </div>
  )
}
