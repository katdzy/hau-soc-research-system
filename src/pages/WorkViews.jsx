import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { useWorkspace } from '../components/Workspace.jsx'
import { officeQueues } from '../services/worklist.js'
import { Badge, Section, Empty, Restricted, fmtDate, fmtDateTime } from '../components/ui.jsx'
import { viewBundle } from '../domain/guard.js'
import { rowsIn, contextByKey } from '../domain/workspaces.js'
import { sectionNow, courseOfStage } from '../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, PANEL_ROLES, COURSES, programCode } from '../domain/constants.js'
import {
  ProjectCell, Feed, OwedFeed, DefenseTable, QueueSection, BlockDesk, Capstone2Facts, PanelFacts, ProgramSummary, RecordsSearch,
  statusOf, stepOf, itemLink, upcomingDefenses, stageOrder, latestDoc,
} from './dashboards/parts.jsx'
import { clearedEntries } from './dashboards/Desks.jsx'

// The pages behind each context's rail (Figma 01 · Dashboards, 03 · Screens
// per user). Every list is built from the worklist — the projects the guard
// lets this user open right now — filtered to the role the page is about.

function Page({ title, lede, children }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
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
  return <>{logs.filter(l => l.status === 'Approved').length} of {logs.length} approved{waiting > 0 && <div className="tone-warn">{waiting} to sign</div>}</>
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
    <Page title="Weekly logs" lede="Filled FM-AAC-SOC-2003 logs your advisee groups upload during Capstone 2. Open a group to approve and sign them.">
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
                    <td className="small" data-label="Last log">{last ? <>Week {last.weekNo} · {last.status}<div className="faint">{fmtDate(last.submittedAt)}</div></> : <span className="faint">None yet</span>}</td>
                    <td className="small" data-label="Progress">{logsCell(r)}</td>
                    <td className="tight"><Link className="btn small" to={itemLink(r, 'logs')}>Open logs</Link></td>
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
    <Page title="Archive" lede={`Completed groups you worked with as ${current.heading}. The school’s records archive is kept by the Dean and Associate Dean.`}>
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
    <Page title="Groups & rosters" lede="Create the project groups for your sections from the block roster, then forward them for adviser assignment. Students do not form their own groups.">
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

export const Routing = () => (
  <QueuePage title="Assignments & routing" contexts={['coordinator']}
    lede="Every project waiting on the Program Chair/Coordinator, by step: advisers, panels, Instructor 2, endorsements and schedules. A project opens to you only while one of these steps is yours." />
)

export const AdviserApprovals = () => (
  <QueuePage title="Adviser assignments" contexts={['dean', 'associate-dean']} names={['Adviser assignments to approve']}
    lede="Adviser assignments the Program Chair/Coordinator routed to the Dean and Associate Dean. When one office is the named Adviser, the other approves alone." />
)

export function Approvals() {
  const rows = useRole('dean', 'associate-dean')
  const { held } = useWorkspace()
  if (!rows) return <Restricted />
  const hats = held.filter(c => c.key === 'dean' || c.key === 'associate-dean').map(c => c.role)
  const forms = rows.flatMap(r => r.tasks.filter(t => hats.includes(t.hat) && t.kind === 'form').map(t => ({ r, t })))
  return (
    <QueuePage title="Executive approvals" contexts={['dean', 'associate-dean']} names={['Projects for final approval']}
      lede="Approval Sheets and final institutional signatures waiting on the Dean and Associate Dean.">
      {forms.length > 0 && (
        <Section title="Forms to sign">
          <Feed items={forms.map(({ r, t }, i) => ({ key: i, title: t.label, sub: r.project.title, chip: ['Awaiting you', 'warn'], to: itemLink(r, t.tab) }))} />
        </Section>
      )}
    </QueuePage>
  )
}

export function School() {
  const rows = useRole('dean', 'associate-dean')
  if (!rows) return <Restricted />
  return (
    <Page title="Student capstone & thesis" lede="Program-level counts for the whole school. A project opens to your office only while one of its steps is yours: adviser approval, final approval, and the archive.">
      <ProgramSummary title="Projects by program" />
      <Section title="Open to you now">
        <GroupTable rows={rows} hats={[G.DEAN, G.ASSOCIATE_DEAN]} empty="No project is at one of your steps right now." />
      </Section>
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
