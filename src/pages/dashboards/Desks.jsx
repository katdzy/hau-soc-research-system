import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { officeQueues } from '../../services/worklist.js'
import { reportScope } from '../Reports.jsx'
import { Badge, Section, fmtDate, fmtDateTime, daysLeft } from '../../components/ui.jsx'
import { viewBundle } from '../../domain/guard.js'
import { sectionNow, courseOfStage, uroReturnOutstanding } from '../../domain/stages.js'
import { FLAGS } from '../../domain/flags.js'
import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, ACCOUNT_STATUS, DOC_STATUS, COURSES, accountType, programCode,
} from '../../domain/constants.js'
import {
  DeskHead, Stat, Stats, Columns, ProjectCell, Feed, OwedFeed, Activity, DefenseTable, VerifyList,
  owedBy, countKind, statusOf, isOverdue, stepOf, latestDoc, upcomingDefenses, itemLink, queueItems,
  reviewQueue, panelManuscript, ProgramSummary, RecordsSearch, ProjectDirectory, RETURNED, stageOrder,
} from './parts.jsx'

// One dashboard per "Acting as" context (Figma 01 · Dashboards, DB-02 – DB-11).
// Each one counts only the projects where that role is in play; what any of
// them may do there is still decided by the guard.

const WEEK = 7 * 864e5
const within = (iso, ms) => iso && Math.abs(new Date(iso) - Date.now()) <= ms
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A project table with the step, the latest version and the status for this role. */
function ProjectTable({ rows, hats, empty, next }) {
  if (!rows.length) return <p className="small faint m-0">{empty}</p>
  return (
    <div className="table-scroll"><table className="cards">
      <thead>
        <tr><th>Group</th><th>Current step</th><th>{next ? 'Next event' : 'Latest'}</th><th className="tight">Status</th></tr>
      </thead>
      <tbody>
        {[...rows].sort((a, b) => stageOrder(a) - stageOrder(b)).map(r => {
          const [label, tone] = statusOf(r, hats)
          return (
            <tr key={r.project.id} className={tone === 'stop' ? 'is-flagged' : undefined}>
              <td className="card-title"><ProjectCell r={r} /></td>
              <td className="small" data-label="Current step">{stepOf(r.project)}</td>
              <td className="small muted" data-label={next ? 'Next event' : 'Latest'}>{next ? next(r) : <LatestCell r={r} />}</td>
              <td className="tight card-status"><Badge tone={tone}>{label}</Badge></td>
            </tr>
          )
        })}
      </tbody>
    </table></div>
  )
}

function LatestCell({ r }) {
  const { me } = useApp()
  const d = latestDoc(viewBundle(me, r.bundle))
  return d ? <>v{d.versionNumber} · {fmtDate(d.submittedAt)}<div className="faint">{d.docType}</div></> : '—'
}

/** The next dated thing on a project: an open defense, else the revision deadline. */
function nextEvent(r, me) {
  const d = viewBundle(me, r.bundle).defenses.find(x => !x.verdict)
  if (d) return `${d.type} defense · ${fmtDateTime(d.scheduledAt)}`
  if (r.project.revisionDeadline) {
    const left = daysLeft(r.project.revisionDeadline)
    return left < 0 ? `Revisions overdue since ${fmtDate(r.project.revisionDeadline)}` : `Revisions due ${fmtDate(r.project.revisionDeadline)}`
  }
  return '—'
}

// --- Adviser (DB-10) --------------------------------------------------------------

