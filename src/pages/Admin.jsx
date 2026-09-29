import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import {
  setGlobalRoles, setAccountStatus, setProgramScope, revokeCapability, liftOverride, updateRevisionDays,
} from '../services/actions.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Restricted, Empty, Field, fmtDate, fmtDateTime } from '../components/ui.jsx'
import {
  GLOBAL_ROLES as G, PROJECT_ROLES, ACCOUNT_STATUS, PROGRAMS, PROGRAM_INFO, accountType, programCode, parseSection,
} from '../domain/constants.js'
import {
  CAPABILITIES, PROJECT_POLICIES, INSTITUTION_POLICIES, caacTag, resolveInstitution, can,
} from '../domain/caac.js'
import { FLAGS } from '../domain/flags.js'
import { revisionDaysOf, settingsOf, REVISION_DAYS_LIMITS } from '../domain/settings.js'

const OFFICE_ROLES = Object.values(G).filter(r => r !== G.STUDENT)
const STATUS_TONE = { Active: 'ok', Inactive: 'neutral', Suspended: 'stop' }
const PROJECT_CAPS = new Set(PROJECT_POLICIES.map(p => p.cap))

// Account categories for the pills on the Accounts page: each student belongs
// to their program; faculty and office accounts form one group of their own.
const FACULTY_CATEGORY = 'FAC'
const CATEGORIES = [
  ...PROGRAM_INFO.map(p => ({ key: p.code, label: p.code, title: p.name })),
  { key: FACULTY_CATEGORY, label: 'Faculty & offices', title: 'Faculty and office accounts' },
]
const programOf = (u) => u.program || parseSection(u.block)?.program || ''
const categoryOf = (u) => accountType(u.email) === 'Student'
  ? (programCode(programOf(u)) || 'Unknown') : FACULTY_CATEGORY

/** A student's program as a pill: the code, the full name on hover. */
function ProgramPill({ u }) {
  if (accountType(u.email) !== 'Student' || !programOf(u)) return null
  return <span className="program-pill" title={programOf(u)}>{programCode(programOf(u))}</span>
}

/** Accounts that registered and are not active yet (S0.1–S0.3). */
export const pendingAccounts = (users) => (users ?? []).filter(u => u.status === ACCOUNT_STATUS.INACTIVE)

// Administration is three pages, each reached from its own link in the rail:
//   /admin/accounts  Accounts — activation, Global Roles, program scope (S0.3)
//   /admin/caac      CAAC configuration — permission overrides, tags and policies
//   /admin/settings  Global settings — the revision countdown (S7.6)
// None of them gives the System Administrator a manuscript or workflow capability.

function AdminPage({ cap, deny, label, title, lede, children }) {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  if (!can(inst, cap)) return <Restricted>{deny}</Restricted>
  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Administration · {label}</div>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </header>
      {children}
    </div>
  )
}

export function AccountsPage() {
  return (
    <AdminPage
      cap="admin.accounts" label="Accounts" title="Accounts"
      deny="Account administration belongs to the System Administrator."
      lede="Activate verified registrations, grant and remove Global Roles, and set each Program Chair/Coordinator’s programs. The System Administrator cannot open a document, approve a gate, sign a form or assign a project role."
    >
      <Accounts />
    </AdminPage>
  )
}

export function CaacPage() {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  const overrides = FLAGS.PERMISSION_OVERRIDES === 'deny-only' && can(inst, 'admin.caac')
  const [tab, setTab] = useState(overrides ? 'overrides' : 'caac')
  const activeOverrides = (snap.permissionOverrides ?? []).filter(o => !o.liftedAt)
  const tabs = [
    ...(overrides ? [{ key: 'overrides', label: 'Permission overrides', n: activeOverrides.length }] : []),
    { key: 'caac', label: 'Tags and policies' },
  ]
  return (
    <AdminPage
      cap="admin.caac" label="CAAC configuration" title="CAAC configuration"
      deny="CAAC configuration belongs to the System Administrator."
      lede="Every permission is a role paired with the context it applies in. Review which tags each account holds and the policies behind them, and revoke a capability from one account where needed. An override can only take a permission away."
    >
      <div className="tabs" role="tablist" aria-label="CAAC configuration">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}{t.n > 0 && <span className="tab-n">{t.n}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overrides' && overrides && <Overrides />}
        {tab === 'caac' && <TagsAndPolicies />}
      </div>
    </AdminPage>
  )
}

