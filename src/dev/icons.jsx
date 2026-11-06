/**
 * The test panel's icon family: drawn on a 16px grid, 1.5 stroke, round caps
 * and joins, currentColor. One family for every tab, row and button, so no
 * glyph or emoji stands in for an icon. Decorative unless `label` is given.
 */

const dot = (cx, cy) => <path d={`M${cx} ${cy}v.01`} />

const ICONS = {
  // Tabs
  people: <><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.5.5 2.5 1.8 2.5 3.7" /></>,
  spawn: <><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M12.5 3.5v5M10 6h5" /></>,
  stage: <path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" />,
  mail: <><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m2.5 4.5 5.5 4.5 5.5-4.5" /></>,
  trail: <><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2v3h3" /><path d="M8 5.2V8l2 1.5" /></>,
  rules: <><path d="M8 1.8 13 3.6v4c0 3.2-2.1 5.6-5 6.6-2.9-1-5-3.4-5-6.6v-4z" /><path d="m5.8 8 1.6 1.6 3-3.1" /></>,

  // What a row is
  section: <path d="M8 2 14.5 5.5 8 9 1.5 5.5zM1.5 8.5 8 12l6.5-3.5" />,
  student: <><path d="M8 3 1.5 6 8 9l6.5-3z" /><path d="M4 7.3v3.2c0 1 1.8 2 4 2s4-1 4-2V7.3M14.5 6v3.5" /></>,
  group: <><circle cx="8" cy="4.75" r="2.25" /><circle cx="4" cy="11" r="2.25" /><circle cx="12" cy="11" r="2.25" /></>,
  faculty: <path d="M8 4.2C6.5 3.1 4.5 2.5 2 2.5v10c2.5 0 4.5.6 6 1.7 1.5-1.1 3.5-1.7 6-1.7v-10c-2.5 0-4.5.6-6 1.7zm0 0v10" />,
  office: <><path d="M3 14V3.5L9 2v12M9 6h4v8M1.5 14h13" />{dot(5.5, 5.5)}{dot(5.5, 8)}{dot(5.5, 10.5)}{dot(11, 8.5)}{dot(11, 11)}</>,
  chair: <path d="M4 2.5h8v11L8 10.5l-4 3z" />,
  dean: <><circle cx="8" cy="6" r="4" /><path d="M5.6 9.2 4.5 14 8 12.3l3.5 1.7-1.1-4.8" /></>,
  deputy: <><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4 1.3 0 2.4.4 3.2 1M10.5 11.5l1.5 1.5 3-3" /></>,
  research: <path d="M6 2h4M6.5 2v4.5L3 12.7A1.2 1.2 0 0 0 4 14.5h8a1.2 1.2 0 0 0 1-1.8L9.5 6.5V2M4.8 10h6.4" />,
  admin: <><path d="M2.5 4.5h7M12.5 4.5h1M2.5 8h2M7.5 8h6M2.5 11.5h6M11.5 11.5h2" /><circle cx="11" cy="4.5" r="1.5" /><circle cx="6" cy="8" r="1.5" /><circle cx="10" cy="11.5" r="1.5" /></>,
  audit: <><path d="M8 1.8 13 3.6v4c0 3.2-2.1 5.6-5 6.6-2.9-1-5-3.4-5-6.6v-4z" /><path d="M8 5.5v3" />{dot(8, 10.75)}</>,
  history: <><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v4M8 10.5v4" /></>,
  flag: <path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" />,
  bolt: <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" />,

  // Actions and states
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></>,
  key: <><circle cx="5" cy="11" r="2.5" /><path d="M6.8 9.2 13.5 2.5M11 5l2 2" /></>,
  signout: <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10 5l3 3-3 3M13 8H6" />,
  save: <path d="M3 2.5h8l2 2v9H3zM5.5 2.5v3h5v-3M5 13.5v-4h6v4" />,
  restore: <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7" />,
  trash: <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5V11M9.2 6.5V11" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M3.5 8h9" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  chevron: <path d="m6 4 4 4-4 4" />,
  widen: <path d="M6 4 2 8l4 4M10 4l4 4-4 4" />,
  narrow: <path d="M2 4l4 4-4 4M14 4l-4 4 4 4" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  alert: <><circle cx="8" cy="8" r="6.25" /><path d="M8 4.5V9" />{dot(8, 11.5)}</>,
  verify: <><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m5.5 8 1.8 1.8L10.5 6.5" /></>,
  grip: <>{[5.5, 10.5].flatMap(x => [3.5, 8, 12.5].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r=".9" fill="currentColor" stroke="none" />))}</>,
}

export function Icon({ name, size = 16, label, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className ? `tp-svg ${className}` : 'tp-svg'}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false">
      {ICONS[name] ?? null}
    </svg>
  )
}

/** Initials in a disc, toned by what the account is (office, faculty, student). */
export function Avatar({ name = '', kind = 'faculty' }) {
  const initials = name.replace(/^(Prof\.|Dean|Dr\.)\s+/, '').split(/\s+/).filter(Boolean)
    .slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className={`tp-avatar is-${kind}`} aria-hidden="true">{initials || '?'}</span>
}
