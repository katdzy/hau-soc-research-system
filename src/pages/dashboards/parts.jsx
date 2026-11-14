import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { reportScope } from '../Reports.jsx'
import { Badge, Section, Field, daysLeft, programShort, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import { can, resolveInstitution } from '../../domain/caac.js'
import { nextGroupNumber } from '../../domain/groupNames.js'
import { canDo, viewBundle } from '../../domain/guard.js'
import { FLAGS } from '../../domain/flags.js'
import { STAGES, sectionNow, courseOfStage, milestoneStatus, stageLabel, adviserReturnOf, stepText } from '../../domain/stages.js'
import { ExportMenu } from '../../components/Export.jsx'
import { GroupDraftReview } from '../../components/GroupDraft.jsx'
import ForwardRosterDialog from '../../components/panels/ForwardRoster.jsx'
import { Act } from '../../components/ViewOnly.jsx'
import { owedBy } from '../../services/worklist.js'
import { addMember, createProject } from '../../services/api.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import Dialog from '../../components/Dialog.jsx'

export { owedBy }
import {
  ACCOUNT_STATUS, DOC_STATUS, DOC_TYPES, COURSES, FORMS, CAPSTONE2_MILESTONES, accountType, programCode,
} from '../../domain/constants.js'

// Pieces every role's dashboard is built from (Figma 01 · Dashboards): a page
// head, four stat tiles, a main column of tables and a narrow side column of
// short lists. Everything is computed from guard-filtered worklist rows.

/** Where an item's work is done: the gate's tab, or the Overview. */
export const itemLink = (r, tab) => `/projects/${r.project.id}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`

export const stageOrder = (r) => STAGES.findIndex(s => s.key === r.project.currentStage)

/** "C1 · Proposal Development" — the course and the step, as the wireframe's tables write it. */
export const stepOf = (p) =>
  p.currentStage === 'ARCHIVED' ? 'Completed' : `${courseOfStage(p.currentStage) === COURSES.C1 ? 'C1' : 'C2'} · ${stageLabel(p.currentStage)}`

export const isOverdue = (p) => p.revisionStatus === 'Overdue' || (daysLeft(p.revisionDeadline) ?? 0) < 0

const sum = (list) => list.reduce((n, t) => n + (t.n ?? 1), 0)

/** Work a context owes across its rows: gates its role can act on, and tasks filed under it. */
export const countKind = (rows, hats, kind) =>
  sum(rows.flatMap(r => r.tasks.filter(t => hats.includes(t.hat) && t.kind === kind)))

/** The status chip on a project row: the most pressing thing about it, for this role. */
export function statusOf(r, hats) {
  const p = r.project
  if (p.currentStage === 'ARCHIVED') return ['Completed', 'ok']
  if (isOverdue(p)) return ['Overdue', 'stop']
  const mine = owedBy([r], hats)
  if (mine.some(i => i.urgent)) return ['Urgent', 'stop']
  if (mine.some(i => i.ready)) return ['Awaiting you', 'warn']
  if (mine.length) return ['Not yet', 'neutral']
  const defense = r.bundle.defenses.find(d => !d.verdict)
  if (defense) return ['Scheduled', 'info']
  return ['On track', 'ok']
}

export const latestDoc = (b) => [...b.documents].sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt))[0] ?? null

// --- layout ------------------------------------------------------------------

export function DeskHead({ sub, notice, children }) {
  return (
    <header className="page-head">
      <h1>Dashboard</h1>
      {sub && <p className="lede">{sub}</p>}
      {notice && <p className="note small m-0 mt-2" role="status">{notice}</p>}
      {children}
    </header>
  )
}

/** One tile. `tone` marks it: accent when something waits, stop when overdue. */
export function Stat({ label, n, tone, to }) {
  const body = (
    <>
      <div className={`n${tone === 'stop' ? ' is-stop' : ''}`}>{n}</div>
      <div className="label">{label}</div>
    </>
  )
  const cls = `stat${tone ? ` is-${tone}` : ''}${to ? ' is-link' : ''}`
  return to ? <Link className={cls} to={to}>{body}</Link> : <div className={cls}>{body}</div>
}

export const Stats = ({ children }) => <div className="stat-row stat-row-4">{children}</div>