export function SettingsPage() {
  return (
    <AdminPage
      cap="settings.manage" label="Global settings" title="Global settings"
      deny="Global settings belong to the System Administrator."
      lede="Settings that apply to every project."
    >
      <Settings />
    </AdminPage>
  )
}

// --- Accounts ------------------------------------------------------------------

function Accounts() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')

  const users = snap.users ?? []
  const pending = pendingAccounts(users).sort((a, b) => Number(b.emailVerified) - Number(a.emailVerified))
  const q = query.trim().toLowerCase()
  // Status and search narrow the list first; the pill counts follow them.
  const matching = users.filter(u =>
    (!status || u.status === status) &&
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
  const count = (key) => matching.filter(u => categoryOf(u) === key).length
  const shown = matching.filter(u => !category || categoryOf(u) === category)

  return (
    <>
      <Section title={`Awaiting activation (${pending.length})`}>
        {pending.length === 0 && <Empty>No registrations are waiting. New accounts appear here after they register.</Empty>}
        {pending.length > 0 && (
          <div className="table-scroll"><table>
            <thead>
              <tr><th>Account</th><th>Type</th><th className="tight">Registered</th><th>Email</th><th className="tight" /></tr>
            </thead>
            <tbody>
              {pending.map(u => (
                <tr key={u.id}>
                  <td>
                    <div>{u.name}</div>
                    <div className="mono faint" style={{ fontSize: 11.5 }}>{u.email}</div>
                  </td>
                  <td className="small muted">
                    <div className="inline">{accountType(u.email)}{u.block && ` · ${u.block}`} <ProgramPill u={u} /></div>
                  </td>
                  <td className="tight small faint">{fmtDate(u.createdAt)}</td>
                  <td className="small">
                    {u.emailVerified
                      ? <span className="signed">Verified</span>
                      : <span className="faint">Not verified yet — the owner has to use the link in the email</span>}
                  </td>
                  <td className="tight">
                    <button className="small" disabled={busy || !u.emailVerified}
                      onClick={() => run(() => setAccountStatus(me, snap, u.id, ACCOUNT_STATUS.ACTIVE))}>
                      Activate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="faint small" style={{ marginTop: 12 }}>
          Activation follows email verification (flag ACCOUNT_ACTIVATION = {FLAGS.ACCOUNT_ACTIVATION}).
          Student addresses start as {caacTag(G.STUDENT)}; faculty addresses start
          as {FLAGS.FACULTY_BASE_IDENTITY ? caacTag(G.FACULTY) : 'no Global Role'}, which grants nothing
          until an office role or a project assignment is added.
        </p>
      </Section>

      <Section
        title={`All accounts (${shown.length})`}
        aside={
          <div className="inline">
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status" className="select-quiet">
              <option value="">Every status</option>
              {Object.values(ACCOUNT_STATUS).map(s => <option key={s}>{s}</option>)}
            </select>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search accounts" style={{ width: 220 }} />
          </div>
        }
      >
        <div className="pills" role="group" aria-label="Filter accounts by program">
          <button className="pill" aria-pressed={!category} onClick={() => setCategory('')}>
            All <span className="pill-n">{matching.length}</span>
          </button>
          {CATEGORIES.map(c => (
            <button key={c.key} className="pill" title={c.title} aria-pressed={category === c.key}
              onClick={() => setCategory(category === c.key ? '' : c.key)}>
              {c.label} <span className="pill-n">{count(c.key)}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 && <Empty>No account matches these filters.</Empty>}
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Account</th><th>Global Roles</th><th className="tight">Status</th></tr>
          </thead>
          <tbody>
            {shown.map(u => <AccountRow key={u.id} u={u} busy={busy} run={run} />)}
          </tbody>
        </table></div>
        <ActionError error={error} />
        <p className="faint small" style={{ marginTop: 12 }}>
          Changing an account’s status never removes its academic records. Project-Based Roles are not
          granted here: Instructor 1 comes from teaching a Capstone 1 section, and the Adviser, panel and
          Instructor 2 are assigned by the Program Chair/Coordinator on each project.
        </p>
      </Section>
    </>
  )
}

function AccountRow({ u, busy, run }) {
  const { snap, me } = useApp()
  const type = accountType(u.email)
  const options = type === 'Student' ? [G.STUDENT] : OFFICE_ROLES
  const roles = u.globalRoles ?? []
  const scope = u.programScope ?? []
  const coordinator = roles.includes(G.COORDINATOR)

  return (
    <tr>
      <td>
        <div className="inline">{u.name} <ProgramPill u={u} /></div>
        <div className="mono faint" style={{ fontSize: 11.5 }}>{u.email}</div>
        <div className="faint small">
          {type}{u.block && ` · ${u.block}`}{u.idNumber && ` · ${u.idNumber}`}{!u.emailVerified && ' · email not verified'}
        </div>
      </td>
      <td>
        <div className="inline">
          {roles.map(r => (
            <span key={r} className="tag tag-removable">
              {caacTag(r)}
              <button className="tag-x" disabled={busy} aria-label={`Remove ${r} from ${u.name}`}
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
        {coordinator && (
          <div className="scope">
            <span className="label">Programs coordinated</span>
            <div className="inline">
              {scope.map(p => (
                <span key={p} className="tag tag-removable" title={p}>
                  {programCode(p)}
                  <button className="tag-x" disabled={busy} aria-label={`Remove ${p} from ${u.name}’s programs`}
                    onClick={() => run(() => setProgramScope(me, snap, u.id, scope.filter(x => x !== p)))}>×</button>
                </span>
              ))}
              {scope.length === 0 && (
                <span className="small tone-warn">None yet — this Program Chair/Coordinator sees no project until a program is added</span>
              )}
              {PROGRAMS.some(p => !scope.includes(p)) && (
                <select value="" disabled={busy} aria-label={`Add a program for ${u.name}`}
                  onChange={e => e.target.value && run(() => setProgramScope(me, snap, u.id, [...scope, e.target.value]))}
                  className="select-quiet">
                  <option value="">+ Program…</option>
                  {PROGRAMS.filter(p => !scope.includes(p)).map(p => <option key={p} value={p}>{programCode(p)} — {p}</option>)}
                </select>
              )}
            </div>
          </div>
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
}

// --- Permission overrides (deny-only) --------------------------------------------

/** Every capability some role this account holds could grant — the ones worth revoking. */
function capabilitiesOf(user, snap) {
  const roles = new Set(user.globalRoles ?? [])
  for (const a of snap.projectAssignments ?? []) if (a.userId === user.id) roles.add(a.roleType)
  if ((snap.sections ?? []).some(s => s.instructorId === user.id)) roles.add(PROJECT_ROLES.INSTRUCTOR_1)
  return [...new Set([...PROJECT_POLICIES, ...INSTITUTION_POLICIES].filter(p => roles.has(p.role)).map(p => p.cap))]
}

function Overrides() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [userId, setUserId] = useState('')
  const [capability, setCapability] = useState('')
  const [projectId, setProjectId] = useState('')
  const [reason, setReason] = useState('')

  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id
  const titleOf = (id) => projects.find(p => p.id === id)?.title ?? id
  const target = users.find(u => u.id === userId)
  const caps = target ? capabilitiesOf(target, snap) : []
  const everywhereOnly = capability && !PROJECT_CAPS.has(capability)

  const rows = [...(snap.permissionOverrides ?? [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const active = rows.filter(o => !o.liftedAt)
  const lifted = rows.filter(o => o.liftedAt)

  async function submit() {
    await revokeCapability(me, snap, { userId, capability, projectId: everywhereOnly ? null : projectId || null, reason })
    setCapability(''); setProjectId(''); setReason('')
  }

  return (
    <>
      <Section title="Revoke a capability">
        <p className="small muted" style={{ maxWidth: '72ch' }}>
          An override takes one capability away from one account, on one project or on every
          project, until you lift it. It never adds a permission, so it cannot stand in for an
          assignment or a gate. The guard reports the override as the reason whenever it blocks
          the account.
        </p>
        <div className="row">
          <Field label="Account">
            <select value={userId} onChange={e => { setUserId(e.target.value); setCapability('') }}>
              <option value="">Select an account…</option>
              {users.filter(u => u.id !== me.id).map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
            </select>
          </Field>
          <Field label="Capability" hint={capability ? CAPABILITIES[capability] : 'Only capabilities this account’s roles can grant are listed.'}>
            <select value={capability} onChange={e => setCapability(e.target.value)} disabled={!target}>
              <option value="">{target ? 'Select a capability…' : 'Select an account first'}</option>
              {caps.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Where" hint={everywhereOnly ? 'This capability is not tied to a project.' : undefined}>
            <select value={everywhereOnly ? '' : projectId} onChange={e => setProjectId(e.target.value)} disabled={everywhereOnly}>
              <option value="">Every project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="Reason" hint="Recorded on the override and in the audit trail.">
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. On leave until 15 Oct" />
          </Field>
        </div>
        <div className="actions">
          <button className="primary" disabled={busy || !userId || !capability || !reason.trim()} onClick={() => run(submit)}>
            Revoke capability
          </button>
        </div>
        <ActionError error={error} />
      </Section>

      <Section title={`In force (${active.length})`}>
        {active.length === 0 && <Empty>No overrides are in force. Every account has what its policies grant.</Empty>}
        {active.length > 0 && <OverrideTable rows={active} nameOf={nameOf} titleOf={titleOf}
          action={(o) => (
            <button className="quiet small" disabled={busy} onClick={() => run(() => liftOverride(me, snap, o.id))}>Lift</button>
          )} />}
      </Section>

      {lifted.length > 0 && (
        <details className="policy-group">
          <summary><span className="small muted">Lifted overrides ({lifted.length})</span></summary>
          <OverrideTable rows={lifted} nameOf={nameOf} titleOf={titleOf}
            action={(o) => <span className="faint small">Lifted {fmtDate(o.liftedAt)} by {nameOf(o.liftedBy)}</span>} />
        </details>
      )}
    </>
  )
}

function OverrideTable({ rows, nameOf, titleOf, action }) {
  return (
    <div className="table-scroll"><table>
      <thead>
        <tr><th>Account</th><th>Revoked capability</th><th>Where</th><th>Reason</th><th className="tight">Applied</th><th className="tight" /></tr>
      </thead>
      <tbody>
        {rows.map(o => (
          <tr key={o.id}>
            <td className="small">{nameOf(o.userId)}</td>
            <td><span className="mono" style={{ fontSize: 12 }}>{o.capability}</span></td>
            <td className="small muted">{o.projectId ? titleOf(o.projectId) : 'Every project'}</td>
            <td className="small">{o.reason}</td>
            <td className="tight small faint">{fmtDate(o.createdAt)} · {nameOf(o.createdBy)}</td>
            <td className="tight">{action(o)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// --- Global settings -------------------------------------------------------------

function Settings() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const days = revisionDaysOf(snap)
  const [minor, setMinor] = useState(String(days.Minor))
  const [major, setMajor] = useState(String(days.Major))
  const [saved, setSaved] = useState('')
  const record = settingsOf(snap)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const { min, max } = REVISION_DAYS_LIMITS

  return (
    <Section title="Revision countdown">
      <p className="small muted" style={{ maxWidth: '72ch' }}>
        When the Panel Chair records a verdict with revisions, the group gets this many days before
        the system flags the revisions overdue (S7.6, S8.2).
      </p>
      <div className="row" style={{ maxWidth: 480 }}>
        <Field label="Minor revisions (days)">
          <input type="number" min={min} max={max} step="1" value={minor} onChange={e => { setMinor(e.target.value); setSaved('') }} />
        </Field>
        <Field label="Major revisions (days)">
          <input type="number" min={min} max={max} step="1" value={major} onChange={e => { setMajor(e.target.value); setSaved('') }} />
        </Field>
      </div>
      <div className="actions">
        <button className="primary" disabled={busy}
          onClick={() => run(async () => {
            await updateRevisionDays(me, snap, { Minor: Number(minor), Major: Number(major) })
            setSaved('Saved. The next verdict uses the new length.')
          })}>
          Save
        </button>
        {saved && <span className="small signed" role="status">{saved}</span>}
      </div>
      <ActionError error={error} />
      <p className="note small" style={{ marginTop: 24, maxWidth: '72ch' }}>
        A change applies to verdicts recorded after it. Countdowns already running keep the deadline
        they started with. Whether a change should also move running countdowns has not been
        decided yet (NEW-20).
      </p>
      <p className="faint small" style={{ marginTop: 12 }}>
        {record?.updatedAt
          ? <>Last changed {fmtDateTime(record.updatedAt)} by {nameOf(record.updatedBy)}.</>
          : <>Using the starting values (flag REVISION_DAYS: minor {FLAGS.REVISION_DAYS.Minor}, major {FLAGS.REVISION_DAYS.Major}).</>}
      </p>
    </Section>
  )
}

// --- Tags and policies (read-only) -------------------------------------------------

function TagsAndPolicies() {
  const { snap } = useApp()
  const [tagQuery, setTagQuery] = useState('')
  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const titleOf = (id) => projects.find(p => p.id === id)?.title ?? id

  // Every tag assignment in the system, in one auditable list.
  const tags = [
    ...users.flatMap(u => (u.globalRoles ?? []).map(role => ({
      user: u, role, dimension: 'Global',
      context: role === G.COORDINATOR ? ((u.programScope ?? []).map(programCode).join(', ') || 'No programs yet') : 'Institution-wide',
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
    <>
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
    </>
  )
}
