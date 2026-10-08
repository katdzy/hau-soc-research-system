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
  if (v.includes('Re-defense')) return 'stop'
  if (v.includes('Major')) return 'warn'
  return v ? 'ok' : 'neutral'
}

/** Shown when no role the user holds grants the page's capability. */
export function Restricted({ children = 'None of your roles gives you access to this page.' }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Not available to you</h1>
        <p className="lede">{children}</p>
      </header>
    </div>
  )
}

/** An outlined box with an optional title row (Figma: content boxes). `tone` = 'accent' | 'stop'. */
export function Section({ title, aside, tone, className, children }) {
  return (
    <section className={['section', tone && `is-${tone}`, className].filter(Boolean).join(' ')}>
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

/** Initials for the avatar circle: "Prof. Alpha Reyes" → "AR". */
export function initials(full = '') {
  const parts = full.replace(/\(.*?\)/g, '').split(',')[0].trim().split(/\s+/)
    .filter(p => p && !HONORIFICS.has(p.toLowerCase()) && /^[A-Za-z]/.test(p))
  const pick = parts.length > 1 ? [parts[0], parts.at(-1)] : parts
  return pick.map(p => p[0].toUpperCase()).join('') || '?'
}

export const Avatar = ({ name, small }) => (
  <span className={`avatar${small ? ' sm' : ''}`} aria-hidden="true">{initials(name)}</span>
)

const HONORIFICS = new Set(['dr.', 'mr.', 'ms.', 'mrs.', 'engr.', 'asst.', 'assoc.', 'prof.', 'atty.', 'sr.', 'fr.', 'ma.'])

/** Greeting name that survives "Asst. Prof. Kevin Aldrin G. Espinosa, MIT". */
export function firstName(full = '') {
  const cleaned = full.replace(/\(.*?\)/g, '').split(',')[0].trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return parts.find(p => !HONORIFICS.has(p.toLowerCase())) ?? cleaned
}

/** "BS Major in IT with area of specialization in Web Development" → "Information Technology — Web Development". */
export const programShort = (name = '') =>
  name.replace(/^Bachelor of Science (Major )?in /, '').replace(/ with area of specialization in /, ' — ')

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—'

export const fmtSize = (bytes) =>
  !bytes ? '—' : bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`

/** Download rows as a CSV file. Every cell is quoted. */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const text = [header, ...rows].map(r => r.map(cell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

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
