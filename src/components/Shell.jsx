import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { actionableCount } from '../services/worklist.js'
import { can, resolveInstitution } from '../domain/caac.js'
import { useWorkspace } from './Workspace.jsx'
import { ACCOUNT_STATUS, GLOBAL_ROLES as G, accountType } from '../domain/constants.js'
import { sectionNow } from '../domain/stages.js'
import { FLAGS } from '../domain/flags.js'
import { Avatar } from './ui.jsx'
import { InstallApp, InstallBanner, NotificationSetting } from './Pwa.jsx'
import { useOutboxNotifications } from '../notifications.js'
import { ViewOnlyBanner } from './ViewOnly.jsx'
import crest from '../assets/soc-crest.webp'
import { writePath } from '../services/api.js'

const link = ({ isActive }) => (isActive ? 'active' : undefined)

// R9: removed from production builds.
const DevRail = import.meta.env.DEV ? lazy(() => import('../dev/DevRail.jsx')) : null

/** The office a faculty account works from; "Faculty" is only the base identity (NEW-1). */
const officeOf = (user) => {
  const roles = user.globalRoles ?? []
  return roles.find(r => r !== G.FACULTY) ?? roles[0] ?? accountType(user.email) ?? 'No role'
}

const SHARED_NAV = [{ to: '/records', label: 'Archive' }, { to: '/forms', label: 'Blank forms' }]

export default function Shell() {
  const { me, snap, signOut, backendName } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Each email addressed to me also shows as a device notification.
  useOutboxNotifications(me, snap.outbox)

  // The "Acting as" context decides the rail and the dashboard (Figma F02).
  const { held: contexts, current, inContext, choose } = useWorkspace()
  const todo = actionableCount(inContext)
  const inst = resolveInstitution(me, snap)
  const projects = snap.projects ?? []
  const projectOf = (id) => projects.find(p => p.id === id)

  // The second CAAC dimension: Project-Based Roles, one entry per project.
  const held = (snap.projectAssignments ?? []).filter(a => a.userId === me.id && projectOf(a.projectId))
  const memberOf = (snap.projectMembers ?? []).filter(m => m.userId === me.id && projectOf(m.projectId))
  const roleCounts = {}
  for (const a of held) roleCounts[a.roleType] = (roleCounts[a.roleType] ?? 0) + 1

  // The project open right now decides which context the top bar names.
  const openId = matchPath('/projects/:id', location.pathname)?.params.id
  const open = openId && projectOf(openId)
  const hereRoles = open
    ? [...(memberOf.some(m => m.projectId === openId) ? ['Group member'] : []),
       ...held.filter(a => a.projectId === openId).map(a => a.roleType)]
    : []
  const office = current?.heading ?? officeOf(me)
  const acting = open && hereRoles.length
    ? `${hereRoles.join(' · ')} — ${sectionNow(open).section}`
    : current ? `${current.heading}${current.scope ? ` — ${current.scope}` : ''}` : office
  // Verified registrations waiting for the System Administrator (S0.3) —
  // none when verification alone activates (flag ACCOUNT_ACTIVATION = 'email').
  const toActivate = can(inst, 'admin.accounts') && FLAGS.ACCOUNT_ACTIVATION !== 'email'
    ? (snap.users ?? []).filter(u => u.status === ACCOUNT_STATUS.INACTIVE && u.emailVerified).length : 0

  // A group member's project tabs sit in the rail, as in the wireframe's
  // student navigation (My Project · Version History · Weekly Logs · Defense).
  const myProject = current?.member ? current.projectIds[0] : null
  const tab = new URLSearchParams(location.search).get('tab')
  const onMine = openId && openId === myProject
  const projectLink = (key, label) => {
    const active = onMine && (key ? tab === key : !tab || tab === 'overview')
    return (
      <Link to={`/projects/${myProject}${key ? `?tab=${key}` : ''}`} className={active ? 'active' : undefined}
        aria-current={active ? 'page' : undefined}>
        {label}
      </Link>
    )
  }

  // Below 860px (phones, tablets upright) the rail moves behind ☰ (Figma R-00p).
  const compact = useMediaQuery('(max-width: 860px)')
  const here = location.pathname + location.search
  const railFoot = (
    <div className="rail-foot">
      {DevRail && <Suspense fallback={null}><DevRail /></Suspense>}
      <dl className="standing">
        <div><dt>Global Role: </dt><dd>{me.globalRoles?.length ? me.globalRoles.join(', ') : 'none'}</dd></div>
        <div>
          <dt>Project Roles: </dt>
          <dd>
            {memberOf.length > 0 && 'Member'}
            {memberOf.length > 0 && held.length > 0 && ', '}
            {held.length
              ? Object.entries(roleCounts).map(([r, n]) => `${r} (${n})`).join(', ')
              : !memberOf.length && '—'}
          </dd>
        </div>
      </dl>
      <span className="faint small">Backend <span className="mono">{backendName}</span>{writePath !== 'local' && <> · writes <span className="mono">{writePath}</span></>}</span>
    </div>
  )

  const navBody = (
    <>
      <div className="rail-role label">{office}</div>
      <div className="nav">
        <NavLink to="/" end className={link}>
          <span>Dashboard</span>{todo > 0 && <span className="count">{todo}</span>}
        </NavLink>
        {myProject && (
          <>
            {projectLink(null, 'My Project')}
            {projectLink('documents', 'Version History')}
            {projectLink('logs', 'Weekly Logs')}
            {projectLink('defense', 'Defense')}
            {projectLink('forms', 'Forms')}
          </>
        )}
        {(current?.nav ?? []).map(n => (
          <NavLink key={n.to} to={n.to} className={link}>
            <span>{n.label}</span>
            {n.badge === 'toActivate' && toActivate > 0 && <span className="count">{toActivate}</span>}
          </NavLink>
        ))}
        {/* Every account (S-17, F-10): the archive and the blank form library. */}
        {SHARED_NAV.filter(n => !(current?.nav ?? []).some(x => x.to === n.to)).map(n => (
          <NavLink key={n.to} to={n.to} className={link}><span>{n.label}</span></NavLink>
        ))}
      </div>
      {railFoot}
    </>
  )

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        {compact && <MenuButton pathname={here} label={`Menu — ${office}`}>{navBody}</MenuButton>}
        <Link to="/" className="brand" aria-label="HAU-SOC Thesis and Capstone — Dashboard">
          <img className="crest-img" src={crest} alt="" width="32" height="32" />
          <span className="brand-name">HAU-SOC Thesis and Capstone Project Management and Workflow Automation System</span>
          <span className="brand-short">HAU-SOC Capstone</span>
        </Link>
        <div className="topbar-end">
          <NotificationCenter me={me} snap={snap} pathname={here} />
          <ActingAs acting={acting} contexts={contexts} current={current} openId={openId}
            onChoose={(key) => { choose(key); navigate('/') }} pathname={here} />
          <AccountMenu me={me} pathname={here} onSignOut={() => { signOut(); navigate('/') }} />
        </div>
      </header>

      <div className="app-body">
        {!compact && <nav className="rail" aria-label="Main">{navBody}</nav>}

        <main className="main" id="main" tabIndex={-1}>
          <ViewOnlyBanner />
          <Outlet />
          {/* Phones and tablets, first screen after login (Figma PWA-01). */}
          {compact && location.pathname === '/' && <InstallBanner />}
        </main>
      </div>
    </div>
  )
}

