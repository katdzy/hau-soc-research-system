import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { useWorkspace } from '../components/Workspace.jsx'
import { officeQueues } from '../services/worklist.js'
import { Badge, Section, Empty, Restricted, fmtDate, fmtDateTime } from '../components/ui.jsx'
import { viewBundle } from '../domain/guard.js'
import { rowsIn, contextByKey } from '../domain/workspaces.js'
import { sectionNow, courseOfStage, adviserReturnOf } from '../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, COURSES, programCode } from '../domain/constants.js'
import {
  ProjectCell, OwedFeed, DefenseTable, QueueSection, BlockDesk, Capstone2Facts, PanelFacts, ProgramSummary, RecordsSearch, ProjectDirectory,
  Stat, Stats, queueItems, statusOf, stepOf, itemLink, upcomingDefenses, stageOrder, latestDoc,
} from './dashboards/parts.jsx'
import { AssignAdviserDialog, RoutingSlipDialog } from '../components/panels/AdviserRouting.jsx'
import { ExportMenu } from '../components/Export.jsx'
import { Act } from '../components/ViewOnly.jsx'
import { clearedEntries } from './dashboards/Desks.jsx'
import { LOG_LABEL } from '../components/panels/LogsPanel.jsx'

// The pages behind each context's rail (Figma 01 · Dashboards, 03 · Screens
// per user). Every list is built from the worklist — the projects the guard
// lets this user open right now — filtered to the role the page is about.

function Page({ title, lede, aside, children }) {
  return (
    <div className="page">
      <header className={`page-head${aside ? ' has-aside' : ''}`}>
        <div>
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
        </div>
        {aside}
      </header>
      {children}
    </div>
  )
}

/** Rows for one context, whether or not it is the one selected; null when the user does not hold it. */
function useRole(...keys) {
  const { held, rows } = useWorkspace()
  const mine = held.filter(c => keys.includes(c.key))
  if (!mine.length) return null
  const ids = new Set()
  return mine.flatMap(c => rowsIn(c, rows)).filter(r => !ids.has(r.project.id) && ids.add(r.project.id))
}

const sorted = (rows) => [...rows].sort((a, b) => stageOrder(a) - stageOrder(b))

/** Group · step · extra columns · status — the table most pages share. */
function GroupTable({ rows, hats, cols = [], empty = 'No groups here.' }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <div className="table-scroll"><table className="cards">
      <thead>
        <tr><th>Group</th><th>Current step</th>{cols.map(c => <th key={c.head} className={c.tight ? 'tight' : undefined}>{c.head}</th>)}<th className="tight">Status</th></tr>
      </thead>
      <tbody>
        {sorted(rows).map(r => {
          const [label, tone] = statusOf(r, hats)
          return (
            <tr key={r.project.id} className={tone === 'stop' ? 'is-flagged' : undefined}>
              <td className="card-title"><ProjectCell r={r} tab={cols.find(c => c.tab)?.tab} /></td>
              <td className="small" data-label="Current step">{stepOf(r.project)}</td>
              {cols.map(c => <td key={c.head} className={`small${c.tight ? ' tight' : ''}`} data-label={c.head}>{c.cell(r)}</td>)}
              <td className="tight card-status"><Badge tone={tone}>{label}</Badge></td>
            </tr>
          )
        })}
      </tbody>
    </table></div>
  )
}

function useLatest() {
  const { me } = useApp()
  return (r) => {
    const d = latestDoc(viewBundle(me, r.bundle))
    return d ? <>{d.docType} <span className="mono">v{d.versionNumber}</span><div className="faint">{d.status} · {fmtDate(d.submittedAt)}</div></> : <span className="faint">Nothing submitted</span>
  }
}

const logsCell = (r) => {
  const logs = r.bundle.weeklyLogs
  if (!logs.length) return <span className="faint">—</span>
  const waiting = logs.filter(l => l.status === 'Submitted').length
  return <>{logs.filter(l => l.status === 'Approved').length} of {logs.length} reviewed{waiting > 0 && <div className="tone-warn">{waiting} to review</div>}</>
}

// --- Adviser -----------------------------------------------------------------------------

