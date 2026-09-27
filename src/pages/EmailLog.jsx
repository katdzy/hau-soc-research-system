import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { resolveInstitution, can } from '../domain/caac.js'
import { Section, Badge, Empty, Restricted, fmtDateTime } from '../components/ui.jsx'
import { EmailPreview } from '../components/blocks.jsx'

// The send record for workflow email. There are no in-system notifications —
// recipients get email only. This log exists so the System Administrator can
// show which events sent what, to whom, and when.

export default function EmailLog() {
  const { snap, me } = useApp()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)
  if (!can(resolveInstitution(me, snap), 'audit.view')) {
    return <Restricted>The email log is read by the System Administrator.</Restricted>
  }

  const users = snap.users ?? []
  const who = (id) => users.find(u => u.id === id)
  const groupOf = (id) => (snap.projects ?? []).find(p => p.id === id)?.groupName ?? '—'
  const q = query.trim().toLowerCase()
  const rows = (snap.emails ?? [])
    .filter(e => !q || [e.subject, e.template, who(e.userId)?.name, who(e.userId)?.email].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">System Administrator</div>
        <h1>Email log</h1>
        <p className="lede">
          Every workflow email sent through Resend. Users are never notified inside the system — this is the
          delivery record, readable here only.
        </p>
      </header>
      <Section title={`${rows.length} emails`}
        aside={<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by subject, type or recipient" aria-label="Filter emails" style={{ width: 280 }} />}>
        {rows.length === 0 && <Empty>No emails sent yet.</Empty>}
        {rows.length > 0 && (
          <div className="table-scroll"><table>
            <thead><tr><th className="tight">Sent</th><th>To</th><th>Subject</th><th className="tight">Type</th><th className="tight">Group</th></tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td className="tight small faint">{fmtDateTime(e.sentAt)}</td>
                  <td className="small">{who(e.userId)?.name}<div className="mono faint" style={{ fontSize: 11.5 }}>{who(e.userId)?.email}</div></td>
                  <td className="small">
                    <button className="link" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>{e.subject}</button>
                    {open === e.id && <EmailPreview email={e} recipients={who(e.userId)?.email} />}
                  </td>
                  <td className="tight"><Badge>{e.template}</Badge></td>
                  <td className="tight small muted">{groupOf(e.projectId)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}
