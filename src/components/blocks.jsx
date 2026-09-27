import { Link, useSearchParams } from 'react-router-dom'
import { fmtDate, fmtDateTime } from './ui.jsx'
import { daysUntil } from '../services/views.js'
import { caacTag } from '../domain/caac.js'
import { actingContexts } from '../domain/contexts.js'

// Building blocks shared by the role-context pages (wireframes S-02 … S-14).

export function PageHead({ eyebrow, title, lede, children }) {
  return (
    <header className="page-head">
      {eyebrow && <div className="label">{eyebrow}</div>}
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </header>
  )
}

export function Chip({ children, tone }) {
  return <span className={`chip${tone ? ` ${tone}` : ''}`}>{children}</span>
}

/**
 * Picks one project out of several (?p=<id>) for pages that work on a single
 * group at a time — the defense pack, evaluation form, verdict, assignment.
 */
export function useProjectPick(rows) {
  const [params, setParams] = useSearchParams()
  const wanted = params.get('p')
  const current = rows.find(r => r.b.project.id === wanted) ?? rows[0] ?? null
  const pick = (id) => { const next = new URLSearchParams(params); next.set('p', id); setParams(next) }
  return [current, pick]
}

export function ProjectPicker({ rows, current, onPick, label = 'Group' }) {
  if (rows.length < 2) return null
  return (
    <label className="picker">
      <span className="label">{label}</span>
      <select value={current?.b.project.id ?? ''} onChange={e => onPick(e.target.value)}>
        {rows.map(r => (
          <option key={r.b.project.id} value={r.b.project.id}>
            {r.b.project.groupName} · {r.b.project.title}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The progress trail: the nine checkpoints of the life cycle, each with the
 * date it was reached and who completed it.
 */
export function ProgressTrail({ trail }) {
  return (
    <section className="trail" aria-label="Progress trail">
      <div className="label">Progress trail</div>
      <ol className="trail-steps">
        {trail.map(step => (
          <li key={step.label} className={`trail-step is-${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}>
            <span className="trail-dot" aria-hidden="true" />
            <span className="trail-label">{step.label}</span>
            <span className="trail-meta">
              {step.state === 'done' && step.at ? fmtDate(step.at)
                : step.state === 'done' ? 'Done'
                  : step.state === 'current' ? 'In progress' : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Pending work as a checklist — the group's own items and what they wait on. */
export function Checklist({ items, title = 'Checklist' }) {
  const open = items.filter(i => !i.done).length
  return (
    <section className="panel checklist" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="faint small">{open === 0 ? 'All done for this stage' : `${open} to go`}</span>
      </div>
      {items.length === 0 && <p className="small muted">Nothing to do at this stage.</p>}
      <ul className="check-list">
        {items.map((item, i) => (
          <li key={i} className={item.done ? 'is-done' : undefined}>
            <span className="check-box" aria-hidden="true">{item.done ? '✓' : ''}</span>
            <span className="check-body">
              {item.to && !item.done
                ? <Link to={item.to} className="check-label">{item.label}</Link>
                : <span className="check-label">{item.label}</span>}
              <span className="sr-only">{item.done ? ' — done' : ' — not done'}</span>
              {item.detail && !item.done && <span className="check-detail">{item.detail}</span>}
              {!item.yours && !item.done && <span className="check-detail">Waiting on {item.who}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "N days before deadline", naming the deadline. */
export function DeadlineTile({ deadline }) {
  if (!deadline) {
    return (
      <div className="stat panel">
        <div className="label">Days before deadline</div>
        <div className="n faint">—</div>
        <div className="small muted">No deadline set</div>
      </div>
    )
  }
  const left = daysUntil(deadline.date)
  return (
    <div className="stat panel">
      <div className="label">Days before deadline</div>
      <div className={`n${left < 0 ? ' is-stop' : left <= 3 ? ' is-warn' : ''}`}>
        {left < 0 ? `${Math.abs(left)} overdue` : left}
      </div>
      <div className="small muted">
        {left < 0 ? `${deadline.label} was ` : `${left === 1 ? 'day' : 'days'} before ${deadline.label.toLowerCase()} · `}
        {fmtDate(deadline.date)}
      </div>
    </div>
  )
}

export function StatTile({ label, value, note, tone }) {
  return (
    <div className="stat panel">
      <div className="label">{label}</div>
      <div className={`n${tone ? ` is-${tone}` : ''}`}>{value}</div>
      {note && <div className="small muted">{note}</div>}
    </div>
  )
}

/** Wireframe S-07 "Your contexts": Global Role × Project-Based Roles. */
export function ContextsPanel({ me, snap }) {
  const contexts = actingContexts(me, snap)
  const global = me.globalRoles ?? []
  const projectContexts = contexts.filter(c => !global.includes(c.role))
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Your contexts</h2>
        <span className="faint small">Permissions = Global Role × Project Role</span>
      </div>
      <div className="label" style={{ marginTop: 8 }}>Global Role</div>
      <p className="small">{global.length ? global.map(r => <span key={r} className="tag">{caacTag(r)}</span>) : 'None assigned'}</p>
      <div className="label">Project-Based Roles</div>
      <ul className="context-list">
        {projectContexts.map(c => (
          <li key={c.role} className={c.role === me.actingAs ? 'is-current' : undefined}>
            <strong>{c.role}</strong>
            {c.detail && <span className="small muted">{c.detail}</span>}
            {c.role === me.actingAs && <span className="small faint">Acting in this context now</span>}
          </li>
        ))}
        {projectContexts.length === 0 && <li className="small muted">None</li>}
      </ul>
      <p className="small faint" style={{ marginBottom: 0 }}>
        You cannot annotate, sign or decide on a project you hold no role in — and only the role
        you are acting as applies.
      </p>
    </section>
  )
}

/** What an email looked like, for the sender's confirmation and the admin log. */
export function EmailPreview({ email, recipients, onClose }) {
  return (
    <section className="mail" aria-live="polite">
      <div className="mail-head">
        <span className="label">Email sent through Resend</span>
        <div className="small"><span className="faint">To</span> {recipients}</div>
        <div className="small"><span className="faint">Subject</span> <strong>{email.subject}</strong></div>
        {email.sentAt && <div className="small faint">{fmtDateTime(email.sentAt)}</div>}
      </div>
      {email.body.split('\n\n').map((p, i) => <p key={i} className="small" style={{ margin: '12px 0 0' }}>{p}</p>)}
      {email.lines?.length > 0 && (
        <ul className="mail-lines small">
          {email.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {email.link && <p className="small" style={{ margin: '12px 0 0' }}><span className="faint">Button:</span> Open in the system → <span className="mono">{email.link}</span></p>}
      {onClose && <button className="quiet small" onClick={onClose} style={{ marginTop: 12 }}>Close</button>}
    </section>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty-state">
      {title && <h2>{title}</h2>}
      <p className="small muted">{children}</p>
    </div>
  )
}