export function AdviserDesk({ rows, notice }) {
  const { me } = useApp()
  const hats = [P.ADVISER]
  const review = countKind(rows, hats, 'review') + countKind(rows, hats, 'revision')
  const logs = countKind(rows, hats, 'log')
  const overdue = rows.filter(r => isOverdue(r.project)).length
  const clearance = rows.filter(r => r.gates.some(g => g.gate.capability === 'finaldefense.recommend'))
  const upcoming = upcomingDefenses(rows, me)

  return (
    <div className="page">
      <DeskHead sub={`Your advisee groups at a glance · ${plural(rows.length, 'group')}`} notice={notice} />
      <Stats>
        <Stat label="Advisee groups" n={rows.length} to="/advisees" />
        <Stat label="Waiting for your review" n={review} tone={review ? 'accent' : undefined} />
        <Stat label="Weekly logs to review" n={logs} tone={logs ? 'accent' : undefined} to="/weekly-logs" />
        <Stat label="Overdue revisions" n={overdue} tone={overdue ? 'stop' : undefined} />
      </Stats>
      <Columns
        main={<>
          <Section title="Your advisees">
            <ProjectTable rows={rows} hats={hats} empty="No groups have you as their Adviser yet." />
          </Section>
          <Section title="Recent activity"><Activity rows={rows} /></Section>
        </>}
        side={<>
          <Section title="Waiting for you"><OwedFeed rows={rows} hats={hats} /></Section>
          <Section title="Upcoming">
            <Feed empty="No defenses scheduled for your advisees." items={upcoming.map(({ r, d }) => ({
              key: d.id, title: `${sectionNow(r.project).section} · ${d.type} defense`,
              sub: fmtDateTime(d.scheduledAt), chip: ['Scheduled', 'info'], to: itemLink(r, 'defense'),
            }))} />
          </Section>
          {clearance.length > 0 && (
            <Section title="Defense clearance">
              <Feed items={clearance.map(r => {
                const g = r.gates.find(x => x.gate.capability === 'finaldefense.recommend')
                return {
                  key: r.project.id, title: `${r.project.title}`, to: itemLink(r, g.gate.handledIn),
                  sub: g.blocker ?? 'Ready to recommend · FM-AAC-SOC-2005',
                  chip: g.blocker ? ['Not yet', 'neutral'] : ['Needs action', 'warn'],
                }
              })} />
            </Section>
          )}
        </>}
      />
    </div>
  )
}

// --- Panel Member / Panel Chair (DB-06, DB-07) ---------------------------------------

export function PanelDesk({ rows, chair, notice }) {
  const { me } = useApp()
  const hats = [chair ? P.PANEL_CHAIR : P.PANEL_MEMBER]
  const upcoming = upcomingDefenses(rows, me).filter(({ d }) => new Date(d.scheduledAt) > Date.now())
  const verdicts = rows.filter(r => r.gates.some(g => g.gate.capability === 'verdict.record' && hats.includes(g.hat) && !g.blocker)).length
  const revisions = countKind(rows, hats, 'revision')
  const overdue = rows.filter(r => isOverdue(r.project)).length
  // A defense already held but still without a verdict comes first.
  const next = upcomingDefenses(rows, me)[0]
  const held = next && new Date(next.d.scheduledAt) <= Date.now()
  const nb = next && viewBundle(me, next.r.bundle)
  const manuscript = nb && panelManuscript(nb)

  return (
    <div className="page">
      <DeskHead notice={notice} sub={chair
        ? 'Groups you chair. You record the verdict and issue the Capstone Revision Form.'
        : 'Groups where you sit as Panel Member. Your pre-defense notes stay private.'} />
      <Stats>
        <Stat label={chair ? 'Chaired groups' : 'Assigned groups'} n={rows.length} to="/panels" />
        {chair
          ? <Stat label="Verdicts to record" n={verdicts} tone={verdicts ? 'accent' : undefined} />
          : <Stat label="Upcoming defenses" n={upcoming.length} />}
        <Stat label="Revisions to verify" n={revisions} tone={revisions ? 'accent' : undefined} />
        <Stat label="Overdue revisions" n={overdue} tone={overdue ? 'stop' : undefined} />
      </Stats>
      <Columns
        main={<>
          <Section title={chair ? 'Groups you chair' : 'Your panel groups'}>
            <ProjectTable rows={rows} hats={hats} next={(r) => nextEvent(r, me)}
              empty={chair ? 'You do not chair a panel yet.' : 'You are not on a panel yet.'} />
          </Section>
          {chair && <Section title="Waiting for you"><OwedFeed rows={rows} hats={hats} /></Section>}
        </>}
        side={<>
          <Section title={held ? 'Your last defense' : 'Before your next defense'}>
            {next ? (
              <Feed items={[
                {
                  key: 'd', title: `${sectionNow(next.r.project).section} · ${next.d.type} defense`, sub: `${fmtDateTime(next.d.scheduledAt)} · ${next.d.venue}`,
                  chip: held ? ['Verdict pending', 'warn'] : ['Scheduled', 'info'], to: itemLink(next.r, 'defense'),
                },
                manuscript && {
                  key: 'm', title: `${manuscript.docType} v${manuscript.versionNumber} is ready`, to: itemLink(next.r, 'documents'),
                  sub: nb.aiSummaries.length ? 'AI summary available' : 'Latest version only', chip: ['Read', 'warn'],
                },
              ].filter(Boolean)} />
            ) : <p className="small faint m-0">No defense scheduled for your panels.</p>}
          </Section>
          {!chair && <Section title="Waiting for you"><OwedFeed rows={rows} hats={hats} /></Section>}
          <Section title="Recent activity"><Activity rows={rows} limit={4} /></Section>
        </>}
      />
    </div>
  )
}

