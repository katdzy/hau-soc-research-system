import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Section, Badge, Empty, Restricted, fmtDateTime } from '../components/ui.jsx'
import { can, resolveInstitution } from '../domain/caac.js'

export default function Audit() {
  const { snap, me } = useApp()
  const [query, setQuery] = useState('')
  if (!can(resolveInstitution(me, snap), 'audit.view')) {
    return <Restricted>The system activity log is read by the System Administrator.</Restricted>
  }
  const nameOf = (id) => id === 'system' ? 'System' : (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const show = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const titleOf = (id) => {
    const t = (snap.projects ?? []).find(p => p.id === id)?.title
    if (!t) return '—'
    return t.length > 46 ? `${t.slice(0, 45)}…` : t
  }

  // `{"from":"DEAN_APPROVAL","to":"ARCHIVED"}` is unreadable in a table cell.
  const detail = (meta) => Object.entries(meta ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('  ·  ')

  const rows = (snap.auditLogs ?? [])
    .filter(l => !query || l.action.toLowerCase().includes(query.toLowerCase()) ||
      nameOf(l.actorId).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.at) - new Date(a.at))

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Audit</div>
        <h1>Audit trail</h1>
        <p className="lede">
          Write-once. An entry is added for every state change and is never updated or deleted,
          so every approval, signature and stage change traces back to the account that made it.
        </p>
      </header>

      <Section
        title={`${rows.length} entries`}
        aside={<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by action or actor" aria-label="Filter audit entries" style={{ width: 240 }} />}
      >
        {rows.length === 0 && <Empty>No audit entries yet.</Empty>}
        {rows.length > 0 && (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th className="tight">When</th><th className="tight">Action</th>
                <th className="tight">Actor · role hat</th><th className="tight">Project</th>
                <th className="tight">Entity</th><th>Before → after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="tight mono faint" style={{ fontSize: 11.5 }}>{fmtDateTime(l.at)}</td>
                  <td className="tight"><Badge>{l.action}</Badge></td>
                  <td className="tight small">{nameOf(l.actorId)}<div className="faint">{l.hat ?? '—'}</div></td>
                  <td className="tight small muted">{l.projectId ? titleOf(l.projectId) : '—'}</td>
                  <td className="tight mono faint" style={{ fontSize: 11.5 }}>{l.entityType}/{l.entityId}</td>
                  <td className="mono faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {show(l.before)} → {show(l.after)}
                    {detail(l.meta) && <div>{detail(l.meta)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}
