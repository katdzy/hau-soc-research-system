import { DOC_STATUS } from '../domain/constants.js'

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>
}

const DOC_TONE = {
  [DOC_STATUS.APPROVED]: 'ok',
  [DOC_STATUS.SUBMITTED]: 'info',
  [DOC_STATUS.UNDER_REVIEW]: 'info',
  [DOC_STATUS.FOR_REVISION]: 'warn',
  [DOC_STATUS.REJECTED]: 'stop',
  [DOC_STATUS.SUPERSEDED]: 'neutral',
  [DOC_STATUS.ARCHIVED]: 'neutral',
}
export const docTone = (status) => DOC_TONE[status] ?? 'neutral'

// A pending defense has verdict === null, which a default parameter will not
// catch — normalise before testing.
export const verdictTone = (verdict) => {
  const v = verdict ?? ''
  if (v.includes('Failed')) return 'stop'
  if (v.includes('Major')) return 'warn'
  return v ? 'ok' : 'neutral'
}

export function Section({ title, aside, children }) {
  return (
    <section className="section">
      {(title || aside) && (
        <div className="section-head">
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="faint small">{hint}</span>}
    </label>
  )
}

export const Empty = ({ children }) => <p className="empty">{children}</p>

const HONORIFICS = new Set(['dr.', 'mr.', 'ms.', 'mrs.', 'engr.', 'asst.', 'assoc.', 'prof.', 'atty.', 'sr.', 'fr.', 'ma.'])

/** Greeting name that survives "Asst. Prof. Kevin Aldrin G. Espinosa, MIT". */
export function firstName(full = '') {
  const cleaned = full.replace(/\(.*?\)/g, '').split(',')[0].trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return parts.find(p => !HONORIFICS.has(p.toLowerCase())) ?? cleaned
}

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—'

export const fmtSize = (bytes) =>
  !bytes ? '—' : bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`

export function daysLeft(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - Date.now()) / 864e5)
}

export function Countdown({ deadline, label = 'Revision deadline' }) {
  const left = daysLeft(deadline)
  if (left === null) return null
  const tone = left < 0 ? 'stop' : left <= 3 ? 'warn' : 'info'
  return (
    <Badge tone={tone}>
      {label}: {left < 0 ? `overdue by ${Math.abs(left)}d` : `${left}d left`}
    </Badge>
  )
}