export function Columns({ main, side }) {
  return (
    <div className="desk-cols">
      <div className="desk-main">{main}</div>
      <aside className="desk-side" aria-label="At a glance">{side}</aside>
    </div>
  )
}

/** The cell that names a project: title, then section and program. */
export function ProjectCell({ r, tab }) {
  const p = r.project
  return (
    <>
      <Link className="row-link" to={itemLink(r, tab)}>{p.title}</Link>
      <div className="faint small" title={p.program}>{sectionNow(p).section} · {programCode(p.program)}</div>
    </>
  )
}

/**
 * A short list (Figma: "Upcoming", "Recently completed"): each line a title
 * with a supporting line under it and a chip on the right.
 */
export function Feed({ items, empty }) {
  if (!items.length) return <p className="small faint m-0">{empty}</p>
  return (
    <ul className="feed">
      {items.map((it, i) => (
        <li key={it.key ?? i}>
          <div className="feed-text">
            {it.to ? <Link className="feed-title" to={it.to}>{it.title}</Link> : <span className="feed-title">{it.title}</span>}
            {it.sub && <span className="feed-sub">{it.sub}</span>}
          </div>
          {it.chip && <Badge tone={it.chip[1]}>{it.chip[0]}</Badge>}
        </li>
      ))}
    </ul>
  )
}

/** "Waiting for you": what this role owes, ready steps first. */
export function OwedFeed({ rows, hats, empty = 'Nothing is waiting on you right now.', limit = 6 }) {
  const items = owedBy(rows, hats).sort((a, b) => Number(b.urgent ?? 0) - Number(a.urgent ?? 0) || Number(b.ready) - Number(a.ready))
  return (
    <>
      <Feed empty={empty} items={items.slice(0, limit).map(i => ({
        key: `${i.r.project.id}-${i.key}`,
        title: i.label, to: itemLink(i.r, i.tab),
        sub: <>{i.r.project.title} · {sectionNow(i.r.project).section}{i.blocker && <span className="blocker-inline"> — {i.blocker}</span>}</>,
        chip: i.urgent ? ['Urgent', 'stop'] : i.ready ? ['Awaiting you', 'warn'] : ['Not yet', 'neutral'],
      }))} />
      {items.length > limit && <p className="small faint m-0 mt-1">and {items.length - limit} more</p>}
    </>
  )
}

/** Recent workflow history across a context's projects, newest first. */
export function Activity({ rows, limit = 5 }) {
  const { snap, me } = useApp()
  const nameOf = (id) => id === 'system' ? 'System' : (snap.users ?? []).find(u => u.id === id)?.name ?? 'Someone'
  const entries = rows
    .flatMap(r => viewBundle(me, r.bundle).history.map(h => ({ h, r })))
    .sort((a, b) => new Date(b.h.at) - new Date(a.h.at))
    .slice(0, limit)
  return (
    <Feed empty="No activity yet." items={entries.map(({ h, r }) => ({
      key: h.id,
      title: <>{h.fromStage === h.toStage ? (h.note || h.action) : `Moved to ${stageLabel(h.toStage)}`}</>,
      sub: <>{sectionNow(r.project).section} · {h.actorId === me.id ? 'You' : nameOf(h.actorId)} · {fmtDateTime(h.at)}</>,
      to: itemLink(r, 'history'),
    }))} />
  )
}

/** Upcoming defenses across rows, soonest first. */
export function upcomingDefenses(rows, me) {
  return rows.flatMap(r => viewBundle(me, r.bundle).defenses.filter(d => !d.verdict).map(d => ({ r, d })))
    .sort((a, b) => new Date(a.d.scheduledAt) - new Date(b.d.scheduledAt))
}

