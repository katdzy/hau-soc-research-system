import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { navFor } from '../domain/contexts.js'
import { myGroup } from '../services/views.js'
import { GLOBAL_ROLES as G } from '../domain/constants.js'

// Wireframe frame: a top bar with the "Acting as" switcher, and a left menu
// for the current context. There is no notification bell — every workflow
// event reaches people by email.

const link = ({ isActive }) => (isActive ? 'active' : undefined)

export default function Shell() {
  const { me, snap, signOut, contexts, actingAs, setActingAs } = useApp()
  const navigate = useNavigate()
  const project = actingAs === G.STUDENT ? myGroup(snap, me)?.project : null
  const nav = navFor(actingAs, { project })

  const projectRoles = {}
  for (const a of snap.projectAssignments ?? []) {
    if (a.userId === me.id && a.status !== 'Declined') projectRoles[a.roleType] = (projectRoles[a.roleType] ?? 0) + 1
  }
  const roleSummary = Object.entries(projectRoles).map(([r, n]) => (n > 1 ? `${r} (${n})` : r)).join(', ')
  const subtitle = me.block ? `${me.program?.split(' — ')[0]}-${me.block}` : (me.globalRoles?.[0] ?? 'Faculty, SOC')

  function switchTo(role) {
    setActingAs(role)
    navigate('/')
  }

  return (
    <div className="frame">
      <header className="topbar">
        <div className="wordmark">
          <span className="crest">HAU</span>
          <strong>HAU-SOC Capstone Management System</strong>
        </div>

        {contexts.length > 0 && (
          <label className="acting">
            <span className="acting-label">Acting as</span>
            <select value={actingAs ?? ''} onChange={e => switchTo(e.target.value)} disabled={contexts.length < 2}>
              {contexts.map(c => (
                <option key={c.role} value={c.role}>{c.label}{c.detail ? ` — ${c.detail}` : ''}</option>
              ))}
            </select>
          </label>
        )}

        <div className="whoami">
          <div className="whoami-name">{me.name}</div>
          <div className="faint small">{subtitle}</div>
        </div>
        <button className="quiet small" onClick={() => { signOut(); navigate('/') }}>Sign out</button>
      </header>

      <div className="app">
        <nav className="rail" aria-label={nav.heading}>
          <div className="label rail-heading">{nav.heading}</div>
          <div className="nav">
            {nav.items.map(item => item.locked ? (
              <span key={item.to} className="nav-locked" aria-disabled="true" title={`Unlocks in ${item.locked}`}>
                <span>{item.label}</span><span className="lock">{item.locked}</span>
              </span>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={link}>{item.label}</NavLink>
            ))}
          </div>
          <dl className="rail-foot small faint">
            <div><dt>Global Role</dt><dd>{me.globalRoles?.length ? me.globalRoles.join(', ') : 'none'}</dd></div>
            <div><dt>Project Roles</dt><dd>{roleSummary || '—'}</dd></div>
          </dl>
        </nav>

        <main className="main"><Outlet /></main>
      </div>
    </div>
  )
}
