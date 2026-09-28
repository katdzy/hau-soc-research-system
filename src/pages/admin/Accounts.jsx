import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { Restricted } from '../../components/ui.jsx'
import { PROGRAMS } from '../../domain/constants.js'
import { resolveInstitution, can } from '../../domain/caac.js'
import {
  facultyOf, studentsOf, matching, roleIndex, plural, Person, Status, GlobalTags, ProjectTags,
} from './shared.jsx'

// Account categories — one per degree program, then faculty. PROGRAMS keeps
// the order these are listed in.
const COURSES = [
  { key: 'WD', program: PROGRAMS[0], name: 'Bachelor of Science IT in area of specialization in Web Development' },
  { key: 'NW', program: PROGRAMS[1], name: 'Bachelor of Science IT in area of specialization in Network Administrator' },
  { key: 'CS', program: PROGRAMS[2], name: 'Bachelor of Science in Computer Science' },
  { key: 'EMC', program: PROGRAMS[3], name: 'Bachelor of Science in Entertainment and Multimedia Computing' },
  { key: 'CYB', program: PROGRAMS[4], name: 'Bachelor of Science in Cybersecurity' },
  { key: 'Faculty', program: null, name: 'Faculty' },
]

/** Every registered account, by course. Read-only — tags are changed on the CAAC page. */
export default function Accounts() {
  const { snap, me, resetDemoData } = useApp()
  const { run, error, busy } = useAction()
  const [query, setQuery] = useState('')
  const [course, setCourse] = useState(COURSES[0].key)

  if (!can(resolveInstitution(me, snap), 'admin.accounts')) {
    return <Restricted>Account administration belongs to the System Administrator.</Restricted>
  }

  const users = snap.users ?? []
  const faculty = facultyOf(users)
  const students = studentsOf(users)
  const inCourse = (c) => c.program ? students.filter(u => u.program === c.program) : faculty
  const current = COURSES.find(c => c.key === course)
  const isFaculty = !current.program
  const shown = inCourse(current).filter(matching(query))
    .sort((a, b) => (a.block ?? '').localeCompare(b.block ?? '') || a.name.localeCompare(b.name))
  const cols = isFaculty ? 4 : 5
  const { blocksOf, holdingsOf } = roleIndex(snap)

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Administration</div>
        <h1>Accounts</h1>
        <p className="lede">
          Every registered account, by course. Roles are changed on the CAAC page. This role has no
          manuscript or workflow access.
        </p>
      </header>

      <div className="admin-toolbar">
        <div className="chip-group" role="group" aria-label="Course">
          {COURSES.map(c => {
            const n = inCourse(c).length
            const on = course === c.key
            return (
              <button key={c.key} type="button" className={`chip${on ? ' is-on' : ''}`}
                aria-pressed={on} title={c.program ? c.name : undefined}
                aria-label={`${c.program ? `${c.name} (${c.key})` : c.name}, ${plural(n, 'account')}`}
                onClick={() => setCourse(c.key)}>
                {c.key} <span className="chip-n">{n}</span>
              </button>
            )
          })}
        </div>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search name or email" aria-label="Search accounts" />
      </div>
      <p className="course-name">
        {current.name}{current.program && <span className="faint"> ({current.key})</span>}
      </p>

      <div className="table-scroll"><table className="accounts">
        <thead>
          {isFaculty ? (
            <tr><th>Faculty</th><th>Global roles</th><th>Project roles</th><th className="tight">Status</th></tr>
          ) : (
            <tr><th>Student</th><th className="tight">ID</th><th className="tight">Block</th><th className="tight">Year</th><th className="tight">Status</th></tr>
          )}
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr><td colSpan={cols} className="empty-cell">
              {query.trim() ? `No account here matches “${query}”.` : 'No accounts yet.'}
            </td></tr>
          )}
          {shown.map(u => (
            <tr key={u.id}>
              <td><Person user={u} /></td>
              {isFaculty ? (
                <>
                  <td><GlobalTags user={u} /></td>
                  <td><ProjectTags blocks={blocksOf(u.id)} byRole={holdingsOf(u.id)} /></td>
                </>
              ) : (
                <>
                  <td className="tight mono">{u.idNumber || '—'}</td>
                  <td className="tight mono">{u.block || '—'}</td>
                  <td className="tight small muted">{u.yearLevel || '—'}</td>
                </>
              )}
              <td className="tight"><Status status={u.status} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <footer className="admin-foot">
        <p className="faint small">Prototype data — restores the demo projects to their starting stages and discards anything created since.</p>
        <button type="button" className="small danger" disabled={busy} onClick={() => run(resetDemoData)}>Reset demo data</button>
      </footer>
      <ActionError error={error} />
    </div>
  )
}
