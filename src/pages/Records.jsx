import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { resolveInstitution, can } from '../domain/caac.js'
import { Section, Empty, Badge, Restricted, fmtDate } from '../components/ui.jsx'
import { ExportMenu } from '../components/Export.jsx'
import { PROGRAMS, programCode, PROJECT_ROLES as P } from '../domain/constants.js'

// The records-table archive: cleared projects, searchable and filterable by
// the Dean and Associate Dean, managed by the System Administrator. It holds a
// Pass result, never a grade, and is not public. Every other registered user
// browses the same list as metadata only (Figma S-17, `archive.browse`):
// title, members, program, adviser and year — no record link, no result.

export default function Records() {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [program, setProgram] = useState('')
  const [term, setTerm] = useState('')

  const archived = (snap.projects ?? []).filter(p => p.currentStage === 'ARCHIVED')
  const terms = useMemo(() => [...new Set(archived.map(p => p.term))], [archived])
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const adviserOf = (p) => nameOf((snap.projectAssignments ?? []).find(a => a.projectId === p.id && a.roleType === P.ADVISER)?.userId)
  const membersOf = (p) => (snap.projectMembers ?? []).filter(m => m.projectId === p.id).map(m => nameOf(m.userId))

  const full = can(inst, 'records.search') || can(inst, 'records.manage')
  if (!full && !can(inst, 'archive.browse')) {
    return <Restricted>The archive is open to every active, verified account.</Restricted>
  }
  const yearOf = (p) => (p.archivedAt ? new Date(p.archivedAt).getFullYear() : '—')

  const q = query.trim().toLowerCase()
  const rows = archived.filter(p =>
    (!program || p.program === program) &&
    (!term || p.term === term) &&
    (!q || [p.title, p.researchArea, adviserOf(p), ...membersOf(p)].some(v => v?.toLowerCase().includes(q))))

  // The record, never its manuscript: no abstract, document or annotation text.
  const exportRows = full
    ? {
        name: 'records-archive',
        title: 'Archive — completed projects',
        header: ['Project', 'Program', 'Research area', 'Term', 'Adviser', 'Students', 'Archived', 'Result'],
        rows: rows.map(p => [p.title, p.program, p.researchArea, p.term, adviserOf(p), membersOf(p).join('; '), fmtDate(p.archivedAt), p.archiveResult]),
      }
    : {
        name: 'archive',
        title: 'Archive — completed projects',
        header: ['Title', 'Group members', 'Program', 'Adviser', 'Year'],
        rows: rows.map(p => [p.title, membersOf(p).join('; '), p.program, adviserOf(p), yearOf(p)]),
      }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Archive</h1>
        <p className="lede">
          {full
            ? 'Projects that cleared URO verification and final approval. Each carries a Pass result — the system does not compute or store grades.'
            : 'Completed thesis and capstone projects. Metadata only — visible to every registered user.'}
        </p>
      </header>

      <div className="filters">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search title, research area, adviser or student" aria-label="Search records" />
        <select value={program} onChange={e => setProgram(e.target.value)} aria-label="Program">
          <option value="">All programs</option>
          {PROGRAMS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={term} onChange={e => setTerm(e.target.value)} aria-label="Academic term">
          <option value="">All terms</option>
          {terms.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <Section
        title={`${rows.length} of ${archived.length} records`}
        aside={rows.length > 0 && <ExportMenu {...exportRows} />}
      >
        {rows.length === 0 && <Empty>No archived projects match.</Empty>}
        {rows.length > 0 && !full && (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Title</th><th>Group members</th><th>Program</th><th>Adviser</th><th className="tight">Year</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td className="card-title">{p.title}<div className="faint small">{p.researchArea}</div></td>
                  <td className="small" data-label="Members">{membersOf(p).join(', ')}</td>
                  <td className="small muted" data-label="Program" title={p.program}>
                    <span className="card-long">{p.program}</span><span className="card-short">{programCode(p.program)}</span>
                  </td>
                  <td className="small" data-label="Adviser">{adviserOf(p)}</td>
                  <td className="tight small faint" data-label="Year">{yearOf(p)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {rows.length > 0 && full && (
          <div className="table-scroll"><table className="cards">
            <thead>
              <tr>
                <th>Project</th><th>Program</th><th>Adviser</th><th>Term</th>
                <th className="tight">Archived</th><th className="tight">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td>
                    <Link className="row-link" to={`/projects/${p.id}`}>{p.title}</Link>
                    <div className="faint small">{p.researchArea} · {membersOf(p).join(', ')}</div>
                  </td>
                  <td className="small muted" data-label="Program" title={p.program}>
                    <span className="card-long">{p.program}</span><span className="card-short">{programCode(p.program)}</span>
                  </td>
                  <td className="small" data-label="Adviser">{adviserOf(p)}</td>
                  <td className="small muted" data-label="Term">{p.term}</td>
                  <td className="tight small faint" data-label="Archived">{fmtDate(p.archivedAt)}</td>
                  <td className="tight card-status"><Badge tone="ok">{p.archiveResult}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}
