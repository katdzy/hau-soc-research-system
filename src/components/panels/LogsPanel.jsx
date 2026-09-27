import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { inCapstone1 } from '../../domain/contexts.js'
import { Section, Empty, Badge, fmtDate } from '../ui.jsx'
import { FORMS } from '../../domain/constants.js'

// Read view of the group's FM-AAC-SOC-2003 record for the project workspace.
// Students log from Weekly Logs and the Adviser signs from Weekly Log
// Sign-off; both open only in Capstone 2.

const LOG_TONE = { Approved: 'ok', Submitted: 'warn', Returned: 'stop' }

export default function LogsPanel({ b, ctx }) {
  const { snap } = useApp()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const approved = b.weeklyLogs.filter(l => l.status === 'Approved').length

  if (inCapstone1(b.project)) {
    return <Empty>Weekly logs unlock in Capstone 2, when the group moves to Implementation.</Empty>
  }

  function exportLogs() {
    const header = ['Week', 'Consultation', 'Mode', 'Submitted by', 'Accomplishments', 'Next week', 'Status', 'Signed by', 'Signed on', 'Adviser remarks']
    const rows = b.weeklyLogs.map(l => [
      l.weekNo, fmtDate(l.consultationDate), l.consultationMode, nameOf(l.submittedBy), l.accomplishments, l.nextTasks,
      l.status, l.signedBy ? nameOf(l.signedBy) : '', l.signedAt ? fmtDate(l.signedAt) : '', l.adviserRemarks,
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${FORMS.F2003.code}-${b.project.groupName.replace(/\s+/g, '')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Section
      title={`Weekly logs — ${FORMS.F2003.code}`}
      aside={
        <span className="inline">
          <span className="faint small">{approved} signed of {b.weeklyLogs.length}</span>
          {can(ctx, 'weeklylog.export') && b.weeklyLogs.length > 0 && <button className="small" onClick={exportLogs}>Export</button>}
        </span>
      }
    >
      {b.weeklyLogs.length === 0 && <Empty>No logs submitted yet.</Empty>}
      {[...b.weeklyLogs].reverse().map(l => (
        <div className="entry" key={l.id}>
          <div className="entry-head">
            <strong style={{ fontSize: 13 }}>Week {l.weekNo}</strong>
            <Badge tone={LOG_TONE[l.status]}>{l.status}</Badge>
          </div>
          <div className="faint small">
            Consultation {fmtDate(l.consultationDate)} · {l.consultationMode} · submitted by {nameOf(l.submittedBy)}
          </div>
          <p className="small" style={{ margin: '8px 0 0' }}>{l.accomplishments}</p>
          {l.nextTasks && <p className="small muted" style={{ margin: '4px 0 0' }}>Next week: {l.nextTasks}</p>}
          {(l.signedAt || l.adviserRemarks) && (
            <div className="small muted" style={{ marginTop: 8 }}>
              {l.signedAt ? `Signed by ${nameOf(l.signedBy)} on ${fmtDate(l.signedAt)}` : 'Returned by the Adviser'}
              {l.adviserRemarks && <> — “{l.adviserRemarks}”</>}
            </div>
          )}
        </div>
      ))}
    </Section>
  )
}
