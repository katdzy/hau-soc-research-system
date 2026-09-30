import { Suspense, lazy } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist, actionableCount } from '../services/worklist.js'
import { can, caacTag, resolveInstitution } from '../domain/caac.js'
import { ACCOUNT_STATUS, accountType } from '../domain/constants.js'

const link = ({ isActive }) => (isActive ? 'active' : undefined)

// R9: removed from production builds.
const DevRail = import.meta.env.DEV ? lazy(() => import('../dev/DevRail.jsx')) : null

export default function Shell() {
  const { me, snap, signOut, backendName } = useApp()
  const navigate = useNavigate()

  const todo = actionableCount(worklist(snap, me))
  const inst = resolveInstitution(me, snap)

  // Project-Based Roles, counted across projects — the second CAAC dimension.
  const projectRoles = {}
  for (const a of snap.projectAssignments ?? []) {
    if (a.userId === me.id) projectRoles[a.roleType] = (projectRoles[a.roleType] ?? 0) + 1
  }

  const institutional = ['report.generate', 'records.search', 'records.manage', 'audit.view']
    .some(c => can(inst, c))
  const administration = ['admin.accounts', 'admin.caac', 'settings.manage'].some(c => can(inst, c))
  // Verified registrations waiting for the System Administrator (S0.3).
  const toActivate = can(inst, 'admin.accounts')
    ? (snap.users ?? []).filter(u => u.status === ACCOUNT_STATUS.INACTIVE && u.emailVerified).length : 0

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <div className="rail-head">
          <div className="wordmark">
            <span className="crest">HAU</span>
            <strong>School of Computing</strong>
          </div>
          <div className="label" style={{ marginTop: 8 }}>Thesis &amp; Capstone Workflow</div>
        </div>

        <div className="identity">
          <div className="name">{me.name}</div>
          <div className="faint small">
            {accountType(me.email)} account{me.block ? ` · ${me.block}` : ''}
          </div>
          <dl className="standing">
            <dt className="label">Global</dt>
            <dd>
              {me.globalRoles?.length
                ? me.globalRoles.map(r => <span key={r} className="tag">{caacTag(r)}</span>)
                : <span className="faint small">none</span>}
            </dd>
            <dt className="label">Projects</dt>
            <dd>
              {Object.keys(projectRoles).length
                ? Object.entries(projectRoles).map(([r, n]) => (
                    <span key={r} className="tag">{caacTag(r)}<span className="tag-n">×{n}</span></span>
                  ))
                : <span className="faint small">none</span>}
            </dd>
          </dl>
        </div>

        <div className="nav">
          <NavLink to="/" end className={link}>
            <span>Worklist</span>{todo > 0 && <span className="count">{todo}</span>}
          </NavLink>
          <NavLink to="/projects" className={link}>Projects</NavLink>

          {institutional && <div className="nav-group label">Institutional</div>}
          {can(inst, 'report.generate') && <NavLink to="/reports" className={link}>Reports</NavLink>}
          {(can(inst, 'records.search') || can(inst, 'records.manage')) &&
            <NavLink to="/records" className={link}>Records archive</NavLink>}
          {can(inst, 'audit.view') && <NavLink to="/audit" className={link}>Audit trail</NavLink>}

          {administration && <div className="nav-group label">Administration</div>}
          {can(inst, 'admin.accounts') && (
            <NavLink to="/admin/accounts" className={link}>
              <span>Accounts</span>{toActivate > 0 && <span className="count">{toActivate}</span>}
            </NavLink>
          )}
          {can(inst, 'admin.caac') && <NavLink to="/admin/caac" className={link}>CAAC configuration</NavLink>}
          {can(inst, 'settings.manage') && <NavLink to="/admin/settings" className={link}>Global settings</NavLink>}
        </div>

        <div className="rail-foot">
          {DevRail && <Suspense fallback={null}><DevRail /></Suspense>}
          <div className="faint small" style={{ marginBottom: 10 }}>
            Backend <span className="mono">{backendName}</span>
          </div>
          <button className="quiet small" onClick={() => { signOut(); navigate('/') }}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="main"><Outlet /></main>
    </div>
  )
}
