import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist, actionableCount } from '../services/worklist.js'
import { can, resolveInstitution } from '../domain/caac.js'
import { ACCOUNT_STATUS, GLOBAL_ROLES as G, accountType } from '../domain/constants.js'
import { sectionNow } from '../domain/stages.js'
import { Avatar } from './ui.jsx'
import { InstallApp, NotificationSetting } from './Pwa.jsx'
import { useOutboxNotifications } from '../notifications.js'
import crest from '../assets/soc-crest.webp'

const link = ({ isActive }) => (isActive ? 'active' : undefined)

// R9: removed from production builds.
const DevRail = import.meta.env.DEV ? lazy(() => import('../dev/DevRail.jsx')) : null

/** The office a faculty account works from; "Faculty" is only the base identity (NEW-1). */
const officeOf = (user) => {
  const roles = user.globalRoles ?? []
  return roles.find(r => r !== G.FACULTY) ?? roles[0] ?? accountType(user.email) ?? 'No role'
}

export default function Shell() {
  const { me, snap, signOut, backendName } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Each email addressed to me also shows as a device notification.
  useOutboxNotifications(me, snap.outbox)

  const todo = actionableCount(worklist(snap, me))
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
  const office = officeOf(me)
  // A faculty account with no office works from its project roles (Figma: "Instructor 1 — WD-401, NW-402").
  const faculty = office === G.FACULTY && held.length
    ? `${[...new Set(held.map(a => a.roleType))].join(' · ')}` : office
  const acting = open && hereRoles.length ? `${hereRoles.join(' · ')} — ${sectionNow(open).section}` : faculty

  const institutional = ['report.generate', 'records.search', 'records.manage', 'audit.view']
    .some(c => can(inst, c))
  const administration = ['admin.accounts', 'admin.caac', 'settings.manage'].some(c => can(inst, c))
  // Verified registrations waiting for the System Administrator (S0.3).
  const toActivate = can(inst, 'admin.accounts')
    ? (snap.users ?? []).filter(u => u.status === ACCOUNT_STATUS.INACTIVE && u.emailVerified).length : 0

  // A group member's project tabs sit in the rail, as in the wireframe's
  // student navigation (My Project · Version History · Weekly Logs · Defense).
  const myProject = memberOf[0]?.projectId
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

  // Below 860px the rail collapses to a nav strip; its foot moves into the account menu.
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
      <span className="faint small">Backend <span className="mono">{backendName}</span></span>
    </div>
  )

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="HAU-SOC Thesis and Capstone — Dashboard">
          <img className="crest-img" src={crest} alt="" width="32" height="32" />
          <span className="brand-name">HAU-SOC Thesis and Capstone Project Management and Workflow Automation System</span>
          <span className="brand-short">HAU-SOC Capstone</span>
        </Link>
        <div className="topbar-end">
          <ActingAs acting={acting} office={office} held={held} memberOf={memberOf}
            projectOf={projectOf} openId={openId} pathname={here} />
          <AccountMenu me={me} pathname={here} onSignOut={() => { signOut(); navigate('/') }}>
            {compact && railFoot}
          </AccountMenu>
        </div>
      </header>

      <div className="app-body">
        <nav className="rail" aria-label="Main">
          <div className="rail-role label">{office}</div>
          <div className="nav">
            <NavLink to="/" end className={link}>
              <span>Dashboard</span>{todo > 0 && <span className="count">{todo}</span>}
            </NavLink>
            {myProject ? (
              <>
                {projectLink(null, 'My Project')}
                {projectLink('documents', 'Version History')}
                {projectLink('logs', 'Weekly Logs')}
                {projectLink('defense', 'Defense')}
                {projectLink('forms', 'Forms')}
              </>
            ) : (
              <NavLink to="/projects" className={link}>Projects</NavLink>
            )}

            {institutional && <div className="nav-group label">Institutional</div>}
            {can(inst, 'report.generate') && <NavLink to="/reports" className={link}>Reports</NavLink>}
            {(can(inst, 'records.search') || can(inst, 'records.manage')) &&
              <NavLink to="/records" className={link}>Archive</NavLink>}
            {can(inst, 'audit.view') && <NavLink to="/audit" className={link}>Audit Log</NavLink>}

            {administration && <div className="nav-group label">Administration</div>}
            {can(inst, 'admin.accounts') && (
              <NavLink to="/admin/accounts" className={link}>
                <span>User Accounts</span>{toActivate > 0 && <span className="count">{toActivate}</span>}
              </NavLink>
            )}
            {can(inst, 'admin.caac') && <NavLink to="/admin/caac" className={link}>Role Configuration</NavLink>}
            {can(inst, 'settings.manage') && <NavLink to="/admin/settings" className={link}>Global Settings</NavLink>}
          </div>

          {!compact && railFoot}
        </nav>

        <main className="main" id="main" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  )
}

/**
 * "Acting as" (Figma: CAAC role switcher). Permissions are always the Global
 * Role plus the role held on the project at its current stage, so picking a
 * project role opens that project — the context in which the role applies.
 */
function ActingAs({ acting, office, held, memberOf, projectOf, openId, pathname }) {
  const ref = useDisclosure(pathname)

  const entries = [
    ...memberOf.map(m => ({ key: m.id, role: 'Group member', projectId: m.projectId })),
    ...held.map(a => ({ key: a.id, role: a.roleType, projectId: a.projectId })),
  ]

  return (
    <details className="acting" ref={ref}>
      <summary aria-label={`Acting as ${acting}. Change context`}>
        <span className="acting-k">Acting as:</span>
        <span className="acting-v">{acting}</span>
      </summary>
      <div className="acting-menu">
        <div className="label">Global role</div>
        <Link className="acting-item" to="/" aria-current={!openId ? 'true' : undefined}>
          <strong>{office}</strong>
          <span>Dashboard · School of Computing</span>
        </Link>
        {entries.length > 0 && <div className="label mt-1">Project roles</div>}
        {entries.map(e => {
          const p = projectOf(e.projectId)
          return (
            <Link key={e.key} className="acting-item" to={`/projects/${e.projectId}`}
              aria-current={openId === e.projectId ? 'true' : undefined}>
              <strong>{e.role} — {sectionNow(p).section}</strong>
              <span>{p.title}</span>
            </Link>
          )
        })}
        <p className="acting-note">
          What you can do is your Global Role plus the role you hold on the project you open, at its current stage.
        </p>
      </div>
    </details>
  )
}

/** The avatar opens the account menu: who you are, Sign out, and on narrow screens the rail foot. */
function AccountMenu({ me, pathname, onSignOut, children }) {
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
        {children}
        <InstallApp className="acting-note" />
        <NotificationSetting me={me} className="acting-note" />
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