export function DefenseTable({ items, empty }) {
  if (!items.length) return <p className="small faint m-0">{empty}</p>
  return (
    <div className="table-scroll"><table className="cards">
      <thead><tr><th>Date &amp; time</th><th>Group</th><th>Defense</th><th>Venue</th></tr></thead>
      <tbody>
        {items.map(({ r, d }) => (
          <tr key={d.id}>
            <td className="tight" data-label="Date">{fmtDateTime(d.scheduledAt)}</td>
            <td className="card-title"><ProjectCell r={r} tab="defense" /></td>
            <td className="small" data-label="Defense">{d.type}</td>
            <td className="small muted" data-label="Venue">{d.venue}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// --- office queues ------------------------------------------------------------

/** What is waiting in one office queue: gates filed under it, and office tasks. */
export const queueItems = (q, rows) => rows.flatMap(r => [
  ...r.gates.filter(g => g.gate.queue === q.name && g.hat === q.role)
    .map(g => ({ r, label: g.gate.label, blocker: g.blocker, tab: g.gate.handledIn, steps: g.gate.steps?.(r.bundle), verifies: g.gate.verifies })),
  ...r.tasks.filter(t => t.queue === q.name).map(t => ({ r, label: t.label, blocker: null, tab: t.tab })),
])

/** §4 URO "certificates + manuscript": the current version of each item to verify. */
export function VerifyList({ r, types }) {
  const { me } = useApp()
  const b = viewBundle(me, r.bundle)
  const latest = (t) => b.documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0]
  return (
    <ul className="plain-list small muted mt-half">
      {types.map(t => {
        const d = latest(t)
        return <li key={t}>{t} {d ? <span className="mono">v{d.versionNumber}</span> : <span className="tone-warn">missing</span>}</li>
      })}
    </ul>
  )
}

/** One office queue: the projects waiting on this office at this step. */
export function QueueSection({ q, rows }) {
  const items = queueItems(q, rows)
  return (
    <Section title={q.name} aside={<span className="faint small">{q.role}{items.length ? ` · ${items.length}` : ''}</span>}>
      {items.length === 0 && <p className="small faint m-0">Nothing is waiting here.</p>}
      {items.length > 0 && (
        <div className="table-scroll"><table className="cards">
          <thead><tr><th>Project</th><th>Section</th><th>Status</th><th className="tight" /></tr></thead>
          <tbody>
            {items.map(({ r, label, blocker, tab, steps, verifies }, i) => (
              <tr key={`${r.project.id}-${i}`}>
                <td>
                  <Link className="row-link" to={itemLink(r)}>{r.project.title}</Link>
                  <div className="faint small">{r.stage?.label}</div>
                </td>
                <td className="small muted mono" data-label="Section" title={r.project.program}>{sectionNow(r.project).section}</td>
                <td className="small" data-label="Status">
                  {blocker ? <span className="muted">{blocker}</span> : <span className="ok-inline">Ready: {label}</span>}
                  {steps?.length > 1 && (
                    <div className="faint small">{steps.filter(x => x.done).length} of {steps.length} {steps.length === 2 ? 'approvals' : 'steps'} done</div>
                  )}
                  {verifies && <VerifyList r={r} types={verifies} />}
                  {q.name === 'Needs adviser' && adviserReturnOf(r.bundle) && (
                    <div className="small tone-warn">Returned by the {adviserReturnOf(r.bundle).hat}</div>
                  )}
                </td>
                <td className="tight"><Link className="btn small" to={itemLink(r, tab)}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Section>
  )
}

// --- per-hat facts --------------------------------------------------------------

const MANUSCRIPTS = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT]

/** The one manuscript version a panelist may read (T15). */
export const panelManuscript = (b) => b.documents.filter(d => MANUSCRIPTS.includes(d.docType))
  .sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt))[0] ?? null

/** For a panelist: the open defense and the one manuscript version they may read (T15). */
export function PanelFacts({ r, me }) {
  const b = viewBundle(me, r.bundle)
  const defense = b.defenses.find(d => !d.verdict)
  const latest = panelManuscript(b)
  if (!defense && !latest) return null
  return (
    <dl className="kv panel-facts">
      {defense && <><dt>{defense.type} defense</dt><dd>{fmtDateTime(defense.scheduledAt)} · {defense.venue}</dd></>}
      {latest && (
        <>
          <dt>Latest manuscript</dt>
          <dd><Link to={`/projects/${r.project.id}?tab=documents`}>{latest.docType} v{latest.versionNumber}</Link>
            <span className="faint small"> · {latest.status}</span></dd>
        </>
      )}
    </dl>
  )
}

/**
 * For Instructor 2: where the group stands in Capstone 2 — milestones (S6.5),
 * readiness and the recommendation (S6.7), the PC's endorsement (S7.1), the
 * final-defense schedule (S7.3) and post-defense requirements (S8.5).
 */
export function Capstone2Facts({ r, me }) {
  const b = viewBundle(me, r.bundle)
  const at = STAGES.findIndex(s => s.key === b.project.currentStage)
  const idx = (key) => STAGES.findIndex(s => s.key === key)
  const done = milestoneStatus(b.project)
  const confirmed = CAPSTONE2_MILESTONES.filter(m => done[m.key]).length
  const approvedLogs = b.weeklyLogs.filter(l => l.status === 'Approved').length
  const final = b.defenses.filter(d => d.type === 'Final').sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0]
  const recommended = b.forms.some(f => f.formType === FORMS.F2005.code)
  return (
    <dl className="kv panel-facts">
      <dt>Milestones</dt>
      <dd>{confirmed} of {CAPSTONE2_MILESTONES.length} confirmed · {approvedLogs} weekly log{approvedLogs === 1 ? '' : 's'} approved</dd>
      <dt>Readiness</dt>
      <dd>
        {FLAGS.I2_READINESS_CHECK === 'own-step' && <>{b.project.readinessConfirmedAt ? 'Confirmed' : 'Not confirmed'} · </>}
        {recommended ? `${FORMS.F2005.code} submitted` : `${FORMS.F2005.code} not yet`}
        {at >= idx('FINAL_DEFENSE_SCHEDULING') ? ' · endorsed by the Program Chair' : recommended ? ' · awaiting endorsement' : ''}
      </dd>
      <dt>Final defense</dt>
      <dd>
        {final ? <>{fmtDateTime(final.scheduledAt)} · {final.venue}{final.verdict && <span className="faint"> · {final.verdict}</span>}</>
          : can(r.ctx, 'defense.schedule') ? 'Not scheduled yet — yours to publish' : 'Not scheduled'}
      </dd>
      {at >= idx('FINAL_REVISION') && (
        <><dt>Post-defense</dt><dd>{b.project.postDefenseConfirmedAt ? `Course requirements confirmed ${fmtDate(b.project.postDefenseConfirmedAt)}` : 'Course requirements not confirmed'}</dd></>
      )}
    </dl>
  )
}

// --- school-level ------------------------------------------------------------------

/**
 * NEW-11 (flag PC_PROGRAM_VISIBILITY): program-level counts for every project
 * in the user's report scope, including ones they cannot open right now.
 */
export function ProgramSummary({ title }) {
  const { snap, me } = useApp()
  const { scope, projects } = reportScope(me, snap)
  const programs = [...new Set(projects.map(p => p.program))]
  const bucket = (p) => p.currentStage === 'ARCHIVED' ? 'archived'
    : courseOfStage(p.currentStage) === COURSES.C1 ? 'c1' : 'c2'
  const count = (list, k) => list.filter(p => bucket(p) === k).length
  const overdue = (list) => list.filter(isOverdue).length
  return (
    <Section title={title ?? (scope ? 'Your programs at a glance' : 'Projects by program')} aside={<Link className="small" to="/reports">Reports</Link>}>
      <div className="table-scroll"><table className="cards">
        <thead>
          <tr><th>Program</th><th className="tight">Capstone 1</th><th className="tight">Capstone 2</th><th className="tight">Completed</th><th className="tight">Overdue</th></tr>
        </thead>
        <tbody>
          {programs.map(name => {
            const list = projects.filter(p => p.program === name)
            return (
              <tr key={name}>
                <td className="card-title" title={name}><strong>{programCode(name)}</strong> <span className="faint small prog-long">{programShort(name)}</span></td>
                <td className="tight mono" data-label="Capstone 1">{count(list, 'c1')}</td>
                <td className="tight mono" data-label="Capstone 2">{count(list, 'c2')}</td>
                <td className="tight mono" data-label="Completed">{count(list, 'archived')}</td>
                <td className="tight mono" data-label="Overdue">{overdue(list) ? <Badge tone="stop">{overdue(list)}</Badge> : 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <p className="faint small mt-1 mb-0">Counts only. A project opens to you while one of its steps is yours.</p>
    </Section>
  )
}

/**
 * S-12 / S-20 — every project in the office's scope (the Program Chair's
 * programs; the whole school for the Dean and AD), filterable and exportable.
 * Status data only (NEW-11): group, members, adviser, step. A row opens the
 * project only where the office may view it now.
 */
export function ProjectDirectory({ title = 'All projects', canOpen }) {
  const { snap, me } = useApp()
  const { scope, projects } = reportScope(me, snap)
  const [q, setQ] = useState('')
  const [program, setProgram] = useState('')
  const [stage, setStage] = useState('')
  const [block, setBlock] = useState('')
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const membersOf = (p) => (snap.projectMembers ?? []).filter(m => m.projectId === p.id).map(m => nameOf(m.userId))
  const adviserOf = (p) => {
    const a = (snap.projectAssignments ?? []).find(x => x.projectId === p.id && x.roleType === 'Adviser')
    return a ? nameOf(a.userId) : 'Not assigned'
  }
  const programs = [...new Set(projects.map(p => p.program))]
  const blocks = [...new Set(projects.map(p => sectionNow(p).section).filter(Boolean))].sort()
  const stages = STAGES.filter(st => projects.some(p => p.currentStage === st.key))
  const needle = q.trim().toLowerCase()
  const shown = projects
    .filter(p => (!program || p.program === program) && (!stage || p.currentStage === stage) && (!block || sectionNow(p).section === block))
    .filter(p => !needle || [p.title, p.groupName, sectionNow(p).section, adviserOf(p), ...membersOf(p)].some(v => v?.toLowerCase().includes(needle)))
    .sort((a, b) => String(sectionNow(a).section).localeCompare(String(sectionNow(b).section)) || String(a.title).localeCompare(String(b.title)))
  const statusText = (p) => (p.currentStage === 'ARCHIVED' ? 'Completed' : isOverdue(p) ? 'Overdue' : 'In progress')
  const label = scope ? scope.map(programCode).join(', ') : 'SOC'

  return (
    <Section title={`${title} · ${shown.length} of ${projects.length}`}
      aside={<ExportMenu name={`${label.replace(/,\s*/g, '-')}_Projects`} title={`HAU — SOC · ${label} projects`}
        header={['Group', 'Members', 'Block', 'Program', 'Title', 'Adviser', 'Current step', 'Status']}
        rows={shown.map(p => [p.groupName ?? '', membersOf(p).join('; '), sectionNow(p).section, programCode(p.program), p.title, adviserOf(p), stepOf(p), statusText(p)])} />}>
      <div className="filters">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Title, group, member or adviser…" aria-label="Search projects" />
        {programs.length > 1 && (
          <select value={program} onChange={e => setProgram(e.target.value)} aria-label="Program">
            <option value="">All programs</option>
            {programs.map(x => <option key={x} value={x}>{programCode(x)}</option>)}
          </select>
        )}
        <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {stages.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
        </select>
        <select value={block} onChange={e => setBlock(e.target.value)} aria-label="Block">
          <option value="">All blocks</option>
          {blocks.map(x => <option key={x}>{x}</option>)}
        </select>
      </div>
      {shown.length === 0 ? <p className="empty">No project matches.</p> : (
        <div className="table-scroll"><table className="cards">
          <thead><tr><th>Group</th><th>Title</th><th>Adviser</th><th>Current step</th><th className="tight">Status</th></tr></thead>
          <tbody>
            {shown.map(p => {
              const st = statusText(p)
              return (
                <tr key={p.id}>
                  <td className="small" data-label="Group">
                    <strong>{p.groupName ?? sectionNow(p).section}</strong>
                    <div className="faint">{sectionNow(p).section} · {membersOf(p).length} members</div>
                  </td>
                  <td className="card-title">
                    {canOpen?.(p) ? <Link className="row-link" to={`/projects/${p.id}`}>{p.title}</Link> : p.title}
                    <div className="faint small">{membersOf(p).join(', ')}</div>
                  </td>
                  <td className="small" data-label="Adviser">{adviserOf(p)}</td>
                  <td className="small" data-label="Current step">{stepOf(p)}</td>
                  <td className="tight card-status"><Badge tone={st === 'Overdue' ? 'stop' : st === 'Completed' ? 'ok' : 'neutral'}>{st}</Badge></td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
    </Section>
  )
}

/** S10.1 — a way into the records-table archive. */
export function RecordsSearch() {
  const { snap } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const archived = (snap.projects ?? []).filter(p => p.currentStage === 'ARCHIVED').length
  return (
    <Section title="Records archive" aside={<Link className="small" to="/records">Open archive</Link>}>
      <form className="records-search" role="search" onSubmit={e => { e.preventDefault(); navigate(`/records${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the records archive"
          placeholder="Search title, area, adviser or student" />
        <button type="submit">Search</button>
      </form>
      <p className="faint small mt-1 mb-0">
        {archived} archived project{archived === 1 ? '' : 's'} with a Pass result. Records hold no grades and no manuscript text.
      </p>
    </Section>
  )
}

/** "Step 2 of 9" — where a group is among its course's steps, counted as everywhere else (stepText). */
export const stepCount = (p) => stepText(p.currentStage)

/** Where a group is on the way to its adviser, for the chip at the foot of its card. */
const sentState = (r) => {
  const at = stageOrder(r)
  if (at <= STAGES.findIndex(s => s.key === 'GROUP_FORMATION')) return ['Not sent']
  if (at <= STAGES.findIndex(s => s.key === 'ADVISER_APPROVAL')) return ['Sent to Program Chair']
  return ['Adviser assigned', 'ok']
}

/**
 * §4 Instructor 1, one per Capstone 1 section taught (Figma S-22): the
 * section's groups as cards — members, current step, what waits on the
 * instructor — beside the students still without a group and the roster
 * actions. Groups are the ones visible to this user right now (CAAC), so a
 * group routed to Capstone 2 drops out here (NEW-6, flag I1_ACCESS_AFTER_ROUTING).
 */
export function BlockDesk({ section, rows }) {
  const { snap, me } = useApp()
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const groups = rows.filter(r => r.project.sectionId === section.id)
    .sort((x, y) => (x.project.groupNumber ?? 0) - (y.project.groupNumber ?? 0) || String(x.project.title).localeCompare(String(y.project.title)))
  const grouped = new Set((snap.projectMembers ?? []).map(m => m.userId))
  const roster = users.filter(u => accountType(u.email) === 'Student' && u.block === section.block && u.status === ACCOUNT_STATUS.ACTIVE)
  const ungrouped = roster.filter(u => !grouped.has(u.id))
  const queue = reviewQueue(groups, me)
  // Groups this instructor can forward now (Figma S-22 "Send groups to Program Chair"):
  // the roster gate is open and its precondition met — an empty group is not
  // counted. A group short of GROUP_SIZE still is (NEW-31: not blocked).
  const forwardable = groups.filter(r => r.gates.some(g => g.gate.action === 'ENDORSE_ROSTER' && !g.blocker))
  // Unsent groups the gate still refuses (no students yet), named under the button.
  const empty = groups.filter(r => r.gates.some(g => g.gate.action === 'ENDORSE_ROSTER' && g.blocker))
  // Groups that can still take students: at Group Formation, with a seat free.
  const open = groups.filter(r => r.bundle.members.length < FLAGS.GROUP_SIZE && canDo(me, 'manageRoster', r.bundle).ok)
  // A new group is made here, on the board, for this section (S1.1) — no detour to Projects.
  const inst = resolveInstitution(me, snap)
  const canCreate = can(inst, 'group.create') && inst.sections.some(s => s.id === section.id)
  const [forwarding, setForwarding] = useState(false)
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const chosen = ungrouped.filter(u => picked.has(u.id))
  const toggle = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const statusFor = (r) => {
    if (queue.some(x => x.r === r)) return ['Ready for your check', 'warn']
    const [label, tone] = statusOf(r, ['Instructor 1'])
    return label === 'On track' ? null : [label, tone]
  }

  return (
    <section className="roster-board" aria-labelledby={`blk-${section.id}`}>
      <header className="roster-head">
        <h2 id={`blk-${section.id}`}>{section.block}</h2>
        <p className="small muted m-0">
          {section.course} · {section.term} · {roster.length} student{roster.length === 1 ? '' : 's'} enrolled · {programShort(section.program)}
        </p>
      </header>

      {ungrouped.length > 0 && (
        <div className="roster-notice" role="status">
          <strong>{ungrouped.length} student{ungrouped.length === 1 ? ' is' : 's are'} not in a group yet</strong>
          <span>Add them to a group before you send the groups on. Once a group is sent to the Program Chair, its members can no longer be changed here.</span>
        </div>
      )}

      <div className="roster-cols">
        <div className="roster-main">
          {FLAGS.STUDENT_GROUP_DRAFTS && <GroupDraftReview section={section} />}

          {groups.length === 0 && <p className="small faint m-0 mb-2">No groups in Capstone 1 for this section yet.</p>}
          <div className="group-cards">
            {groups.map(r => {
              const status = statusFor(r)
              const [sent, sentTone] = sentState(r)
              const n = r.bundle.members.length
              const waiting = queue.filter(x => x.r === r)
              return (
                <article className="group-card" key={r.project.id} aria-labelledby={`grp-${r.project.id}`}>
                  <header className="group-card-head">
                    <h3 id={`grp-${r.project.id}`}>{r.project.title}</h3>
                    <span className={`small ${n < FLAGS.GROUP_SIZE ? 'tone-warn' : 'faint'}`}>{n} member{n === 1 ? '' : 's'}</span>
                  </header>
                  <ul className="plain-list small">
                    {r.bundle.members.map(m => <li key={m.id}>{nameOf(m.userId)}</li>)}
                    {n === 0 && <li className="faint">No students yet</li>}
                  </ul>
                  <div className="group-card-step">
                    <span>{stepCount(r.project)} · {r.stage?.label}</span>
                    {status ? <Badge tone={status[1]}>{status[0]}</Badge> : <span className="faint" aria-hidden="true">—</span>}
                    <Link className="group-card-open" to={waiting.length ? itemLink(r, 'documents') : itemLink(r)}>
                      {waiting.length ? `Check ${waiting[0].d.docType} v${waiting[0].d.versionNumber}` : 'Open group'} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                  <footer className="group-card-foot">
                    <Badge tone={sentTone}>{sent}</Badge>
                    {canDo(me, 'manageRoster', r.bundle).ok && <Act><Link className="small" to={itemLink(r)}>Edit members</Link></Act>}
                  </footer>
                </article>
              )
            })}
            {canCreate && (
              <Act>
                <button type="button" className="group-card is-new" onClick={() => setCreating(true)}>
                  <strong><span aria-hidden="true">+ </span>Create group</strong>
                  <span className="small faint">Then add students from the unassigned list</span>
                </button>
              </Act>
            )}
          </div>
        </div>

        <aside className="roster-side" aria-label={`Section ${section.block} roster`}>
          <div className="roster-box">
            <h3>Unassigned students ({ungrouped.length})</h3>
            {ungrouped.length === 0
              ? <p className="small muted m-0">{roster.length ? `All ${roster.length} enrolled students are in a group.` : 'No student has registered in this section yet.'}</p>
              : (
                <>
                  <ul className="pick-list">
                    {ungrouped.map(u => (
                      <li key={u.id}>
                        <label>
                          <Act><input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} /></Act>
                          <span>{u.name} <span className="faint mono small">{u.idNumber}</span></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Act>
                    <button type="button" disabled={!chosen.length} onClick={() => setAdding(true)}>
                      Add selected to group…
                    </button>
                  </Act>
                </>
              )}
          </div>

          <div className="roster-box is-accent">
            <h3>Roster actions</h3>
            <Act>
              <button type="button" className="primary" disabled={!forwardable.length} onClick={() => setForwarding(true)}>
                Send groups to Program Chair{forwardable.length ? ` (${forwardable.length})` : ''}
              </button>
            </Act>
            <p className="small muted m-0">
              {forwardable.length
                ? `Sends ${forwardable.map(r => r.project.title).join(', ')} so the Program Chair can assign an adviser. The assignment then goes to the Associate Dean and the Dean for approval.${empty.length ? ` ${empty.map(r => r.project.title).join(', ')} ${empty.length === 1 ? 'has' : 'have'} no students yet.` : ''}`
                : empty.length
                  ? `Add students to ${empty.map(r => r.project.title).join(', ')} before ${empty.length === 1 ? 'it is' : 'they are'} sent.`
                  : groups.length
                  ? 'Every group here has been sent. New groups appear here once they are formed.'
                  : 'Groups appear here once they are formed. Sent groups go on to adviser assignment.'}
            </p>
          </div>
        </aside>
      </div>

      {forwarding && <ForwardRosterDialog groups={forwardable.map(r => r.bundle)} onClose={() => setForwarding(false)} />}
      {adding && <AddToGroupDialog students={chosen} groups={open} section={canCreate ? section : null}
        onClose={() => setAdding(false)} onDone={() => setPicked(new Set())} />}
      {creating && <CreateGroupDialog section={section} onClose={() => setCreating(false)} />}
    </section>
  )
}

/** The name a section's next group goes by until its topic is registered ("NW-402-3"). */
const nextGroupName = (snap, section) =>
  `${section.block}-${nextGroupNumber((snap.projects ?? []).filter(p => p.sectionId === section.id))}`

/** S-22 "+ Create group": a new, empty group in this section, made without leaving the board. */
function CreateGroupDialog({ section, onClose }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [title, setTitle] = useState('')

  function create() {
    run(async () => {
      await createProject(me, snap, { sectionId: section.id, title })
      onClose()
    })
  }

  return (
    <Dialog
      title={`Create a group in ${section.block}`} sub={`${section.course} · ${section.term}`}
      onClose={busy ? undefined : onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create group'}</button>
      </>}
    >
      <p className="small muted m-0 mb-2">You become the group’s Instructor 1. Add its students from the unassigned list once it is created.</p>
      <Field label="Working title (optional)" hint="Leave it blank: the group goes by its section and number until its topic is registered.">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={nextGroupName(snap, section)} disabled={busy} />
      </Field>
      <ActionError error={error} />
    </Dialog>
  )
}

const NEW_GROUP = 'new'

/**
 * S-22 "Add selected to group…": which group the ticked students join — an
 * open one, or (with `section`, when this instructor may create groups there)
 * a new group made for them in the same step.
 */
function AddToGroupDialog({ students, groups, section, onClose, onDone }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [target, setTarget] = useState('')
  const seats = (r) => FLAGS.GROUP_SIZE - r.bundle.members.length
  const names = students.map(u => u.name).join(', ')
  const canNew = Boolean(section) && students.length <= FLAGS.GROUP_SIZE

  function add() {
    run(async () => {
      const id = target === NEW_GROUP ? (await createProject(me, snap, { sectionId: section.id }))?.id : target
      if (!id) throw new Error('The new group could not be created.')
      for (const u of students) await addMember(me, snap, id, u.id)
      onDone?.()
      onClose()
    })
  }

  return (
    <Dialog
      title={`Add ${students.length} student${students.length === 1 ? '' : 's'} to a group`} sub={names}
      onClose={busy ? undefined : onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" disabled={busy || !target} onClick={add}>{busy ? 'Adding…' : 'Add to group'}</button>
      </>}
    >
      {groups.length === 0 && !canNew
        ? <p className="m-0">No group in this section has a free seat{students.length > FLAGS.GROUP_SIZE ? `, and a group holds ${FLAGS.GROUP_SIZE} students` : ''}. Pick fewer students, or free a seat first.</p>
        : (
          <fieldset className="choice">
            <legend className="label">{groups.length ? 'Groups with a free seat' : 'No group has a free seat'}</legend>
            {canNew && (
              <label className="choice-card">
                <input type="radio" name="add-to-group" checked={target === NEW_GROUP} disabled={busy} onChange={() => setTarget(NEW_GROUP)} />
                <span>
                  <strong className="small">New group · {nextGroupName(snap, section)}</strong>
                  <span className="faint small">Created now in {section.block}, with these {students.length === 1 ? 'student' : `${students.length} students`}</span>
                </span>
              </label>
            )}
            {groups.map(r => {
              const short = seats(r) < students.length
              return (
                <label key={r.project.id} className={`choice-card${short ? ' is-disabled' : ''}`}>
                  <input type="radio" name="add-to-group" checked={target === r.project.id} disabled={short || busy} onChange={() => setTarget(r.project.id)} />
                  <span>
                    <strong className="small">{r.project.title}</strong>
                    <span className="faint small">
                      {r.bundle.members.length} of {FLAGS.GROUP_SIZE} members{short ? ` — room for ${seats(r)} only` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}
      <ActionError error={error} />
    </Dialog>
  )
}

/** Submissions an Instructor 1 may decide on or return right now (F07). */
export const reviewQueue = (rows, me) => rows.flatMap(r => r.bundle.documents
  .filter(d => ['reviewDocument', 'returnDocument'].some(a => canDo(me, a, r.bundle, { doc: d }).ok))
  .map(d => ({ r, d })))

export const RETURNED = [DOC_STATUS.FOR_REVISION, DOC_STATUS.REJECTED]