// --- Instructor 1 (DB-08) ---------------------------------------------------------------

export function Instructor1Desk({ rows, notice }) {
  const { me, snap } = useApp()
  const hats = [P.INSTRUCTOR_1]
  const sections = (snap.sections ?? []).filter(s => s.instructorId === me.id && s.course === COURSES.C1)
  const queue = reviewQueue(rows, me)
  const latestOf = (r) => {
    const b = viewBundle(me, r.bundle)
    return [...new Set(b.documents.map(d => d.docType))]
      .map(t => b.documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0])
  }
  const queued = new Set(queue.map(q => q.d.id))
  const pending = rows.flatMap(r => latestOf(r).filter(d => d.status === DOC_STATUS.SUBMITTED && !queued.has(d.id)).map(d => ({ r, d })))
  const returned = rows.flatMap(r => latestOf(r).filter(d => RETURNED.includes(d.status)).map(d => ({ r, d })))
  const grouped = new Set((snap.projectMembers ?? []).map(m => m.userId))

  return (
    <div className="page">
      <DeskHead notice={notice} sub={`Capstone 1 sections you handle${sections.length ? ` · ${sections.map(s => s.block).join(', ')}` : ''}`} />
      <Stats>
        <Stat label="Groups in your sections" n={rows.length} to="/rosters" />
        <Stat label="Ready for your check" n={queue.length} tone={queue.length ? 'accent' : undefined} />
        <Stat label="Pending adviser review" n={pending.length} />
        <Stat label="Returned for revision" n={returned.length} tone={returned.length ? 'stop' : undefined} />
      </Stats>
      <Columns
        main={<>
          <Section title="Your sections" aside={<Link className="small" to="/rosters">Groups &amp; Rosters</Link>}>
            {sections.length === 0 ? <p className="small faint m-0">You hold Instructor 1 on groups outside a section you teach.</p> : (
              <div className="table-scroll"><table className="cards">
                <thead><tr><th>Section</th><th className="tight">Groups</th><th className="tight">Students grouped</th><th>Most groups are at</th></tr></thead>
                <tbody>
                  {sections.map(s => {
                    const groups = rows.filter(r => r.project.sectionId === s.id)
                    const roster = (snap.users ?? []).filter(u => accountType(u.email) === 'Student' && u.block === s.block && u.status === ACCOUNT_STATUS.ACTIVE)
                    const tally = {}
                    for (const r of groups) tally[r.stage?.label] = (tally[r.stage?.label] ?? 0) + 1
                    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
                    const all = roster.length && roster.every(u => grouped.has(u.id))
                    return (
                      <tr key={s.id}>
                        <td className="card-title"><strong>{s.block}</strong><div className="faint small">{s.term}</div></td>
                        <td className="tight mono" data-label="Groups">{groups.length}</td>
                        <td className="tight" data-label="Students grouped">
                          <Badge tone={all ? 'ok' : 'warn'}>{roster.filter(u => grouped.has(u.id)).length} of {roster.length}</Badge>
                        </td>
                        <td className="small muted" data-label="Most groups are at">{top ? top[0] : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </Section>
          <Section title="Ready for your check">
            <Feed empty="Nothing is waiting for your check." items={[
              ...queue.map(({ r, d }) => ({ key: d.id, title: `${sectionNow(r.project).section} · ${d.docType} v${d.versionNumber}`, sub: r.project.title, chip: ['Ready for your check', 'warn'], to: itemLink(r, 'documents') })),
              ...pending.map(({ r, d }) => ({ key: d.id, title: `${sectionNow(r.project).section} · ${d.docType} v${d.versionNumber}`, sub: 'Opens after the adviser reviews it', chip: ['Pending adviser review', 'neutral'], to: itemLink(r, 'documents') })),
            ]} />
          </Section>
        </>}
        side={<>
          <Section title="Needs your action"><OwedFeed rows={rows} hats={hats} /></Section>
          <Section title="Recent activity"><Activity rows={rows} limit={4} /></Section>
        </>}
      />
    </div>
  )
}

// --- Instructor 2 (DB-09) ---------------------------------------------------------------

export function Instructor2Desk({ rows, notice }) {
  const { me } = useApp()
  const hats = [P.INSTRUCTOR_2]
  const c2 = rows.filter(r => courseOfStage(r.project.currentStage) === COURSES.C2 && r.project.currentStage !== 'ARCHIVED')
  const toSchedule = rows.filter(r => r.gates.some(g => g.gate.capability === 'defense.schedule' && hats.includes(g.hat)))
  const defenses = upcomingDefenses(rows, me).filter(({ d }) => new Date(d.scheduledAt) > Date.now())
  const thisWeek = defenses.filter(({ d }) => within(d.scheduledAt, WEEK)).length
  const milestones = countKind(rows, hats, 'milestone')

  return (
    <div className="page">
      <DeskHead notice={notice} sub="Capstone 2 groups: milestones, readiness and final defense schedules" />
      <Stats>
        <Stat label="Capstone 2 groups" n={c2.length} to="/scheduling" />
        <Stat label="Endorsed — needs a schedule" n={toSchedule.length} tone={toSchedule.length ? 'accent' : undefined} />
        <Stat label="Defenses this week" n={thisWeek} />
        <Stat label="Milestones to confirm" n={milestones} tone={milestones ? 'accent' : undefined} />
      </Stats>
      <Columns
        main={<>
          <Section title="Upcoming defenses">
            <DefenseTable items={defenses} empty="No defense is scheduled for your groups." />
          </Section>
          <Section title="Waiting for a schedule">
            <Feed empty="No group is waiting for a schedule." items={toSchedule.map(r => {
              const g = r.gates.find(x => x.gate.capability === 'defense.schedule')
              return { key: r.project.id, title: r.project.title, sub: g.blocker ?? `${sectionNow(r.project).section} · ${r.stage?.label}`, chip: g.blocker ? ['Not yet', 'neutral'] : ['Needs schedule', 'warn'], to: itemLink(r, g.gate.handledIn) }
            })} />
          </Section>
        </>}
        side={<>
          <Section title="Needs your action"><OwedFeed rows={rows} hats={hats} /></Section>
          <Section title="Group status">
            <Feed empty="No groups yet." items={c2.map(r => {
              const [label, tone] = statusOf(r, hats)
              return { key: r.project.id, title: sectionNow(r.project).section, sub: `${r.project.title} · ${r.stage?.label}`, chip: [label, tone], to: itemLink(r) }
            })} />
          </Section>
        </>}
      />
    </div>
  )
}

// --- Program Chair / Coordinator (S-12) ------------------------------------------------------

export function CoordinatorDesk({ rows, notice }) {
  const { me, snap } = useApp()
  const queues = officeQueues(me).filter(q => q.role === G.COORDINATOR)
  const { projects } = reportScope(me, snap)
  const active = projects.filter(p => p.currentStage !== 'ARCHIVED')
  const n = (name) => { const q = queues.find(x => x.name === name); return q ? queueItems(q, rows).length : 0 }
  const owed = owedBy(rows, [G.COORDINATOR]).filter(i => i.ready).length

  return (
    <div className="page">
      <DeskHead notice={notice} sub="Assignments and routing for the programs you coordinate" />
      <Stats>
        <Stat label="Active projects" n={active.length} to="/reports" />
        <Stat label="Waiting on you" n={owed} tone={owed ? 'accent' : undefined} to="/routing" />
        <Stat label="Awaiting adviser" n={n('Needs adviser')} />
        <Stat label="Awaiting panel" n={n('Needs panel')} />
      </Stats>
      <Columns
        main={<>
          <Section title="Projects open to you now" aside={<span className="faint small">During your steps only</span>}>
            <ProjectTable rows={rows} hats={[G.COORDINATOR]} empty="No project is at one of your steps right now." />
          </Section>
          <ProjectDirectory title="All projects in your programs" canOpen={(p) => rows.some(r => r.project.id === p.id)} />
          <ProgramSummary />
        </>}
        side={<>
          <Section title="Needs your action">
            <Feed items={queues.map(q => {
              const k = queueItems(q, rows).length
              return { key: q.name, title: q.name, sub: k ? plural(k, 'project') : 'Nothing waiting', chip: k ? [String(k), 'warn'] : null, to: `/routing#${encodeURIComponent(q.name)}` }
            })} empty="No queues." />
          </Section>
          <Section title="Recent activity"><Activity rows={rows} limit={4} /></Section>
        </>}
      />
    </div>
  )
}

// --- Dean / Associate Dean (DB-02, DB-03) ------------------------------------------------------

export function DeanDesk({ rows, role, notice }) {
  const { me, snap } = useApp()
  const queues = officeQueues(me).filter(q => q.role === role)
  const items = queues.flatMap(q => queueItems(q, rows).map(i => ({ ...i, q })))
  const waiting = items.filter(i => !i.blocker).length
  const { projects } = reportScope(me, snap)
  const completed = projects.filter(p => p.currentStage === 'ARCHIVED')
  const overdue = projects.filter(isOverdue).length
  const recent = rows.filter(r => r.project.currentStage === 'ARCHIVED')
    .sort((a, b) => new Date(b.project.archivedAt ?? 0) - new Date(a.project.archivedAt ?? 0)).slice(0, 4)

  return (
    <div className="page">
      <DeskHead notice={notice} sub="School of Computing · all programs" />
      <Stats>
        <Stat label="Awaiting your approval" n={waiting} tone={waiting ? 'accent' : undefined} to="/approvals" />
        <Stat label="Projects in progress" n={projects.length - completed.length} to="/school" />
        <Stat label="Completed" n={completed.length} to="/completions" />
        <Stat label="Overdue projects" n={overdue} tone={overdue ? 'stop' : undefined} />
      </Stats>
      <Columns
        main={<>
          <ProgramSummary title="Projects by program" />
          <Section title="Waiting for you">
            <Feed empty="Nothing is waiting for your approval." items={items.map((i, k) => ({
              key: `${i.r.project.id}-${k}`, title: i.q.name.replace(/ to approve$| for final approval$/, ''), to: itemLink(i.r, i.tab),
              sub: <>{i.r.project.title} · {sectionNow(i.r.project).section}{i.steps?.length > 1 && <> · {i.steps.filter(x => x.done).length} of {i.steps.length} approvals</>}</>,
              chip: i.blocker ? ['Waiting', 'neutral'] : ['Awaiting you', 'warn'],
            }))} />
          </Section>
        </>}
        side={<>
          <Section title="Recently completed">
            <Feed empty="No project completed yet." items={recent.map(r => ({
              key: r.project.id, title: `${sectionNow(r.project).section} · archived`, sub: fmtDate(r.project.archivedAt), chip: ['Done', 'ok'], to: itemLink(r),
            }))} />
          </Section>
          <RecordsSearch />
        </>}
      />
    </div>
  )
}

// --- University Research Office (DB-11) --------------------------------------------------------

/** Projects that left URO verification, from the workflow history: counts and dates only. */
export function clearedEntries(snap) {
  return (snap.workflowHistory ?? [])
    .filter(h => h.fromStage === 'URO_VERIFICATION' && h.toStage !== 'URO_VERIFICATION')
    .sort((a, b) => new Date(b.at) - new Date(a.at))
}

export function UroDesk({ rows, notice }) {
  const { me, snap } = useApp()
  const q = officeQueues(me).find(x => x.role === G.URO)
  const items = q ? queueItems(q, rows) : []
  const cleared = clearedEntries(snap)
  const month = cleared.filter(h => within(h.at, 30 * 864e5)).length
  const returned = rows.filter(r => uroReturnOutstanding(viewBundle(me, r.bundle)).length).length
  const project = (id) => (snap.projects ?? []).find(p => p.id === id)
  const since = (r) => r.bundle.history.filter(h => h.toStage === 'URO_VERIFICATION').at(-1)?.at

  return (
    <div className="page">
      <DeskHead notice={notice} sub="Institutional clearance for projects after Approved Revisions" />
      <Stats>
        <Stat label="Awaiting clearance" n={items.length} tone={items.length ? 'accent' : undefined} to="/clearance" />
        <Stat label="Cleared in the last 30 days" n={month} to="/cleared" />
        <Stat label="Returned to the group" n={returned} tone={returned ? 'stop' : undefined} />
        <Stat label="Cleared in total" n={cleared.length} />
      </Stats>
      <Columns
        main={
          <Section title="Clearance queue" aside={<Link className="small" to="/clearance">Open queue</Link>}>
            {items.length === 0 ? <p className="small faint m-0">No project is waiting for clearance.</p> : (
              <div className="table-scroll"><table className="cards">
                <thead><tr><th>Group</th><th>Certificates and manuscript</th><th className="tight">Received</th><th className="tight" /></tr></thead>
                <tbody>
                  {items.map(({ r, tab, verifies }, i) => (
                    <tr key={`${r.project.id}-${i}`}>
                      <td className="card-title"><ProjectCell r={r} /></td>
                      <td data-label="Items">{verifies ? <VerifyList r={r} types={verifies} /> : '—'}</td>
                      <td className="tight small" data-label="Received">{fmtDate(since(r))}</td>
                      <td className="tight"><Link className="btn small" to={itemLink(r, tab)}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Section>
        }
        side={
          <Section title="Recently cleared">
            <Feed empty="Nothing cleared yet." items={cleared.slice(0, 5).map(h => {
              const p = project(h.projectId)
              return { key: h.id, title: p ? `${sectionNow(p).section} · ${programCode(p.program)}` : 'Project', sub: `Cleared ${fmtDate(h.at)}`, chip: ['Cleared', 'ok'] }
            })} />
          </Section>
        }
      />
    </div>
  )
}

// --- System Administrator (DB-05) ------------------------------------------------------------

const ROLE_ACTIONS = {
  ROLE_ASSIGNED: 'Project role assigned', ROLE_UNASSIGNED: 'Project role removed',
  GLOBAL_ROLES_CHANGED: 'Global role changed', PROGRAM_SCOPE_CHANGED: 'Program scope changed',
  PERMISSION_OVERRIDE_APPLIED: 'Permission override applied', PERMISSION_OVERRIDE_LIFTED: 'Permission override lifted',
  ACCOUNT_STATUS_CHANGED: 'Account status changed',
}

export function AdminDesk({ notice }) {
  const { snap } = useApp()
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? 'System'
  // Flag ACCOUNT_ACTIVATION: with 'email' verification alone activates, so what
  // waits is the owner's verification; with 'email+admin', this office.
  const byEmail = FLAGS.ACCOUNT_ACTIVATION === 'email'
  const toActivate = users.filter(u => u.status === ACCOUNT_STATUS.INACTIVE && (byEmail ? !u.emailVerified : u.emailVerified))
  const changes = (snap.auditLogs ?? []).filter(a => ROLE_ACTIONS[a.action])
    .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5)
  const overrides = (snap.permissionOverrides ?? []).filter(o => !o.liftedAt).length

  return (
    <div className="page">
      <DeskHead notice={notice} sub="Accounts and role setup for the School of Computing" />
      <Stats>
        <Stat label="Total users" n={users.length} to="/admin/accounts" />
        <Stat label={byEmail ? 'Not yet verified' : 'Waiting for activation'} n={toActivate.length} tone={toActivate.length ? 'accent' : undefined} to="/admin/accounts" />
        <Stat label="Faculty" n={users.filter(u => accountType(u.email) === 'Faculty').length} />
        <Stat label="Students" n={users.filter(u => accountType(u.email) === 'Student').length} />
      </Stats>
      <Columns
        main={<>
          <Section title={byEmail ? 'Registrations waiting for email verification' : 'New accounts waiting for activation'} aside={<Link className="small" to="/admin/accounts">User Accounts</Link>}>
            <Feed empty={byEmail ? 'Every registration is verified.' : 'Every verified registration is active.'} items={toActivate.slice(0, 6).map(u => ({
              key: u.id, title: u.name, sub: `${u.email} · registered ${fmtDate(u.createdAt)}`, chip: [byEmail ? 'Not verified' : 'Needs activation', 'warn'], to: '/admin/accounts',
            }))} />
          </Section>
          <Section title="Recent role changes" aside={<Link className="small" to="/audit">Audit Log</Link>}>
            <Feed empty="No role changes recorded yet." items={changes.map(a => ({
              key: a.id, title: ROLE_ACTIONS[a.action], sub: `${nameOf(a.actorId)} · ${fmtDateTime(a.at)}`,
            }))} />
          </Section>
        </>}
        side={
          <Section title="Role configuration" aside={<Link className="small" to="/admin/caac">Open</Link>}>
            <Feed items={[
              { key: 'a', title: 'Academic permissions', sub: 'Read-only unless overridden', chip: ['Locked', 'neutral'] },
              { key: 'o', title: 'Permission overrides', sub: overrides ? `${plural(overrides, 'override')} in force` : 'None in force', chip: overrides ? [String(overrides), 'warn'] : null, to: '/admin/caac' },
              { key: 's', title: 'System Administrator row', sub: 'Fixed — cannot self-edit', chip: ['Locked', 'neutral'] },
            ]} />
          </Section>
        }
      />
    </div>
  )
}

