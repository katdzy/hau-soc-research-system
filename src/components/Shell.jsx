import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist, actionableCount } from '../services/worklist.js'
import { can, resolveContext } from '../domain/cac.js'

const link = ({ isActive }) => (isActive ? 'active' : undefined)

export default function Shell() {
  const { me, snap, signOut, backendName } = useApp()
  const navigate = useNavigate()

  const rows = worklist(snap, me)
  const todo = actionableCount(rows)
  const unread = (snap.notifications ?? []).filter(n => n.userId === me.id && !n.read).length
  const institutional = resolveContext(me, null)

  return (
    <div className="app">
      <nav className="rail">
        <div className="rail-head">
          <div className="wordmark">
            <span className="crest">HAU</span>
            <strong>School of Computing</strong>
          </div>
          <div className="label" style={{ marginTop: 6 }}>Capstone Workflow System</div>
        </div>

        <div className="identity">
          <div className="label">Signed in as</div>
          <div className="name">{me.name}</div>
          <div className="role small muted">{me.globalRole}</div>
          {me.program && <div className="faint small">{me.program} · {me.yearLevel}</div>}
        </div>

        <div className="nav">
          <NavLink to="/" end className={link}>
            <span>Worklist</span>{todo > 0 && <span className="count">{todo}</span>}
          </NavLink>
          <NavLink to="/projects" className={link}>Projects</NavLink>
          <NavLink to="/inbox" className={link}>
            <span>Inbox</span>{unread > 0 && <span className="count">{unread}</span>}
          </NavLink>
          <NavLink to="/archive" className={link}>Archive</NavLink>

          {(can(institutional, 'report.generate') || can(institutional, 'audit.view') || can(institutional, 'admin.users')) &&
            <div className="nav-group label">Institutional</div>}
          {can(institutional, 'report.generate') && <NavLink to="/reports" className={link}>Reports</NavLink>}
          {can(institutional, 'audit.view') && <NavLink to="/audit" className={link}>Audit trail</NavLink>}
          {can(institutional, 'admin.users') && <NavLink to="/admin" className={link}>Administration</NavLink>}
        </div>

        <div className="rail-foot">
          <div className="label">Backend</div>
          <div className="mono muted" style={{ marginBottom: 10 }}>{backendName}</div>
          <button className="quiet small" onClick={() => { signOut(); navigate('/') }}>
            Switch user
          </button>
        </div>
      </nav>

      <main className="main"><Outlet /></main>
    </div>
  )
}
