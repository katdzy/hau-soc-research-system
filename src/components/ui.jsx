import { useRef } from 'react'
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

/** Why an account can't act right now ('Suspended', 'Not yet active'), or null when it can. Lists gray these out. */
export const accountNote = (user) => {
  if (!user || user.status === 'Active') return null
  return user.status === 'Suspended' ? 'Suspended' : 'Not yet active'
}

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

/**
 * WAI-ARIA tabs: one tab stop, arrow keys / Home / End move between tabs.
 * `id` prefixes the tab ids; the panel points back with `tabPanelProps`.
 * Each tab: { key, label, n?, tone? } — `n` shows as a count, `tone: 'quiet'`
 * greys it (a total, not something waiting on you).
 */
export function Tabs({ id, tabs, value, onChange, label }) {
  const refs = useRef({})
  function onKeyDown(e) {
    const i = tabs.findIndex(t => t.key === value)
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
      : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
        : e.key === 'Home' ? tabs[0]
          : e.key === 'End' ? tabs.at(-1) : null
    if (!next) return
    e.preventDefault()
    onChange(next.key)
    refs.current[next.key]?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(t => (
        <button key={t.key} ref={el => { refs.current[t.key] = el }} type="button" role="tab"
          id={`${id}-tab-${t.key}`} aria-controls={`${id}-panel`}
          aria-selected={value === t.key} tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}>
          {t.label}
          {t.n > 0 && <span className={`tab-n${t.tone === 'quiet' ? ' is-quiet' : ''}`}>{t.n}</span>}
        </button>
      ))}
    </div>
  )
}

export const tabPanelProps = (id, value) => ({
  role: 'tabpanel', id: `${id}-panel`, 'aria-labelledby': `${id}-tab-${value}`,
})

/** Page numbers to show: every page up to 7, else 1 … around the current … last. */
export function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const near = page <= 4 ? [2, 3, 4, 5] : page >= pages - 3 ? [pages - 4, pages - 3, pages - 2, pages - 1]
    : [page - 1, page, page + 1]
  return [1, ...(near[0] > 2 ? ['…'] : []), ...near, ...(near.at(-1) < pages - 1 ? ['…'] : []), pages]
}

/** Slice one page out of a list; clamps the page when the list shrinks under it. */
export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const current = Math.min(Math.max(1, page), pages)
  return { pages, page: current, rows: list.slice((current - 1) * size, current * size) }
}

/** "11–20 of 54 accounts", page buttons and a rows-per-page choice. */
export function Pagination({ page, pages, total, size, sizes, onPage, onSize, noun = 'items' }) {
  if (total === 0) return null
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return (
    <nav className="pager" aria-label={`Pages of ${noun}`}>
      <p className="pager-range" aria-live="polite">
        <strong>{from}–{to}</strong> of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="pager-pages">
          <button type="button" className="pager-step" disabled={page === 1} onClick={() => onPage(page - 1)}
            aria-label="Previous page">‹<span className="pager-word"> Previous</span></button>
          {pageList(page, pages).map((p, i) => p === '…'
            ? <span key={`gap${i}`} className="pager-gap" aria-hidden="true">…</span>
            : (
              <button key={p} type="button" className="pager-num" aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
            ))}
          <button type="button" className="pager-step" disabled={page === pages} onClick={() => onPage(page + 1)}
            aria-label="Next page"><span className="pager-word">Next </span>›</button>
        </div>
      )}
      {onSize && sizes && total > sizes[0] && (
        <label className="pager-size">
          Rows per page
          <select className="select-quiet" value={size} onChange={e => onSize(Number(e.target.value))}>
            {sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
    </nav>
  )
}
