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
  const [accountCategory, setAccountCategory] = useState('faculty') // 'faculty' | 'student'
  const [tagTab, setTagTab] = useState('global') // 'global' | 'project'

  if (!can(resolveInstitution(me, snap), 'admin.accounts')) {
    return <Restricted>Account and CAAC administration belongs to the System Administrator.</Restricted>
  }

  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const titleOf = (id) => projects.find(p => p.id === id)?.title ?? id
  const q = query.trim().toLowerCase()

  // Separate Faculty vs Students
  const facultyUsers = users.filter(u => accountType(u.email) === 'Faculty')
  const studentUsers = users.filter(u => accountType(u.email) === 'Student')

  const activeUserList = accountCategory === 'faculty' ? facultyUsers : studentUsers
  const shownUsers = activeUserList.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))

  // Global Roles vs Project-Based Role assignments
  const globalTags = users.flatMap(u => (u.globalRoles ?? []).map(role => ({
    user: u, role, dimension: 'Global',
    context: role === G.COORDINATOR ? (u.programScope ?? []).join(', ') : 'Institution-wide',
    since: u.createdAt,
  }))).filter(t => t.user)

  const projectTags = [
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
  const activeTags = tagTab === 'global' ? globalTags : projectTags
  const shownTags = activeTags.filter(t => !tq || [t.user.name, t.role, t.context].some(v => v.toLowerCase().includes(tq)))

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

      {/* Account Management with Faculty vs Student separation */}
      <Section
        title={`User Accounts`}
        aside={
          <div className="inline" style={{ gap: 8 }}>
            <div className="tab-bar" style={{ display: 'inline-flex', margin: 0 }}>
              <button
                type="button"
                className={accountCategory === 'faculty' ? 'primary small' : 'quiet small'}
                onClick={() => setAccountCategory('faculty')}
              >
                Faculty &amp; Staff ({facultyUsers.length})
              </button>
              <button
                type="button"
                className={accountCategory === 'student' ? 'primary small' : 'quiet small'}
                onClick={() => setAccountCategory('student')}
              >
                Students ({studentUsers.length})
              </button>
            </div>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${accountCategory}...`}
              aria-label="Search accounts"
              style={{ width: 200 }}
            />
          </div>
        }
      >
        <p className="small muted" style={{ marginBottom: 14 }}>
          {accountCategory === 'faculty'
            ? 'Faculty and administrative accounts. Global Roles (Dean, Program Chair, URO, System Admin) are granted here.'
            : 'Student accounts enrolled in the School of Computing. Students hold no Global Role; authority comes from project group membership.'}
        </p>

        <div className="table-scroll"><table>
          <thead>
            <tr>
              <th>Account</th>
              <th>{accountCategory === 'faculty' ? 'Global Roles (Admin Set)' : 'Details'}</th>
              <th className="tight">Status</th>
            </tr>
          </thead>
          <tbody>
            {shownUsers.length === 0 && (
              <tr><td colSpan={3} className="faint small text-center" style={{ padding: 20 }}>No {accountCategory} accounts match search.</td></tr>
            )}
            {shownUsers.map(u => {
              const type = accountType(u.email)
              const options = type === 'Student' ? [] : OFFICE_ROLES
              const roles = u.globalRoles ?? []
              return (
                <tr key={u.id}>
                  <td>
                    <div><strong>{u.name}</strong></div>
                    <div className="mono faint" style={{ fontSize: 11.5 }}>{u.email}</div>
                    <div className="faint small">
                      {type}{u.idNumber && ` · ID: ${u.idNumber}`}{u.program && ` · ${u.program}`}{!u.emailVerified && ' · email unverified'}
                    </div>
                  </td>
                  <td>
                    {type === 'Faculty' ? (
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
                            <option value="">+ Grant Global Role…</option>
                            {options.filter(r => !roles.includes(r)).map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className="tag" style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#a1a1aa' }}>
                        @Student
                      </span>
                    )}
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
          Changing an account’s status never removes academic records. Project-Based Roles (Adviser, Panel Chair, Panel Member, Instructor 1/2) are assigned per project by Program Chairs and Instructors.
        </p>
      </Section>

      {/* Tag Assignments split into Global vs Project-Based Role tabs */}
      <Section
        title={`Tag Assignments`}
        aside={
          <div className="inline" style={{ gap: 8 }}>
            <div className="tab-bar" style={{ display: 'inline-flex', margin: 0 }}>
              <button
                type="button"
                className={tagTab === 'global' ? 'primary small' : 'quiet small'}
                onClick={() => setTagTab('global')}
              >
                Global Roles ({globalTags.length})
              </button>
              <button
                type="button"
                className={tagTab === 'project' ? 'primary small' : 'quiet small'}
                onClick={() => setTagTab('project')}
              >
                Project-Based Roles ({projectTags.length})
              </button>
            </div>
            <input
              type="search"
              value={tagQuery}
              onChange={e => setTagQuery(e.target.value)}
              placeholder="Filter tags..."
              aria-label="Filter tag assignments"
              style={{ width: 180 }}
            />
          </div>
        }
      >
        <p className="small muted" style={{ marginBottom: 12 }}>
          {tagTab === 'global'
            ? 'Global Roles grant institutional authority across the School of Computing (set by System Admin).'
            : 'Project-Based Roles are assigned per project during specific workflow stages (set by Program Chair or Instructor 1).'}
        </p>
        <div className="table-scroll"><table>
          <thead><tr><th>Person</th><th>Tag</th><th>Scope / Dimension</th><th>Applies to</th><th className="tight">Granted</th></tr></thead>
          <tbody>
            {shownTags.length === 0 && (
              <tr><td colSpan={5} className="faint small text-center" style={{ padding: 16 }}>No tag assignments found.</td></tr>
            )}
            {shownTags.map((t, i) => (
              <tr key={i}>
                <td className="small"><strong>{t.user.name}</strong></td>
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
          Restores the demo projects to their starting stages. Anything created since is discarded.
        </p>
        <button className="danger" disabled={busy} onClick={() => run(resetDemoData)}>Reset demo data</button>
      </Section>
    </div>
  )
}
