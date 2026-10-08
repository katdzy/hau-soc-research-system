import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { submitWeeklyLog, decideWeeklyLog } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDate } from '../ui.jsx'
import { FORMS } from '../../domain/constants.js'

const LOG_TONE = { Approved: 'ok', Submitted: 'warn', Returned: 'stop' }

export default function LogsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [activities, setActivities] = useState('')
  const [remarks, setRemarks] = useState({})
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const approved = b.weeklyLogs.filter(l => l.status === 'Approved').length

  // FM-AAC-SOC-2003 export — supporting document for the separate URO
  // co-authorship process, which itself is out of scope.
  function exportLogs() {
    const header = ['Week', 'Period', 'Submitted by', 'Activities', 'Status', 'Signed by', 'Signed on', 'Adviser remarks']
    const rows = b.weeklyLogs.map(l => [
      l.weekNo, `${fmtDate(l.periodStart)} – ${fmtDate(l.periodEnd)}`, nameOf(l.submittedBy), l.activities,
      l.status, l.signedBy ? nameOf(l.signedBy) : '', l.signedAt ? fmtDate(l.signedAt) : '', l.adviserRemarks,
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${FORMS.F2003.code}-${b.project.id}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Section
        title={`Weekly logs — ${FORMS.F2003.code}`}
        aside={
          <span className="inline">
            <span className="faint small">{approved} approved of {b.weeklyLogs.length}</span>
            {can(ctx, 'weeklylog.export') && b.weeklyLogs.length > 0 &&
              <button className="small" onClick={exportLogs}>Export</button>}
          </span>
        }
      >
        {b.weeklyLogs.length === 0 && <Empty>No logs submitted yet. Logs start in Capstone 2.</Empty>}
        {b.weeklyLogs.map(l => (
          <div className="entry" key={l.id}>
            <div className="entry-head">
              <strong className="text-sm">Week {l.weekNo}</strong>
              <Badge tone={LOG_TONE[l.status]}>{l.status}</Badge>
            </div>
            <div className="faint small">
              {fmtDate(l.periodStart)} – {fmtDate(l.periodEnd)} · submitted by {nameOf(l.submittedBy)}
            </div>
            <p className="small m-0 mt-1">{l.activities}</p>

            {l.status !== 'Submitted' && (l.signedAt || l.adviserRemarks) && (
              <div className="small muted mt-1">
                {l.signedAt ? `Signed by ${nameOf(l.signedBy)} on ${fmtDate(l.signedAt)}` : 'Returned by the Adviser'}
                {l.adviserRemarks && <> — “{l.adviserRemarks}”</>}
              </div>
            )}

            {l.status === 'Submitted' && can(ctx, 'weeklylog.sign') && (
              <div className="subform">
                <Field label="Adviser remarks">
                  <input value={remarks[l.id] ?? ''} onChange={e => setRemarks(r => ({ ...r, [l.id]: e.target.value }))} />
                </Field>
                <div className="actions">
                  <button className="primary" disabled={busy}
                    onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: true, remarks: remarks[l.id] }))}>
                    Approve and sign
                  </button>
                  <button disabled={busy || !remarks[l.id]}
                    onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: false, remarks: remarks[l.id] }))}>
                    Return with remarks
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <ActionError error={error} />
      </Section>

      {can(ctx, 'weeklylog.submit') && (
        <Section title="Submit this week’s log">
          <Field label="Accomplishments">
            <textarea value={activities} onChange={e => setActivities(e.target.value)}
              placeholder="What the group completed this week, what blocked you, and what comes next." />
          </Field>
          <button className="primary" disabled={busy || !activities}
            onClick={() => run(async () => {
              await submitWeeklyLog(me, snap, b.project.id, { activities })
              setActivities('')
            })}>
            Submit to the Adviser
          </button>
        </Section>
      )}
    </>
  )
}
