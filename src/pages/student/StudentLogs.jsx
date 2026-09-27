import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup } from '../../services/views.js'
import { submitWeeklyLog } from '../../services/actions.js'
import { resolveContext, can } from '../../domain/caac.js'
import { inCapstone1 } from '../../domain/contexts.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, Empty } from '../../components/blocks.jsx'
import { Field, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import { FORMS, CONSULTATION_MODES, PROJECT_ROLES as P } from '../../domain/constants.js'

// Wireframe S-06. The Attendance Monitoring and Activity Sheet belongs to
// Capstone 2: through Capstone 1 the page is locked, and it opens when the
// group moves to Implementation.

const today = () => new Date().toISOString().slice(0, 10)

export default function StudentLogs() {
  const { snap, me } = useApp()
  const b = myGroup(snap, me)
  const [form, setForm] = useState({ consultationDate: today(), consultationMode: CONSULTATION_MODES[0], accomplishments: '', nextTasks: '' })
  const [openLog, setOpenLog] = useState(null)
  const { run, error, busy } = useAction()
  if (!b) return <div className="page"><PageHead title="Weekly accomplishment report" /><Empty>You are not in a project group yet.</Empty></div>

  const lede = `Attendance Monitoring and Activity Sheet (${FORMS.F2003.code}) · submitted weekly and digitally signed by the Adviser`
  if (inCapstone1(b.project)) {
    return (
      <div className="page">
        <PageHead title="Weekly accomplishment report" lede={lede} />
        <Empty title="Unlocks in Capstone 2">
          Weekly logs start once your group moves to Implementation, after the proposal defense and its revisions.
        </Empty>
      </div>
    )
  }

  const ctx = resolveContext(me, b)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const adviser = nameOf(b.assignments.find(a => a.roleType === P.ADVISER)?.userId)
  const logs = [...b.weeklyLogs].reverse()
  const last = b.weeklyLogs.at(-1)
  const nextWeek = last?.status === 'Returned' ? last.weekNo : (last?.weekNo ?? 0) + 1
  const approved = b.weeklyLogs.filter(l => l.status === 'Approved').length
  const pending = b.weeklyLogs.filter(l => l.status === 'Submitted').at(-1)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page">
      <PageHead title="Weekly accomplishment report" lede={lede} />
      <div className="two-col wide-left">
        {can(ctx, 'weeklylog.submit') ? (
          <form className="panel" onSubmit={e => e.preventDefault()} noValidate>
            <div className="row">
              <Field label="Week"><input value={`Week ${nextWeek}${last?.status === 'Returned' ? ' (resubmission)' : ''}`} readOnly /></Field>
              <Field label="Consultation date"><input type="date" value={form.consultationDate} onChange={set('consultationDate')} /></Field>
              <Field label="Mode of consultation">
                <select value={form.consultationMode} onChange={set('consultationMode')}>
                  {CONSULTATION_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            {last?.status === 'Returned' && (
              <p className="note small">Week {last.weekNo} was returned: “{last.adviserRemarks}”</p>
            )}
            <Field label="Accomplishments this week"><textarea rows={5} value={form.accomplishments} onChange={set('accomplishments')} /></Field>
            <Field label="Tasks for next week"><textarea rows={4} value={form.nextTasks} onChange={set('nextTasks')} /></Field>
            <button className="primary" type="button" disabled={busy || !form.accomplishments.trim()}
              onClick={() => run(async () => {
                await submitWeeklyLog(me, snap, b.project.id, form)
                setForm(f => ({ ...f, accomplishments: '', nextTasks: '' }))
              })}>
              Submit week {nextWeek} log
            </button>
            <ActionError error={error} />
          </form>
        ) : (
          <Empty title="Logging is closed">Weekly logs are submitted during Implementation. Your record stays here.</Empty>
        )}

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Adviser sign-off</h2></div>
            {pending ? (
              <div className="dashed small">
                <strong>Awaiting Adviser signature</strong>
                <div className="faint">{adviser} · Week {pending.weekNo} · not yet signed</div>
              </div>
            ) : <p className="small muted">Nothing waiting on the Adviser.</p>}
            <p className="small" style={{ marginTop: 12 }}>Weeks signed: {approved} of {b.weeklyLogs.length}</p>
          </section>

          <section className="panel flush">
            <div className="panel-head padded"><h2>Log history</h2></div>
            {logs.length === 0 && <p className="small muted padded">No logs yet.</p>}
            <ul className="log-list">
              {logs.map(l => (
                <li key={l.id}>
                  <button className="log-row" onClick={() => setOpenLog(openLog === l.id ? null : l.id)} aria-expanded={openLog === l.id}>
                    <span>Week {l.weekNo}</span>
                    <Chip tone={l.status === 'Approved' ? 'ok' : l.status === 'Returned' ? 'stop' : undefined}>{l.status}</Chip>
                    <span className="faint small">{l.signedAt ? 'Signed' : '—'}</span>
                  </button>
                  {openLog === l.id && (
                    <div className="log-detail small">
                      <p><span className="faint">Consultation</span> {fmtDate(l.consultationDate)} · {l.consultationMode}</p>
                      <p><span className="faint">Accomplishments</span><br />{l.accomplishments}</p>
                      {l.nextTasks && <p><span className="faint">Next week</span><br />{l.nextTasks}</p>}
                      {l.signedAt && <p className="ok-text">Signed by {nameOf(l.signedBy)} · {fmtDateTime(l.signedAt)}</p>}
                      {l.adviserRemarks && <p className="muted">“{l.adviserRemarks}”</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
