import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { setGlobalRoles, setAccountStatus } from '../services/actions.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Restricted, fmtDate } from '../components/ui.jsx'
import { GLOBAL_ROLES as G, PROJECT_ROLES, ACCOUNT_STATUS, accountType } from '../domain/constants.js'
import {
  CAPABILITIES, PROJECT_POLICIES, INSTITUTION_POLICIES, caacTag, resolveInstitution, can,
} from '../domain/caac.js'

const OFFICE_ROLES = Object.values(G).filter(r => r !== G.STUDENT)
const STATUS_TONE = { Active: 'ok', Inactive: 'neutral', Suspended: 'stop' }

export default function Admin() {
  const { snap, me, resetDemoData } = useApp()
  const { run, error, busy } = useAction()
  const [query, setQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')

  if (!can(resolveInstitution(me, snap), 'admin.accounts')) {
    return <Restricted>Account and CAAC administration belongs to the System Administrator.</Restricted>
  }

  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const titleOf = (id) => projects.find(p => p.id === id)?.title ?? id
  const q = query.trim().toLowerCase()
  const shown = users.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))

  // Every tag assignment in the system, in one auditable list.
  const tags = [
    ...users.flatMap(u => (u.globalRoles ?? []).map(role => ({
      user: u, role, dimension: 'Global',
      context: role === G.COORDINATOR ? (u.programScope ?? []).join(', ') : 'Institution-wide',
      since: u.createdAt,
    }))),
    ...(snap.sections ?? []).map(s => ({
      user: users.find(u => u.id === s.instructorId), role: PROJECT_ROLES.INSTRUCTOR_1, dimension: 'Section',
      context: `${s.block} · ${s.course} · ${s.term}`, since: null,
    })),
    ...(snap.projectAssignments ?? []).map(a => ({
      user: users.find(u => u.id === a.userId), role: a.roleType, dimension: 'Project',
      context: titleOf(a.projectId), since: a.assignedAt,
    })),
  ].filter(t => t.user)
  const tq = tagQuery.trim().toLowerCase()
  const shownTags = tags.filter(t => !tq || [t.user.name, t.role, t.context].some(v => v.toLowerCase().includes(tq)))

  const policiesByRole = [...PROJECT_POLICIES, ...INSTITUTION_POLICIES].reduce((acc, pol) => {
    (acc[pol.role] ??= []).push(pol)
    return acc
  }, {})

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Administration</div>
        <h1>Accounts and CAAC configuration</h1>
        <p className="lede">
          The System Administrator manages accounts, grants Global Roles, and audits the CAAC tagging
          framework. The role has no manuscript or workflow capability of its own.
        </p>
      </header>

      <Section
        title={`Accounts (${shown.length})`}
        aside={<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search accounts" style={{ width: 240 }} />}
      >
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Account</th><th>Global Roles</th><th className="tight">Status</th></tr>
          </thead>
          <tbody>
            {shown.map(u => {
              const type = accountType(u.email)
              const options = type === 'Student' ? [G.STUDENT] : OFFICE_ROLES
              const roles = u.globalRoles ?? []
              return (
                <tr key={u.id}>
                  <td>
                    <div>{u.name}</div>
                    <div className="mono faint" style={{ fontSize: 11.5 }}>{u.email}</div>
                    <div className="faint small">
                      {type}{u.idNumber && ` · ${u.idNumber}`}{!u.emailVerified && ' · email not verified'}
                    </div>
                  </td>
                  <td>
                    <div className="inline">
                      {roles.map(r => (
                        <span key={r} className="tag tag-removable">
                          {caacTag(r)}
                          <button className="tag-x" disabled={busy} aria-label={`Remove ${r}`}
                            onClick={() => run(() => setGlobalRoles(me, snap, u.id, roles.filter(x => x !== r)))}>×</button>
                        </span>
                      ))}
                      {roles.length === 0 && <span className="faint small">none — project roles only</span>}
                      {options.some(r => !roles.includes(r)) && (
                        <select value="" disabled={busy} aria-label={`Grant a Global Role to ${u.name}`}
                          onChange={e => e.target.value && run(() => setGlobalRoles(me, snap, u.id, [...roles, e.target.value]))}
                          className="select-quiet">
                          <option value="">+ Grant…</option>
                          {options.filter(r => !roles.includes(r)).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="tight">
                    <select value={u.status} disabled={busy || u.id === me.id} aria-label={`Status of ${u.name}`}
                      onChange={e => run(() => setAccountStatus(me, snap, u.id, e.target.value))}
                      className={`select-quiet tone-${STATUS_TONE[u.status]}`}>
                      {Object.values(ACCOUNT_STATUS).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        <ActionError error={error} />
        <p className="faint small" style={{ marginTop: 12 }}>
          Changing an account’s status never removes its academic records. Project-Based Roles are not
          granted here — they come from assignments on each project.
        </p>
      </Section>

      <Section
        title={`Tag assignments (${shownTags.length})`}
        aside={<input type="search" value={tagQuery} onChange={e => setTagQuery(e.target.value)} placeholder="Filter by person, tag or context" aria-label="Filter tag assignments" style={{ width: 240 }} />}
      >
        <p className="small muted">
          Who holds which tag, and where it applies. A Project tag means nothing outside its project.
        </p>
        <div className="table-scroll"><table>
          <thead><tr><th>Person</th><th>Tag</th><th>Dimension</th><th>Applies to</th><th className="tight">Since</th></tr></thead>
          <tbody>
            {shownTags.map((t, i) => (
              <tr key={i}>
                <td className="small">{t.user.name}</td>
                <td><span className="tag">{caacTag(t.role)}</span></td>
                <td className="small muted">{t.dimension}</td>
                <td className="small muted">{t.context}</td>
                <td className="tight small faint">{t.since ? fmtDate(t.since) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Section>

      <Section title="Access policies">
        <p className="small muted">
          No tag carries a permission on its own. Each row pairs a tag with a capability and the
          context that must hold — relationship to the project, its stage, program scope, or a
          conflict check. These are the rules the Cloud Functions and Security Rules enforce.
        </p>
        {Object.entries(policiesByRole).map(([role, pols]) => (
          <details className="policy-group" key={role}>
            <summary>
              <span className="tag">{caacTag(role)}</span>
              <span className="faint small">{pols[0].dimension} · {pols.length} polic{pols.length === 1 ? 'y' : 'ies'}</span>
            </summary>
            <table>
              <thead><tr><th>Capability</th><th>Only when</th></tr></thead>
              <tbody>
                {pols.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <div className="mono" style={{ fontSize: 12 }}>{p.cap}</div>
                      <div className="faint small">{CAPABILITIES[p.cap]}</div>
                    </td>
                    <td className="small muted">{p.when.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </Section>

      <Section title="Prototype data">
        <p className="small muted">
          Restores the six demo projects to their starting stages. Anything created since is discarded.
        </p>
        <button className="danger" disabled={busy} onClick={() => run(resetDemoData)}>Reset demo data</button>
      </Section>
    </div>
  )
}