export function Advisees() {
  const rows = useRole('adviser')
  const latest = useLatest()
  if (!rows) return <Restricted>This page lists the groups you advise.</Restricted>
  return (
    <Page title="My advisees" lede="Every group that has you as its Adviser, with where it stands and what it needs from you.">
      <Section title={`${rows.length} advisee group${rows.length === 1 ? '' : 's'}`}>
        <GroupTable rows={rows} hats={[P.ADVISER]} empty="No group has you as its Adviser yet."
          cols={[{ head: 'Latest version', cell: latest }, { head: 'Weekly logs', cell: logsCell }]} />
      </Section>
      <Section title="Waiting for you"><OwedFeed rows={rows} hats={[P.ADVISER]} limit={20} /></Section>
    </Page>
  )
}

export function WeeklyLogs() {
  const rows = useRole('adviser')
  if (!rows) return <Restricted>This page lists your advisees’ weekly consultation logs.</Restricted>
  const withLogs = rows.filter(r => r.bundle.weeklyLogs.length || courseOfStage(r.project.currentStage) === COURSES.C2)
  return (
    <Page title="Weekly logs" lede="Filled FM-AAC-SOC-2003 forms your advisee groups upload during Capstone 2. Open a group to mark each upload as reviewed or return it.">
      <Section title="By group">
        {withLogs.length === 0 ? <Empty>None of your advisees has reached weekly logging yet.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Group</th><th>Last log</th><th>Progress</th><th className="tight" /></tr></thead>
            <tbody>
              {sorted(withLogs).map(r => {
                const last = r.bundle.weeklyLogs.at(-1)
                return (
                  <tr key={r.project.id}>
                    <td className="card-title"><ProjectCell r={r} tab="logs" /></td>
                    <td className="small" data-label="Last log">{last ? <>Week {last.weekNo} · {LOG_LABEL[last.status] ?? last.status}<div className="faint">{fmtDate(last.submittedAt)}</div></> : <span className="faint">None yet</span>}</td>
                    <td className="small" data-label="Progress">{logsCell(r)}</td>
                    <td className="tight"><Link className="btn small" to={itemLink(r, 'logs')}>{last?.status === 'Submitted' ? 'Review this upload' : 'Open logs'}</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Section>
    </Page>
  )
}

// --- shared across faculty contexts ----------------------------------------------------------

export function Versions() {
  const { current, inContext } = useWorkspace()
  const { me } = useApp()
  if (!current || current.member) return <Restricted>Version history lists the projects of the role you are acting as.</Restricted>
  return (
    <Page title="Version history" lede={`Every submission is kept as its own version; nothing is overwritten. Read-only. Showing projects for ${current.heading}${current.role === P.PANEL_CHAIR || current.role === P.PANEL_MEMBER ? ' — panels see the latest version only' : ''}.`}>
      <Section title={`${inContext.length} project${inContext.length === 1 ? '' : 's'}`}>
        {inContext.length === 0 ? <Empty>No projects to show for this role right now.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Group</th><th>Current step</th><th>Latest version</th><th className="tight">Versions</th><th className="tight" /></tr></thead>
            <tbody>
              {sorted(inContext).map(r => {
                const b = viewBundle(me, r.bundle)
                const d = latestDoc(b)
                return (
                  <tr key={r.project.id}>
                    <td className="card-title"><ProjectCell r={r} tab="documents" /></td>
                    <td className="small" data-label="Current step">{stepOf(r.project)}</td>
                    <td className="small" data-label="Latest version">{d ? <>{d.docType} <span className="mono">v{d.versionNumber}</span><div className="faint">{d.status} · {fmtDate(d.submittedAt)}</div></> : <span className="faint">Nothing submitted</span>}</td>
                    <td className="tight mono" data-label="Versions">{b.documents.length}</td>
                    <td className="tight"><Link className="btn small" to={itemLink(r, 'documents')}>Open</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Section>
    </Page>
  )
}

export function Completed() {
  const { current, inContext } = useWorkspace()
  if (!current || current.global) return <Restricted>This page lists the completed groups you worked with.</Restricted>
  const done = inContext.filter(r => r.project.currentStage === 'ARCHIVED')
  return (
    <Page title="Completed groups" lede={`Completed groups you worked with as ${current.heading}. Every completed project is also listed in the Archive.`}>
      <Section title={`${done.length} completed group${done.length === 1 ? '' : 's'}`}>
        {done.length === 0 ? <Empty>None of your groups has completed yet.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Group</th><th>Research area</th><th className="tight">Result</th><th className="tight">Archived</th></tr></thead>
            <tbody>
              {done.map(r => (
                <tr key={r.project.id}>
                  <td className="card-title"><ProjectCell r={r} /></td>
                  <td className="small muted" data-label="Research area">{r.project.researchArea}</td>
                  <td className="tight" data-label="Result"><Badge tone="ok">{r.project.archiveResult ?? 'Completed'}</Badge></td>
                  <td className="tight small" data-label="Archived">{fmtDate(r.project.archivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </Page>
  )
}

// --- Panel -------------------------------------------------------------------------------------

export function Panels() {
  const rows = useRole('panel-chair', 'panel-member')
  const { me } = useApp()
  if (!rows) return <Restricted>This page lists the panels you sit on.</Restricted>
  return (
    <Page title="Assigned panels" lede="Groups where you sit on the panel. You see only the latest manuscript version; your pre-defense notes stay private until the verdict.">
      <Section title={`${rows.length} group${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? <Empty>You are not on a panel yet.</Empty> : (
          <div className="stack">
            {sorted(rows).map(r => {
              const roles = r.ctx.projectRoles.filter(x => PANEL_ROLES.includes(x))
              const [label, tone] = statusOf(r, roles)
              return (
                <article className="hat-row" key={r.project.id}>
                  <div className="entry-head">
                    <div><ProjectCell r={r} /><div className="small muted mt-half">{stepOf(r.project)}</div></div>
                    <div className="inline">{roles.map(x => <Badge key={x} tone="accent">{x}</Badge>)}<Badge tone={tone}>{label}</Badge></div>
                  </div>
                  <PanelFacts r={r} me={me} />
                </article>
              )
            })}
          </div>
        )}
      </Section>
    </Page>
  )
}

// --- Instructor 1 --------------------------------------------------------------------------------

export function Rosters() {
  const rows = useRole('instructor-1')
  const { snap, me } = useApp()
  if (!rows) return <Restricted>This page is for the Instructor 1 of a Capstone 1 section.</Restricted>
  const sections = (snap.sections ?? []).filter(s => s.instructorId === me.id && s.course === COURSES.C1)
  const ids = new Set(sections.map(s => s.id))
  const elsewhere = rows.filter(r => !ids.has(r.project.sectionId))
  return (
    <Page title="Groups & rosters" lede="Your Capstone 1 sections. Open a group to see its progress and submissions; send formed groups to the Program Chair for adviser assignment.">
      {sections.map(s => <BlockDesk key={s.id} section={s} rows={rows} />)}
      {elsewhere.length > 0 && (
        <Section title="Other groups where you are Instructor 1">
          <GroupTable rows={elsewhere} hats={[P.INSTRUCTOR_1]} />
        </Section>
      )}
    </Page>
  )
}

export function Defended() {
  const rows = useRole('instructor-1')
  if (!rows) return <Restricted>This page is for the Instructor 1 of a Capstone 1 section.</Restricted>
  const defended = rows.filter(r => r.bundle.defenses.some(d => d.type === 'Proposal' && d.verdict))
  const verdictOf = (r) => r.bundle.defenses.filter(d => d.type === 'Proposal' && d.verdict).at(-1)
  return (
    <Page title="Defended groups" lede="Groups past their proposal defense. Once the revisions are approved and an Instructor 2 is assigned, you move each one on to Capstone 2.">
      <Section title={`${defended.length} group${defended.length === 1 ? '' : 's'}`}>
        <GroupTable rows={defended} hats={[P.INSTRUCTOR_1]} empty="No group in your sections has defended its proposal yet."
          cols={[
            { head: 'Verdict', cell: (r) => <>{verdictOf(r).verdict}<div className="faint">{fmtDate(verdictOf(r).recordedAt)}</div></> },
            { head: 'Next', cell: (r) => { const g = r.gates.find(x => x.hat === P.INSTRUCTOR_1); return g ? (g.blocker ? <span className="muted">{g.blocker}</span> : <span className="ok-inline">Ready: {g.gate.label}</span>) : <span className="faint">—</span> } },
          ]} />
      </Section>
    </Page>
  )
}

// --- Instructor 2 ----------------------------------------------------------------------------------

export function Scheduling() {
  const rows = useRole('instructor-2')
  const { me } = useApp()
  if (!rows) return <Restricted>This page is for the Instructor 2 of Capstone 2 groups.</Restricted>
  const hats = [P.INSTRUCTOR_2]
  return (
    <Page title="Rosters & scheduling" lede="Your Capstone 2 groups: milestones, readiness for the final defense, and the schedules you publish.">
      <Section title="Upcoming defenses">
        <DefenseTable items={upcomingDefenses(rows, me)} empty="No defense is scheduled for your groups." />
      </Section>
      <Section title={`${rows.length} group${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? <Empty>No group has you as Instructor 2 yet.</Empty> : (
          <div className="stack">
            {sorted(rows).map(r => {
              const [label, tone] = statusOf(r, hats)
              return (
                <article className="hat-row" key={r.project.id}>
                  <div className="entry-head">
                    <div><ProjectCell r={r} /><div className="small muted mt-half">{stepOf(r.project)}</div></div>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <Capstone2Facts r={r} me={me} />
                </article>
              )
            })}
          </div>
        )}
      </Section>
      <Section title="Waiting for you"><OwedFeed rows={rows} hats={hats} limit={20} /></Section>
    </Page>
  )
}

// --- offices: queue pages ------------------------------------------------------------------------------

/** One page of office queues; scrolls to the queue named in the URL hash. */
function QueuePage({ title, lede, contexts, names, children }) {
  const { me } = useApp()
  const rows = useRole(...contexts)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash])
  if (!rows) return <Restricted />
  const roles = contexts.map(k => contextByKey(k).role)
  const queues = officeQueues(me).filter(q => roles.includes(q.role) && (!names || names.includes(q.name)))
  return (
    <Page title={title} lede={lede}>
      {queues.map(q => <div key={q.name} id={q.name} className="anchor"><QueueSection q={q} rows={rows} /></div>)}
      {queues.length === 0 && <Empty>None of your offices runs this queue.</Empty>}
      {children}
    </Page>
  )
}

// --- offices: hubs (Figma S-13a, S-19, S-21b) --------------------------------------------------------------

/** When the project reached the step it is waiting at, and who moved it there. */
function arrival(me, r) {
  const at = r.project.currentStage
  const moves = viewBundle(me, r.bundle).history.filter(h => h.toStage === at && h.fromStage !== at)
  return moves.sort((a, b) => new Date(b.at) - new Date(a.at))[0] ?? null
}

const dayMonth = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'
const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / 864e5) : 0

/** Filter chips over one table: "All" and one per kind that has rows. */
function useKinds(items, kinds) {
  const [kind, setKind] = useState('')
  const present = kinds.filter(k => items.some(i => i.kind === k.key))
  const active = present.some(k => k.key === kind) ? kind : ''
  const pills = present.length > 1 && (
    <div className="pills" role="group" aria-label="Filter">
      <button type="button" className="pill" aria-pressed={!active} onClick={() => setKind('')}>All</button>
      {present.map(k => (
        <button type="button" key={k.key} className="pill" aria-pressed={active === k.key} onClick={() => setKind(k.key)}>{k.pill}</button>
      ))}
    </div>
  )
  return { pills, shown: active ? items.filter(i => i.kind === active) : items }
}

/** The row's dialog stays open by project id, so it follows the live record while it saves. */
function useOpenRow(rows) {
  const [id, setId] = useState(null)
  return [id ? rows.find(r => r.project.id === id) ?? null : null, setId]
}

// The Program Chair's queues, in the wireframe's words; the first four are its tiles.
const PC_KINDS = [
  { key: 'Needs adviser', tile: 'Needs adviser assignment', pill: 'Adviser assignment', chip: 'Needs adviser assignment' },
  { key: 'Needs panel', tile: 'Needs panel assignment', pill: 'Panel assignment', chip: 'Needs panel assignment' },
  { key: 'Recommendations to endorse', tile: 'Needs endorsement', pill: 'Endorsement', chip: 'Needs endorsement' },
  { key: 'Approval Sheets to endorse', tile: 'Needs clearance routing', pill: 'Clearance routing', chip: 'Needs clearance routing' },
  { key: 'Needs Instructor 2', pill: 'Instructor 2', chip: 'Needs Instructor 2' },
  { key: 'Proposal defenses to schedule', pill: 'Proposal defense schedule', chip: 'Needs a defense schedule' },
  { key: 'Final defenses to schedule', pill: 'Final defense schedule', chip: 'Needs a defense schedule' },
]

/** S-13a — every project waiting on the Program Chair, one row each, with its pending action. */
export function Routing() {
  const { me } = useApp()
  const rows = useRole('coordinator')
  const [open, setOpen] = useOpenRow(rows ?? [])
  const role = contextByKey('coordinator').role
  const queues = officeQueues(me).filter(q => q.role === role)
  const kinds = queues.map(q => PC_KINDS.find(k => k.key === q.name) ?? { key: q.name, pill: q.name, chip: q.name })
  const items = queues.flatMap(q => queueItems(q, rows ?? []).map(it => ({ ...it, kind: q.name, since: arrival(me, it.r)?.at ?? it.r.project.createdAt })))
    .sort((a, b) => new Date(a.since) - new Date(b.since))
  const { pills, shown } = useKinds(items, kinds)
  if (!rows) return <Restricted />
  const count = (key) => items.filter(i => i.kind === key).length
  const tiles = PC_KINDS.filter(k => k.tile && kinds.some(x => x.key === k.key))

  return (
    <Page title="Assignments & routing" lede="Every project that needs something from you. Each row shows the action pending on it — open the row to do it.">
      {tiles.length > 0 && (
        <Stats>{tiles.map((k, i) => <Stat key={k.key} label={k.tile} n={count(k.key)} tone={i === 0 && count(k.key) ? 'accent' : undefined} />)}</Stats>
      )}
      {pills}
      <Section className="is-table">
        {shown.length === 0 ? <Empty>Nothing is waiting on you{items.length ? ' in this queue' : ''}.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Group</th><th>Stage</th><th>Pending action</th><th>Waiting since</th><th className="tight" /></tr></thead>
            <tbody>
              {shown.map(({ r, kind, blocker, tab, steps, since }) => {
                const adviser = kind === 'Needs adviser'
                const returned = adviser ? adviserReturnOf(r.bundle) : null
                const days = daysSince(since)
                return (
                  <tr key={`${r.project.id}-${kind}`} className={returned ? 'is-flagged' : undefined}>
                    <td className="card-title">
                      <Link className="row-link" to={itemLink(r)}>{r.project.title}</Link>
                      <div className="faint small" title={r.project.program}>{sectionNow(r.project).section} · {programCode(r.project.program)}</div>
                    </td>
                    <td className="small" data-label="Stage">{stepOf(r.project)}</td>
                    <td className="small" data-label="Pending action">
                      <Badge tone={returned ? 'stop' : 'warn'}>{kinds.find(k => k.key === kind).chip}</Badge>
                      {returned && <div className="small mt-half">Returned by the {returned.hat}</div>}
                      {blocker && !adviser && <div className="muted small mt-half">{blocker}</div>}
                      {steps?.length > 1 && <div className="faint small mt-half">{steps.filter(x => x.done).length} of {steps.length} steps done</div>}
                    </td>
                    <td className="small" data-label="Waiting since">{dayMonth(since)}{days >= 3 && <span className="muted"> · {days} days</span>}</td>
                    <td className="tight">
                      {adviser
                        ? <Act><button type="button" className="small" onClick={() => setOpen(r.project.id)}>Open</button></Act>
                        : <Link className="btn small" to={itemLink(r, tab)}>Open</Link>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Section>
      <p className="small faint m-0">Projects with nothing pending for you don’t appear here; see them on your Dashboard.</p>
      {open && <AssignAdviserDialog r={open} onClose={() => setOpen(null)} />}
    </Page>
  )
}

const EXEC_KINDS = [
  { key: 'adviser', tile: 'Adviser routing slips', pill: 'Adviser routing slips' },
  { key: 'final', tile: 'Final signatures', pill: 'Final signatures' },
  { key: 'form', tile: 'Forms to sign', pill: 'Forms to sign' },
]
const EXEC_QUEUE = { 'Adviser assignments to approve': 'adviser', 'Projects for final approval': 'final' }

/**
 * S-19 / S-21b — what is routed to the Dean's and the Associate Dean's
 * offices. An adviser routing slip opens over the page (M-01 – M-04); the
 * rest open on the project. `only` narrows the page to one kind.
 */
function ExecutiveApprovals({ title, lede, only }) {
  const { me, snap } = useApp()
  const { held } = useWorkspace()
  const rows = useRole('dean', 'associate-dean')
  const [open, setOpen] = useOpenRow(rows ?? [])
  const offices = held.filter(c => c.key === 'dean' || c.key === 'associate-dean').map(c => c.role)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const adviserOf = (r) => nameOf(r.bundle.assignments.find(a => a.roleType === P.ADVISER)?.userId)

  const items = [
    ...officeQueues(me).filter(q => offices.includes(q.role) && EXEC_QUEUE[q.name]).flatMap(q => queueItems(q, rows ?? []).map(it => {
      const kind = EXEC_QUEUE[q.name]
      return {
        ...it, kind,
        item: kind === 'adviser' ? 'Adviser routing slip' : 'Final institutional signature',
        sub: kind === 'adviser' ? <>{adviserOf(it.r)} <span aria-hidden="true">→</span><span className="sr-only">to</span> {it.r.project.title}</> : it.label,
      }
    })),
    ...(rows ?? []).flatMap(r => r.tasks.filter(t => offices.includes(t.hat) && t.kind === 'form')
      .map(t => ({ r, kind: 'form', item: t.label, sub: 'Signed outside the system, then uploaded', tab: t.tab, blocker: null }))),
  ].filter(i => !only || i.kind === only)
    .map(i => ({ ...i, from: arrival(me, i.r) }))
    .sort((a, b) => Number(Boolean(a.blocker)) - Number(Boolean(b.blocker)) || new Date(a.from?.at ?? 0) - new Date(b.from?.at ?? 0))
  const { pills, shown } = useKinds(items, EXEC_KINDS)
  if (!rows) return <Restricted />
  const waiting = items.filter(i => !i.blocker)
  const count = (key) => waiting.filter(i => i.kind === key).length
  const statusText = (i) => (i.blocker ? 'Approved by you' : 'Awaiting you')

  return (
    <Page title={title} lede={lede}
      aside={<ExportMenu name="Executive_Approvals" title={`HAU — SOC · ${title}`}
        header={['Item', 'Group', 'Program', 'Routed by', 'Received', 'Status']}
        rows={items.map(i => [i.item, i.r.project.title, programCode(i.r.project.program), i.from ? [i.from.hat, nameOf(i.from.actorId)].filter(Boolean).join(' — ') : '', i.from ? fmtDate(i.from.at) : '', statusText(i)])} />}>
      {!only && (
        <Stats>
          <Stat label="Awaiting your approval" n={waiting.length} tone={waiting.length ? 'accent' : undefined} />
          {EXEC_KINDS.map(k => <Stat key={k.key} label={k.tile} n={count(k.key)} />)}
        </Stats>
      )}
      {!only && pills}
      <Section className="is-table">
        {shown.length === 0 ? <Empty>Nothing is routed to your office right now.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Item</th><th>Group</th><th>Routed by</th><th>Received</th><th>Status</th><th className="tight" /></tr></thead>
            <tbody>
              {shown.map((i, n) => (
                <tr key={`${i.r.project.id}-${i.kind}-${n}`}>
                  <td className="card-title"><strong>{i.item}</strong><div className="faint small">{i.sub}</div></td>
                  <td className="small" data-label="Group">
                    <Link className="row-link" to={itemLink(i.r, i.tab)}>{i.r.project.title}</Link>
                    <div className="faint" title={i.r.project.program}>{programCode(i.r.project.program)}</div>
                  </td>
                  <td className="small" data-label="Routed by">{i.from ? <>{i.from.hat ?? nameOf(i.from.actorId)}{i.from.hat && <div className="faint">{nameOf(i.from.actorId)}</div>}</> : <span className="faint">—</span>}</td>
                  <td className="small" data-label="Received">{dayMonth(i.from?.at)}</td>
                  <td className="small card-status" data-label="Status">
                    <Badge tone={i.blocker ? 'ok' : 'warn'}>{statusText(i)}</Badge>
                    {i.blocker && <div className="faint small mt-half">{i.blocker.replace(/^You have approved\.\s*/, '')}</div>}
                  </td>
                  <td className="tight">
                    {i.kind === 'adviser'
                      ? <button type="button" className="small" onClick={() => setOpen(i.r.project.id)}>Open</button>
                      : <Link className="btn small" to={itemLink(i.r, i.tab)}>Open</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
      {open && <RoutingSlipDialog r={open} onClose={() => setOpen(null)} />}
    </Page>
  )
}

export const Approvals = () => (
  <ExecutiveApprovals title="Executive approvals"
    lede="Items routed to your office. Every approval or return is date-stamped on the group’s progress trail and emailed to the people concerned." />
)

export const AdviserApprovals = () => (
  <ExecutiveApprovals only="adviser" title="Adviser assignments"
    lede="Adviser assignments the Program Chair routed to the Dean and the Associate Dean. When one office is the named adviser, the other approves alone." />
)

export function School() {
  const rows = useRole('dean', 'associate-dean')
  if (!rows) return <Restricted />
  return (
    <Page title="Student capstone & thesis" lede="Program-level counts for the whole school. A project opens to your office only while one of its steps is yours: adviser approval, final approval, and the archive.">
      <ProgramSummary title="Projects by program" />
      <Section title="Open to you now">
        <GroupTable rows={rows} hats={[G.DEAN, G.ASSOCIATE_DEAN]} empty="No project is at one of your steps right now." />
      </Section>
      <ProjectDirectory title="All thesis and capstone projects" canOpen={(p) => rows.some(r => r.project.id === p.id)} />
    </Page>
  )
}

export function Completions() {
  const rows = useRole('dean', 'associate-dean')
  if (!rows) return <Restricted />
  const done = rows.filter(r => ['FINAL_APPROVAL', 'ARCHIVED'].includes(r.project.currentStage))
    .sort((a, b) => new Date(b.project.archivedAt ?? Date.now()) - new Date(a.project.archivedAt ?? Date.now()))
  return (
    <Page title="Completion records" lede="Projects at the final signature and those completed. Search every archived record from the archive.">
      <Section title={`${done.length} record${done.length === 1 ? '' : 's'}`}>
        <GroupTable rows={done} hats={[G.DEAN, G.ASSOCIATE_DEAN]} empty="No project has reached the final signature yet."
          cols={[
            { head: 'Result', tight: true, cell: (r) => r.project.archiveResult ?? <span className="faint">—</span> },
            { head: 'Completed', tight: true, cell: (r) => r.project.archivedAt ? fmtDate(r.project.archivedAt) : <span className="faint">Awaiting signature</span> },
          ]} />
      </Section>
      <RecordsSearch />
    </Page>
  )
}

// --- URO ------------------------------------------------------------------------------------------------

export const Clearance = () => (
  <QueuePage title="Clearance queue" contexts={['uro']}
    lede="Projects after Approved Revisions: verify the Editor’s Certificate, the Plagiarism Clearance Certificate and the final manuscript, or return the certificates to the group." />
)

export function Cleared() {
  const { snap } = useApp()
  const rows = useRole('uro')
  if (!rows) return <Restricted />
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const project = (id) => (snap.projects ?? []).find(p => p.id === id)
  const cleared = clearedEntries(snap)
  return (
    <Page title="Cleared projects" lede="Clearances already given. A project closes to the URO once it leaves verification, so this list keeps the section and the date only.">
      <Section title={`${cleared.length} cleared`}>
        {cleared.length === 0 ? <Empty>Nothing cleared yet.</Empty> : (
          <div className="table-scroll"><table className="cards">
            <thead><tr><th>Section</th><th>Program</th><th>Cleared by</th><th className="tight">Cleared on</th></tr></thead>
            <tbody>
              {cleared.map(h => {
                const p = project(h.projectId)
                return (
                  <tr key={h.id}>
                    <td className="card-title mono">{p ? sectionNow(p).section : '—'}</td>
                    <td className="small" data-label="Program">{p ? programCode(p.program) : '—'}</td>
                    <td className="small muted" data-label="Cleared by">{nameOf(h.actorId)}</td>
                    <td className="tight small" data-label="Cleared on">{fmtDateTime(h.at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Section>
    </Page>
  )
}
