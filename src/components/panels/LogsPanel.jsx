import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/cac.js'
import { submitWeeklyLog, signWeeklyLog } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDate } from '../ui.jsx'
import { FORMS } from '../../domain/constants.js'

export default function LogsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [activities, setActivities] = useState('')
  const [remarks, setRemarks] = useState({})
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id

  return (
    <>
      <Section
        title={`Weekly accomplishment logs — ${FORMS.F2003.code}`}
        aside={<span className="faint small">{b.weeklyLogs.filter(l => l.status === 'Signed').length} signed of {b.weeklyLogs.length}</span>}
      >
        {b.weeklyLogs.length === 0 && <Empty>No logs submitted yet.</Empty>}
        {b.weeklyLogs.map(l => (
          <div className="entry" key={l.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>Week {l.weekNo}</strong>
              <Badge tone={l.status === 'Signed' ? 'ok' : 'warn'}>{l.status}</Badge>
            </div>
            <div className="faint small">
              {fmtDate(l.periodStart)} – {fmtDate(l.periodEnd)} · submitted by {nameOf(l.submittedBy)}
            </div>
            <p className="small" style={{ margin: '7px 0 0' }}>{l.activities}</p>

            {l.status === 'Signed' && (
              <div className="small muted" style={{ marginTop: 7 }}>
                Signed by {nameOf(l.signedBy)} on {fmtDate(l.signedAt)}
                {l.adviserRemarks && <> — “{l.adviserRemarks}”</>}
              </div>
            )}

            {l.status === 'Submitted' && can(ctx, 'weeklylog.sign') && (
              <div style={{ marginTop: 10 }}>
                <Field label="Adviser remarks">
                  <input value={remarks[l.id] ?? ''} onChange={e => setRemarks(r => ({ ...r, [l.id]: e.target.value }))} />
                </Field>
                <button className="primary" disabled={busy}
                  onClick={() => run(() => signWeeklyLog(me, snap, b.project.id, l.id, remarks[l.id]))}>
                  Sign log
                </button>
              </div>
            )}
          </div>
        ))}
        <ActionError error={error} />
      </Section>

      {can(ctx, 'weeklylog.submit') && (
        <Section title="Submit this week's log">
          <Field label="Activities and accomplishments">
            <textarea value={activities} onChange={e => setActivities(e.target.value)}
              placeholder="What the group completed this week, blockers, and what is planned next." />
          </Field>
          <button className="primary" disabled={busy || !activities}
            onClick={() => run(async () => {
              await submitWeeklyLog(me, snap, b.project.id, { activities })
              setActivities('')
            })}>
            Submit for adviser signature
          </button>
          <ActionError error={error} />
        </Section>
      )}
    </>
  )
}