/**
 * "Acting as" (Figma F02: CAAC role switcher). Each entry is one role the
 * account holds — a Global Role, or a Project-Based Role across its groups —
 * and picking one switches the rail and the dashboard. Permissions stay the
 * Global Role plus the role held on the project you open, at its stage.
 */
function ActingAs({ acting, contexts, current, openId, onChoose, pathname }) {
  const ref = useDisclosure(pathname)
  const { snap } = useApp()
  const sections = (c) => [...new Set(c.projectIds
    .map(id => (snap.projects ?? []).find(p => p.id === id)).filter(Boolean)
    .map(p => sectionNow(p).section))]
  const groups = [
    ['Global role', contexts.filter(c => c.global)],
    ['Project roles', contexts.filter(c => !c.global && !c.member)],
    ['Your group', contexts.filter(c => c.member)],
  ].filter(([, list]) => list.length)

  return (
    <details className="acting" ref={ref}>
      <summary aria-label={`Acting as ${acting}. Change context`}>
        <span className="acting-k">Acting as:</span>
        <span className="acting-v">{acting}</span>
      </summary>
      <div className="acting-menu">
        {groups.length === 0 && <p className="acting-note">No role is assigned to this account yet.</p>}
        {groups.map(([title, list], i) => (
          <div key={title}>
            <div className={`label${i ? ' mt-1' : ''}`}>{title}</div>
            {list.map(c => {
              const on = c.key === current?.key && !openId
              const where = c.global ? c.scope : sections(c).join(' · ') || c.scope
              return (
                <button key={c.key} type="button" className="acting-item" aria-current={on ? 'true' : undefined}
                  onClick={() => { if (ref.current) ref.current.open = false; onChoose(c.key) }}>
                  <strong>{c.heading}</strong>
                  <span>{where}</span>
                </button>
              )
            })}
          </div>
        ))}
        <p className="acting-note">
          Switching changes the sidebar and the dashboard. What you can do is your Global Role plus the role you hold on the project you open, at its current stage.
        </p>
      </div>
    </details>
  )
}

/**
 * ☰ on phones and upright tablets (Figma R-00p): the same modules as the
 * desktop rail, in a panel from the left. A modal <dialog>, so focus moves in,
 * Escape closes it and the page behind is inert; it closes on navigation.
 */
