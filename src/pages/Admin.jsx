import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { setGlobalRole, setAccountStatus } from '../services/actions.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Badge, Empty } from '../components/ui.jsx'
import { GLOBAL_ROLES, PROJECT_ROLES } from '../domain/constants.js'
import { CAPABILITIES, cacTag } from '../domain/cac.js'
import { resolveContext } from '../domain/cac.js'

export default function Admin() {
  const { snap, me, resetDemoData } = useApp()
  const { run, error, busy } = useAction()
  const [query, setQuery] = useState('')

  const users = (snap.users ?? []).filter(u =>
    !query || u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))

  // Which capabilities each global role carries on its own, resolved through
  // the same engine the rest of the app uses rather than a hard-coded table.
  const matrix = Object.values(GLOBAL_ROLES).map(role => ({
    role,
    caps: [...resolveContext({ id: '_', globalRole: role }, null).grants.keys()],
  }))

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Administration</div>
        <h1>Accounts and access configuration</h1>
        <p className="lede">
          The System Administrator manages accounts and the CAC tag architecture. The role
          carries no document-workflow capability — annotation and review stay with the
          Adviser, Instructor 1 and the panel.
        </p>
      </header>

      <Section
        title={`Accounts (${users.length})`}
        aside={<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" style={{ width: 260 }} />}
      >
        <table>
          <thead><tr><th>Name</th><th>Institutional email</th><th>Global role</th><th className="tight">Status</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}{u.idNumber && <div className="mono faint" style={{ fontSize: 11.5 }}>{u.idNumber}</div>}</td>
                <td className="mono small muted">{u.email}</td>
                <td>
                  <select value={u.globalRole} disabled={busy}
                    onChange={e => run(() => setGlobalRole(me, u.id, e.target.value))} style={{ width: 'auto' }}>
                    {Object.values(GLOBAL_ROLES).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="tight">
                  <button className="quiet small" disabled={busy}
                    onClick={() => run(() => setAccountStatus(me, u.id, u.status === 'Active' ? 'Deactivated' : 'Active'))}>
                    <Badge tone={u.status === 'Active' ? 'ok' : 'stop'}>{u.status}</Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionError error={error} />
        <p className="faint small" style={{ marginTop: 10 }}>
          Deactivating an account blocks sign-in but never removes historical academic records.
        </p>
      </Section>

      <Section title="CAC tag architecture">
        <p className="small muted">
          Permissions are resolved from a global tag plus any project tags the user holds.
          A capability is granted if either dimension grants it — which is why the same
          person can review one project and only observe another.
        </p>

        <div className="label" style={{ margin: '18px 0 8px' }}>Global role tags</div>
        <table>
          <thead><tr><th>Tag</th><th>Role</th><th>Institution-wide capabilities</th></tr></thead>
          <tbody>
            {matrix.map(m => (
              <tr key={m.role}>
                <td><span className="tag">{cacTag(m.role)}</span></td>
                <td className="small">{m.role}</td>
                <td className="mono faint" style={{ fontSize: 11.5 }}>
                  {m.caps.length ? m.caps.join('  ') : 'none — authority is project-based only'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="label" style={{ margin: '22px 0 8px' }}>Project role tags</div>
        <div className="inline">
          {['Group Member', ...Object.values(PROJECT_ROLES)].map(r => (
            <span key={r} className="tag">{cacTag(r)}</span>
          ))}
        </div>

        <div className="label" style={{ margin: '22px 0 8px' }}>Capability dictionary</div>
        <table>
          <thead><tr><th>Capability</th><th>Meaning</th></tr></thead>
          <tbody>
            {Object.entries(CAPABILITIES).map(([cap, desc]) => (
              <tr key={cap}><td className="mono" style={{ fontSize: 12 }}>{cap}</td><td className="small muted">{desc}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Prototype data">
        <p className="small muted">
          Restores the five demo projects to their starting stages. Anything you created is discarded.
        </p>
        <button className="danger" disabled={busy} onClick={() => run(resetDemoData)}>
          Reset demo data
        </button>
      </Section>
    </div>
  )
}
