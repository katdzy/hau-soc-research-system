import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { reportScope } from '../Reports.jsx'
import { Badge, Section, daysLeft, programShort, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import { can } from '../../domain/caac.js'
import { canDo, viewBundle } from '../../domain/guard.js'
import { FLAGS } from '../../domain/flags.js'
import { STAGES, openGates, sectionNow, courseOfStage, milestoneStatus, stageLabel } from '../../domain/stages.js'
import { ExportMenu } from '../../components/Export.jsx'
import { GroupDraftReview } from '../../components/GroupDraft.jsx'
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
export function owedBy(rows, hats) {
  return rows.flatMap(r => [
    ...r.gates.filter(g => hats.includes(g.hat)).map(g => ({
      r, key: g.gate.action, label: g.gate.label, blocker: g.blocker, tab: g.gate.handledIn, ready: !g.blocker,
    })),
    ...r.tasks.filter(t => hats.includes(t.hat)).map((t, i) => ({
      r, key: `t${i}`, label: t.label, tab: t.tab, ready: true, urgent: t.urgent, kind: t.kind, n: t.n,
    })),
  ])
}

export const countKind = (rows, hats, kind) =>
  sum(rows.flatMap(r => r.tasks.filter(t => hats.includes(t.hat) && t.kind === kind)))

/** The status chip on a project row: the most pressing thing about it, for this role. */
export function statusOf(r, hats) {
  const p = r.project
  if (p.currentStage === 'ARCHIVED') return ['Completed', 'ok']
  if (isOverdue(p)) return ['Overdue', 'stop']
  const mine = owedBy([r], hats)
  if (mine.some(i => i.urgent)) return ['Needs action', 'stop']
  if (mine.some(i => i.ready)) return ['Needs action', 'warn']
  if (mine.length) return ['Waiting', 'neutral']
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
        chip: i.urgent ? ['Urgent', 'stop'] : i.ready ? ['Needs action', 'warn'] : ['Not yet', 'neutral'],
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
        {at >= idx('FINAL_DEFENSE_SCHEDULING') ? ' · endorsed by the Program Chair/Coordinator' : recommended ? ' · awaiting endorsement' : ''}
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

/**
 * §4 Instructor 1, one per Capstone 1 section taught: the section roster, the
 * section's groups by stage, and the submissions waiting on the instructor.
 * Groups are the ones visible to this user right now (CAAC), so a group routed
 * to Capstone 2 drops out here (NEW-6, flag I1_ACCESS_AFTER_ROUTING).
 */
// The section roster lists this many ungrouped students before "Show more".
const ROSTER_SHOWN = 10

export function BlockDesk({ section, rows }) {
  const { snap, me } = useApp()
  const groups = rows.filter(r => r.project.sectionId === section.id)
  const grouped = new Set((snap.projectMembers ?? []).map(m => m.userId))
  const roster = (snap.users ?? [])
    .filter(u => accountType(u.email) === 'Student' && u.block === section.block && u.status === ACCOUNT_STATUS.ACTIVE)
  const ungrouped = roster.filter(u => !grouped.has(u.id))
  const queue = reviewQueue(groups, me)

  return (
    <section className="section" aria-labelledby={`blk-${section.id}`}>
      <div className="section-head mb-half">
        <h2 id={`blk-${section.id}`}>Section {section.block} · {section.course}</h2>
        <Link className="btn small primary" to="/projects?new=1">Create a project group</Link>
      </div>
      <p className="small muted m-0">{programShort(section.program)} · {section.yearLevel} · {section.term}</p>

      <div className="block-grid">
        <div>
          <h3 className="label group-sub">Review queue</h3>
          {queue.length === 0 && <p className="small faint m-0">Nothing is waiting for your decision.</p>}
          <ul className="todo">
            {queue.map(({ r, d }) => (
              <li key={d.id}>
                <Link to={`/projects/${r.project.id}?tab=documents`}>{d.docType} v{d.versionNumber}</Link>
                <span className="faint"> — {r.project.title}</span>
              </li>
            ))}
          </ul>

          {FLAGS.STUDENT_GROUP_DRAFTS && <GroupDraftReview section={section} />}

          <h3 className="label group-sub">Groups by stage</h3>
          {groups.length === 0 && <p className="small faint m-0">No groups in Capstone 1 for this section.</p>}
          {groups.length > 0 && (
            <div className="table-scroll"><table className="cards">
              <thead><tr><th>Group</th><th>Stage</th><th>Now</th><th className="tight">Students</th></tr></thead>
              <tbody>
                {[...groups].sort((x, y) => stageOrder(x) - stageOrder(y)).map(r => {
                  const ready = r.gates.find(g => !g.blocker)
                  const mine = r.gates[0]
                  const next = openGates(r.stage, r.bundle)[0]
                  return (
                    <tr key={r.project.id}>
                      <td><Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link></td>
                      <td className="card-status"><Badge>{r.stage?.label}</Badge></td>
                      <td className="small" data-label="Now">
                        {ready ? <span className="ok-inline">Your step: {ready.gate.label}</span>
                          : mine ? <span className="muted">{mine.blocker}</span>
                            : next ? <span className="muted">Waiting on {next.actorHint}</span> : '—'}
                      </td>
                      <td className={`tight mono${r.bundle.members.length < FLAGS.GROUP_SIZE ? ' tone-warn' : ''}`} data-label="Students">
                        {r.bundle.members.length}/{FLAGS.GROUP_SIZE}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>

        <aside className="group-people" aria-label={`Section ${section.block} roster`}>
          <h3 className="label group-sub mt-0">Section roster</h3>
          <p className="small m-0 mb-1">
            <span className="mono">{roster.length - ungrouped.length}</span> of <span className="mono">{roster.length}</span> students in a group
          </p>
          {ungrouped.length > 0 && (
            <>
              <div className="small muted">Not in a group yet:</div>
              <ul className="plain-list small">
                {ungrouped.slice(0, ROSTER_SHOWN).map(u => <li key={u.id}>{u.name} <span className="faint mono">{u.idNumber}</span></li>)}
              </ul>
              {ungrouped.length > ROSTER_SHOWN && (
                <details className="small mt-1">
                  <summary>Show {ungrouped.length - ROSTER_SHOWN} more</summary>
                  <ul className="plain-list">
                    {ungrouped.slice(ROSTER_SHOWN).map(u => <li key={u.id}>{u.name} <span className="faint mono">{u.idNumber}</span></li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

/** Submissions an Instructor 1 may decide on or return right now (F07). */
export const reviewQueue = (rows, me) => rows.flatMap(r => r.bundle.documents
  .filter(d => ['reviewDocument', 'returnDocument'].some(a => canDo(me, a, r.bundle, { doc: d }).ok))
  .map(d => ({ r, d })))

export const RETURNED = [DOC_STATUS.FOR_REVISION, DOC_STATUS.REJECTED]