function MenuButton({ pathname, label, children }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current?.open) ref.current.close() }, [pathname])
  return (
    <>
      <button className="quiet menu-button" aria-label={label} aria-haspopup="dialog"
        onClick={() => ref.current.showModal()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <dialog ref={ref} className="nav-drawer" aria-label="Main menu"
        // The backdrop, or any link (even to the page already open), closes it.
        onClick={(e) => { if (e.target === e.currentTarget || e.target.closest('a')) e.currentTarget.close() }}>
        <button className="quiet sheet-x drawer-x" onClick={() => ref.current.close()} aria-label="Close menu">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <nav className="rail" aria-label="Main">{children}</nav>
      </dialog>
    </>
  )
}

/**
 * In-App Notification Center:
 * Displays notifications addressed to the current user (from snap.outbox).
 * Persists read/unread states per user in localStorage.
 */
function NotificationCenter({ me, snap, pathname }) {
  const ref = useDisclosure(pathname)
  const navigate = useNavigate()

  const storageKey = `hausoc.read_notifications.${me.id}`
  const [readIds, setReadIds] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return new Set(stored ? JSON.parse(stored) : [])
    } catch {
      return new Set()
    }
  })

  // Filter notifications addressed to this user or their institutional email
  const allNotifs = (snap.outbox ?? [])
    .filter(o => {
      const byUser = (o.userIds ?? []).includes(me.id)
      const byEmail = me.email && (o.to === me.email || (Array.isArray(o.to) && o.to.includes(me.email)))
      return byUser || byEmail
    })
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))

  const unreadCount = allNotifs.filter(n => !readIds.has(n.id)).length

  function markAsRead(id) {
    setReadIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  function markAllAsRead() {
    const next = new Set([...readIds, ...allNotifs.map(n => n.id)])
    setReadIds(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {}
  }

  function handleItemClick(notif) {
    markAsRead(notif.id)
    if (ref.current) ref.current.open = false
    if (notif.projectId) {
      navigate(`/projects/${notif.projectId}`)
    }
  }

  const projectMap = new Map((snap.projects ?? []).map(p => [p.id, p]))

  return (
    <details className="notif-center" ref={ref}>
      <summary className="notif-bell-btn" aria-label={`Notifications: ${unreadCount} unread`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </summary>

      <div className="notif-panel">
        <div className="notif-header">
          <div className="notif-header-title">
            <strong>Notifications</strong>
            {unreadCount > 0 && <span className="notif-unread-pill">{unreadCount} new</span>}
          </div>
          {unreadCount > 0 && (
            <button type="button" className="notif-action-btn" onClick={markAllAsRead}>
              Mark all read
            </button>
          )}
        </div>

        <div className="notif-list">
          {allNotifs.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon" aria-hidden="true">🔔</div>
              <strong>No notifications yet</strong>
              <p>You are completely up to date with all your research &amp; capstone activities.</p>
            </div>
          ) : (
            allNotifs.map(n => {
              const isUnread = !readIds.has(n.id)
              const project = n.projectId ? projectMap.get(n.projectId) : null
              return (
                <div
                  key={n.id}
                  className={`notif-item ${isUnread ? 'is-unread' : ''} ${n.projectId ? 'is-clickable' : ''}`}
                  onClick={() => handleItemClick(n)}
                  role={n.projectId ? 'button' : undefined}
                  tabIndex={n.projectId ? 0 : undefined}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleItemClick(n) }}
                >
                  <div className="notif-item-top">
                    {isUnread && <span className="notif-dot" aria-label="Unread" />}
                    <span className="notif-item-subject">{n.subject || 'Workflow notification'}</span>
                    <span className="notif-item-time">{formatRelativeTime(n.at)}</span>
                  </div>
                  {n.body && <p className="notif-item-body">{n.body}</p>}
                  {project && (
                    <div className="notif-item-meta">
                      <span className="notif-project-tag">{project.title}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </details>
  )
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * The avatar opens the account menu (Figma PWA-09): who you are, device
 * notifications, Install app until installed, and Sign out.
 */
function AccountMenu({ me, pathname, onSignOut }) {
  const ref = useDisclosure(pathname)
  return (
    <details className="me-menu" ref={ref}>
      <summary className="me" aria-label={`Account: ${me.name}`}>
        <Avatar name={me.name} />
        <span className="me-text">
          <span className="me-name">{me.name}</span>
          <span className="me-sub">{me.block ?? `${accountType(me.email)}, SOC`}</span>
        </span>
      </summary>
      <div className="acting-menu">
        <div className="acting-who">
          <strong>{me.name}</strong>
          <span>{me.email}</span>
        </div>
        <NotificationSetting me={me} />
        <InstallApp className="acting-note" />
        <div className="acting-note">
          <button className="small" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </details>
  )
}

/** A <details> menu that closes on navigation, on a click outside, and on Escape. */
function useDisclosure(pathname) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.open = false }, [pathname])
  useEffect(() => {
    const close = (e) => { if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false }
    const esc = (e) => {
      if (e.key === 'Escape' && ref.current?.open) { ref.current.open = false; ref.current.querySelector('summary').focus() }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [])
  return ref
}

function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}
