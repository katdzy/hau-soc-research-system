import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist, isActionable, officeQueues } from '../services/worklist.js'
import { reportScope } from './Reports.jsx'
import { Badge, Section, Empty, Countdown, fmtDate, fmtDateTime, firstName, verdictTone } from '../components/ui.jsx'
import { can, resolveInstitution, resolveContext, allowedDocTypes } from '../domain/caac.js'
import { canDo, viewBundle } from '../domain/guard.js'
import { FLAGS } from '../domain/flags.js'
import {
  macroStageOf, openGates, sectionNow, courseOfStage, milestoneStatus, uroReturnOf, uroReturnOutstanding, STAGES,
} from '../domain/stages.js'
import {
  GLOBAL_ROLES as G, PROJECT_ROLES as P, ACCOUNT_STATUS, DOC_STATUS, DOC_TYPES, REVIEWABLE_TYPES, COURSES, FORMS,
  CAPSTONE2_MILESTONES, accountType, programCode,
} from '../domain/constants.js'

// The order the group meets its faculty in.
const PEOPLE = [P.INSTRUCTOR_1, P.ADVISER, P.PANEL_CHAIR, P.PANEL_MEMBER, P.INSTRUCTOR_2]

const OFFICES = [G.COORDINATOR, G.ASSOCIATE_DEAN, G.DEAN, G.URO]

// One dashboard section per project hat (§2.2 multi-hat dashboard). Instructor 1
// groups in a section the user teaches live on that section's desk instead.
const HAT_SECTIONS = [
  // §4 Adviser: "assigned groups, drafts to review, logs to sign, revisions to verify, forms to sign".
  { title: 'Advising', roles: [P.ADVISER], kinds: [['review', 'Drafts to review'], ['log', 'Logs to sign'], ['revision', 'Revisions to verify'], ['form', 'Forms to sign']] },
  // §4 Panel Member: "assigned projects, schedule, latest manuscript version, … revisions to verify, forms to sign".
  { title: 'Panel', roles: [P.PANEL_CHAIR, P.PANEL_MEMBER], kinds: [['revision', 'Revisions to verify'], ['form', 'Forms to sign']], showDefense: true },
  { title: 'Instructor 1', roles: [P.INSTRUCTOR_1] },
  // §4 Instructor 2: "Capstone 2 groups, milestones, readiness, schedules".
  { title: 'Capstone 2 instructing', roles: [P.INSTRUCTOR_2], showCapstone2: true },
]

export default function Dashboard() {
  const { snap, me } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  // A one-time notice from the workspace (see ProjectWorkspace). It belongs to
  // the user it was written for and is cleared from history once read, so a
  // reload or a persona switch does not show it again.
  const [flash] = useState(() => location.state?.notice ? { userId: location.state.forUserId, text: location.state.notice } : null)
  const notice = flash?.userId === me.id ? flash.text : null
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])
  const rows = worklist(snap, me)
  const inst = resolveInstitution(me, snap)

  const actionable = rows.filter(isActionable)
  // Office queues (§4) and one section per project hat; anything else visible
  // is listed under "Other projects".
  const queues = officeQueues(me)
  const mySections = new Set(inst.sections.map(s => s.id))
  const hatRoles = HAT_SECTIONS.flatMap(h => h.roles)
  const others = rows.filter(r => !r.ctx.isMember &&
    !r.ctx.active.some(g => hatRoles.includes(g.role)) &&
    !r.gates.some(g => g.gate.queue) && !r.tasks.some(t => t.queue) &&
    !mySections.has(r.project.sectionId))
  const holdsOffice = (me.globalRoles ?? []).some(r => OFFICES.includes(r))
  // S0.3 — verified registrations the System Administrator still has to activate.
  const toActivate = can(inst, 'admin.accounts')
    ? (snap.users ?? []).filter(u => u.status === ACCOUNT_STATUS.INACTIVE && u.emailVerified) : []
  // T14 — a student account that no Instructor 1 has put in a group yet.
  const ungrouped = accountType(me.email) === 'Student' &&
    !(snap.projectMembers ?? []).some(m => m.userId === me.id)
  const owed = actionable.length + (toActivate.length ? 1 : 0)
  // Projects the user belongs to as a group member get the group's own view.
  const groups = rows.filter(r => r.ctx.isMember)
  const staff = rows.filter(r => !r.ctx.isMember)
  const groupOwes = groups.reduce((n, r) => n + r.tasks.length, 0)

  if (ungrouped) {
    return (
      <div className="page">
        <header className="page-head">
          <div className="label">Worklist</div>
          <h1>Good day, {firstName(me.name)}</h1>
          <p className="lede">You are not in a project group yet.</p>
        </header>
        <Section title="What happens next">
          <p style={{ maxWidth: '64ch' }}>
            Students don’t form their own groups. The Instructor 1 of your section
            {me.block ? ` (${me.block})` : ''} creates the groups and adds you to one. Your group’s
            workspace, stage, adviser and deadlines appear here once they do, and you’ll get an
            email at {me.email}.
          </p>
        </Section>
      </div>
    )
  }

  if (groups.length && !staff.length && !toActivate.length) {
    return (
      <div className="page">
        <header className="page-head">
          <div className="label">Worklist</div>
          <h1>Good day, {firstName(me.name)}</h1>
          <p className="lede">
            {groupOwes
              ? `Your group has ${groupOwes} thing${groupOwes > 1 ? 's' : ''} to do.`
              : 'Nothing is waiting on your group right now.'}
          </p>
        </header>
        {groups.map(r => <GroupDesk key={r.project.id} r={r} />)}
        <p className="faint small" style={{ maxWidth: '72ch' }}>
          Approvals, returned work, schedules, verdicts and deadlines are emailed to {me.email}.
        </p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Worklist</div>
        <h1>Good day, {firstName(me.name)}</h1>
        {notice && <p className="note small" role="status" style={{ margin: '8px 0 16px' }}>{notice}</p>}
        <p className="lede">
          {owed
            ? `${owed} item${owed > 1 ? 's' : ''} need${owed > 1 ? '' : 's'} something from you.`
            : 'Nothing is waiting on you right now.'}
        </p>
      </header>

      {toActivate.length > 0 && (
        <Section title="Accounts to activate">
          <article className="gate">
            <div className="entry-head">
              <strong>{toActivate.length} verified registration{toActivate.length > 1 ? 's' : ''} waiting for activation</strong>
            </div>
            <ul className="todo">
              {toActivate.slice(0, 5).map(u => (
                <li key={u.id}>{u.name} <span className="faint">· {accountType(u.email)} · {u.email}</span></li>
              ))}
              {toActivate.length > 5 && <li className="faint">and {toActivate.length - 5} more</li>}
            </ul>
            <div className="actions" style={{ marginTop: 16 }}>
              <Link className="btn" to="/admin/accounts">Open Accounts</Link>
            </div>
          </article>
        </Section>
      )}

      {can(inst, 'group.create') && inst.sections.filter(s => s.course === COURSES.C1)
        .map(section => <BlockDesk key={section.id} section={section} rows={rows} />)}

      {queues.filter(q => queueItems(q, rows).length).map(q => <QueueSection key={q.name} q={q} rows={rows} />)}
      {queues.some(q => !queueItems(q, rows).length) && (
        <p className="small faint queue-clear">
          <span className="label">Nothing waiting in</span>{' '}
          {queues.filter(q => !queueItems(q, rows).length).map(q => q.name).join(' · ')}
        </p>
      )}

      {HAT_SECTIONS.map(h => {
        const mine = rows.filter(r => r.ctx.active.some(g => h.roles.includes(g.role)) &&
          !(h.roles.includes(P.INSTRUCTOR_1) && mySections.has(r.project.sectionId)))
        return mine.length ? <HatSection key={h.title} title={h.title} roles={h.roles} kinds={h.kinds} showDefense={h.showDefense} showCapstone2={h.showCapstone2} rows={mine} /> : null
      })}

      {others.length > 0 && (
        <Section title="Other projects you can open">
          <div className="table-scroll"><table>
            <thead>
              <tr><th>Project</th><th>Access through</th><th>Stage</th><th className="tight">Updated</th></tr>
            </thead>
            <tbody>
              {others.map(r => (
                <tr key={r.project.id}>
                  <td><Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link></td>
                  <td className="small muted" title={r.access.reason}>{r.access.via}</td>
                  <td><Badge>{r.stage?.label}</Badge></td>
                  <td className="tight small faint">{fmtDate(r.bundle.history.at(-1)?.at ?? r.project.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Section>
      )}

      {can(inst, 'records.search') && <RecordsSearch />}
      {can(inst, 'report.generate') && <ProgramSummary />}

      {holdsOffice && (
        <p className="faint small" style={{ maxWidth: '72ch' }}>
          Progressive visibility: a project opens to your office only while one of its steps is yours.
          Outside those steps you see the counts above and in <Link to="/reports">Reports</Link>.
        </p>
      )}
    </div>
  )
}

/**
 * §4 Student dashboard — the group's own project only: stage, what the group
 * owes, deadline, defense schedule, latest verdict, and its faculty. Renders
 * from the guard-filtered bundle, so a proposed Adviser or panel stays hidden
 * until the workflow announces it.
 */
function GroupDesk({ r }) {
  const { snap, me } = useApp()
  const b = viewBundle(me, r.bundle)
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? 'Unknown'
  const stage = r.stage
  const link = (tab) => `/projects/${b.project.id}${tab ? `?tab=${tab}` : ''}`
  const openDefense = b.defenses.find(d => !d.verdict)
  const verdict = b.defenses.filter(d => d.verdict)
    .sort((x, y) => new Date(y.recordedAt) - new Date(x.recordedAt))[0]
  const gate = openGates(stage, r.bundle)[0]
  // Submissions sitting with a reviewer: name who holds the decision.
  const deciders = (snap.users ?? []).filter(u => u.status === ACCOUNT_STATUS.ACTIVE &&
    can(resolveContext(u, r.bundle), 'review.decide')).map(u => u.name)
  const withReviewer = deciders.length ? allowedDocTypes(b.project.currentStage)
    .filter(t => REVIEWABLE_TYPES.includes(t))
    .map(t => b.documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0])
    .filter(d => d && [DOC_STATUS.SUBMITTED, DOC_STATUS.UNDER_REVIEW].includes(d.status)) : []
  const people = PEOPLE.map(role => [role, b.assignments.filter(a => a.roleType === role).map(a => nameOf(a.userId))])

  return (
    <section className="section group-desk" aria-labelledby={`g-${b.project.id}`}>
      <div className="group-main">
        <div className="label">
          {macroStageOf(stage?.key)}
          {stage && macroStageOf(stage.key) !== stage.label && <> · <span className="mono">{stage.label}</span></>}
        </div>
        <h2 id={`g-${b.project.id}`} className="group-title">
          <Link className="row-link" to={link()}>{b.project.title}</Link>
        </h2>
        <p className="small muted">{b.project.program}</p>
        <p className="small muted">{(({ section, course, term }) => `${section} · ${course} · ${term}`)(sectionNow(b.project))}</p>
        {b.project.currentStage === 'ARCHIVED' && (
          <div className="inline" style={{ marginBottom: 16 }}>
            <Badge tone="ok">Completed</Badge>
            {b.project.archiveResult && <Badge>Result: {b.project.archiveResult}</Badge>}
          </div>
        )}
        {(b.project.revisionDeadline || b.project.revisionStatus === 'Overdue') && (
          <div className="inline" style={{ marginBottom: 16 }}>
            {b.project.revisionStatus === 'Overdue' && <Badge tone="stop">Overdue</Badge>}
            <Countdown deadline={b.project.revisionDeadline} />
          </div>
        )}

        {uroReturnOutstanding(b).length > 0 && (
          <div className="note small" role="status" style={{ marginBottom: 16, maxWidth: '64ch' }}>
            <strong>The University Research Office returned your {uroReturnOf(b).docTypes.join(' and ')}.</strong>{' '}
            {uroReturnOf(b).remarks}
          </div>
        )}

        <h3 className="label group-sub">Waiting on your group</h3>
        {r.tasks.length > 0 ? (
          <ul className="todo">
            {r.tasks.map((t, i) => (
              <li key={i} className={t.urgent ? 'urgent' : undefined}>
                <Link to={link(t.tab)}>{t.label}</Link>
              </li>
            ))}
          </ul>
        ) : withReviewer.length ? (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing right now. {withReviewer.map(d => `${d.docType} v${d.versionNumber}`).join(' and ')}
            {withReviewer.length > 1 ? ' are' : ' is'} waiting for a decision from {deciders.join(' or ')}.
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {gate
              ? <>Nothing right now. Next: {gate.label.charAt(0).toLowerCase() + gate.label.slice(1)} — waiting on {gate.actorHint}.</>
              : <>Your project is <strong>completed</strong>{b.project.archivedAt && <> and archived on {fmtDate(b.project.archivedAt)}</>}.</>}
          </p>
        )}

        {openDefense && (
          <>
            <h3 className="label group-sub">{openDefense.type} defense</h3>
            <dl className="kv">
              <dt>Schedule</dt><dd>{fmtDateTime(openDefense.scheduledAt)}</dd>
              <dt>Venue or link</dt><dd>{openDefense.venue}</dd>
              {openDefense.instructions && <><dt>Instructions</dt><dd className="small">{openDefense.instructions}</dd></>}
            </dl>
          </>
        )}

        {verdict && (
          <>
            <h3 className="label group-sub">Latest verdict · {verdict.type} defense</h3>
            <div className="inline"><Badge tone={verdictTone(verdict.verdict)}>{verdict.verdict}</Badge>
              <span className="faint small">recorded {fmtDate(verdict.recordedAt)}</span>
              {verdict.revisionStatus === 'Completed' && <Badge tone="ok">revisions completed</Badge>}
            </div>
            {verdict.remarks && <p className="small" style={{ margin: '8px 0 0', maxWidth: '64ch' }}>{verdict.remarks}</p>}
          </>
        )}
      </div>

      <aside className="group-people" aria-label="Your faculty">
        <h3 className="label group-sub" style={{ marginTop: 0 }}>Your faculty</h3>
        <dl className="kv kv-tight">
          {people.map(([role, names]) => (
            <div key={role} style={{ display: 'contents' }}>
              <dt>{role}</dt>
              <dd className={names.length ? undefined : 'faint'}>
                {names.length ? names.join(', ') : role === P.ADVISER ? 'Awaiting appointment' : 'Not yet'}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </section>
  )
}


/**
 * §4 Instructor 1 dashboard, one per Capstone 1 section taught: the section
 * roster, the section's groups by stage, and the submissions waiting on the
 * instructor. Groups are the ones visible to this user right now (CAAC), so a
 * group routed to Capstone 2 drops out here (NEW-6, flag I1_ACCESS_AFTER_ROUTING).
 */
function BlockDesk({ section, rows }) {
  const { snap, me } = useApp()
  const groups = rows.filter(r => r.project.sectionId === section.id)
  const grouped = new Set((snap.projectMembers ?? []).map(m => m.userId))
  const roster = (snap.users ?? [])
    .filter(u => accountType(u.email) === 'Student' && u.block === section.block && u.status === ACCOUNT_STATUS.ACTIVE)
  const ungrouped = roster.filter(u => !grouped.has(u.id))
  const queue = groups.flatMap(r => r.bundle.documents
    .filter(d => ['reviewDocument', 'returnDocument'].some(a => canDo(me, a, r.bundle, { doc: d }).ok))
    .map(d => ({ r, d })))

  return (
    <section className="section block-desk" aria-labelledby={`blk-${section.id}`}>
      <div className="section-head">
        <h2 id={`blk-${section.id}`}>Section {section.block} · {section.course}</h2>
        <Link className="btn" to="/projects?new=1">Create a project group</Link>
      </div>
      <p className="small muted">{section.program} · {section.yearLevel} · {section.term}</p>

      <div className="block-grid">
        <div>
          <h3 className="label group-sub">Review queue</h3>
          {queue.length === 0 && <p className="small faint" style={{ margin: 0 }}>Nothing is waiting for your decision.</p>}
          <ul className="todo">
            {queue.map(({ r, d }) => (
              <li key={d.id}>
                <Link to={`/projects/${r.project.id}?tab=documents`}>{d.docType} v{d.versionNumber}</Link>
                <span className="faint"> — {r.project.title}</span>
              </li>
            ))}
          </ul>

          <h3 className="label group-sub">Groups by stage</h3>
          {groups.length === 0 && <p className="small faint" style={{ margin: 0 }}>No groups in Capstone 1 for this section.</p>}
          {groups.length > 0 && (
            <div className="table-scroll"><table>
              <thead><tr><th>Group</th><th>Stage</th><th>Now</th><th className="tight">Students</th></tr></thead>
              <tbody>
                {[...groups].sort((x, y) => stageOrder(x) - stageOrder(y)).map(r => {
                  const ready = r.gates.find(g => !g.blocker)
                  const mine = r.gates[0]
                  const next = openGates(r.stage, r.bundle)[0]
                  return (
                    <tr key={r.project.id}>
                      <td><Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link></td>
                      <td><Badge>{r.stage?.label}</Badge></td>
                      <td className="small">
                        {ready ? <span className="ok-inline">Your step: {ready.gate.label}</span>
                          : mine ? <span className="muted">{mine.blocker}</span>
                            : next ? <span className="muted">Waiting on {next.actorHint}</span> : '—'}
                      </td>
                      <td className={`tight mono${r.bundle.members.length < FLAGS.GROUP_SIZE ? ' tone-warn' : ''}`}>
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
          <h3 className="label group-sub" style={{ marginTop: 0 }}>Section roster</h3>
          <p className="small" style={{ margin: '0 0 8px' }}>
            <span className="mono">{roster.length - ungrouped.length}</span> of <span className="mono">{roster.length}</span> students in a group
          </p>
          {ungrouped.length > 0 && (
            <>
              <div className="small muted">Not in a group yet:</div>
              <ul className="plain-list small">
                {ungrouped.map(u => <li key={u.id}>{u.name} <span className="faint mono">{u.idNumber}</span></li>)}
              </ul>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

const stageOrder = (r) => STAGES.findIndex(s => s.key === r.project.currentStage)

/** Where a queue item's work is done: the gate's tab, or the Overview. */
const itemLink = (r, tab) => `/projects/${r.project.id}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`

/** What is waiting in one office queue: gates filed under it, and office tasks. */
const queueItems = (q, rows) => rows.flatMap(r => [
  ...r.gates.filter(g => g.gate.queue === q.name && g.hat === q.role)
    .map(g => ({ r, label: g.gate.label, blocker: g.blocker, tab: g.gate.handledIn, steps: g.gate.steps?.(r.bundle), verifies: g.gate.verifies })),
  ...r.tasks.filter(t => t.queue === q.name).map(t => ({ r, label: t.label, blocker: null, tab: t.tab })),
])

/** §4 URO "certificates + manuscript": the current version of each item to verify. */
function VerifyList({ r, types }) {
  const { me } = useApp()
  const b = viewBundle(me, r.bundle)
  const latest = (t) => b.documents.filter(d => d.docType === t).sort((x, y) => y.versionNumber - x.versionNumber)[0]
  return (
    <ul className="plain-list small muted" style={{ marginTop: 4 }}>
      {types.map(t => {
        const d = latest(t)
        return <li key={t}>{t} {d ? <span className="mono">v{d.versionNumber}</span> : <span className="tone-warn">missing</span>}</li>
      })}
    </ul>
  )
}

/** One office queue: the projects waiting on this office at this step. */
function QueueSection({ q, rows }) {
  const items = queueItems(q, rows)
  return (
    <Section title={q.name} aside={<span className="faint small">{q.role}{items.length ? ` · ${items.length}` : ''}</span>}>
      {items.length === 0 && <p className="small faint" style={{ margin: 0 }}>Nothing is waiting here.</p>}
      {items.length > 0 && (
        <div className="table-scroll"><table>
          <thead><tr><th>Project</th><th>Section</th><th>Status</th><th className="tight" /></tr></thead>
          <tbody>
            {items.map(({ r, label, blocker, tab, steps, verifies }, i) => (
              <tr key={`${r.project.id}-${i}`}>
                <td>
                  <Link className="row-link" to={itemLink(r)}>{r.project.title}</Link>
                  <div className="faint small">{r.stage?.label}</div>
                </td>
                <td className="small muted mono" title={r.project.program}>{sectionNow(r.project).section}</td>
                <td className="small">
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

/** Projects where the user holds one of these hats, with what that hat owes. */
function HatSection({ title, roles, kinds, showDefense, showCapstone2, rows }) {
  const { me } = useApp()
  const count = (kind) => rows.flatMap(r => r.tasks.filter(t => roles.includes(t.hat) && t.kind === kind)).reduce((n, t) => n + (t.n ?? 1), 0)
  return (
    <Section title={title} aside={<span className="faint small">{rows.length} project{rows.length > 1 ? 's' : ''}</span>}>
      {kinds && (
        <dl className="hat-counts">
          {kinds.map(([kind, label]) => (
            <div key={kind} className={count(kind) ? 'has-items' : undefined}>
              <dt>{label}</dt><dd className="mono">{count(kind)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="stack">
        {rows.map(r => {
          // A gate filed under an office queue is listed there only for the office
          // (a Global Role); a project hat's own step stays here (S7.3, Instructor 2).
          const gates = r.gates.filter(g => roles.includes(g.hat))
          const tasks = r.tasks.filter(t => roles.includes(t.hat) && !t.queue)
          const held = [...new Set(r.ctx.active.filter(g => roles.includes(g.role)).map(g => g.role))]
          return (
            <article className="hat-row" key={r.project.id}>
              <div className="entry-head">
                <div>
                  <Link className="row-link" to={itemLink(r)}>{r.project.title}</Link>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    <span title={r.project.program}>{sectionNow(r.project).section}</span> · <span className="mono">{r.stage?.label}</span>
                  </div>
                </div>
                <div className="inline">
                  {held.map(role => <Badge key={role} tone="accent">{role}</Badge>)}
                  <Countdown deadline={r.project.revisionDeadline} />
                </div>
              </div>
              {showDefense && <PanelFacts r={r} me={me} />}
              {showCapstone2 && <Capstone2Facts r={r} me={me} />}
              {gates.length + tasks.length === 0
                ? <p className="small faint" style={{ margin: '8px 0 0' }}>Nothing due from you as {held.join(' / ')}.</p>
                : (
                  <ul className="todo">
                    {gates.map(g => (
                      <li key={g.gate.action} className={g.blocker ? 'muted' : undefined}>
                        <Link to={itemLink(r, g.gate.handledIn)}><strong>{g.gate.label}</strong></Link>
                        {g.blocker
                          ? <span className="blocker-inline"> — {g.blocker}</span>
                          : <span className="ok-inline"> — ready</span>}
                      </li>
                    ))}
                    {tasks.map((t, i) => (
                      <li key={i} className={t.urgent ? 'urgent' : undefined}><Link to={itemLink(r, t.tab)}>{t.label}</Link></li>
                    ))}
                  </ul>
                )}
            </article>
          )
        })}
      </div>
    </Section>
  )
}

/**
 * NEW-11 (flag PC_PROGRAM_VISIBILITY): program-level counts for every project
 * in the user's report scope, including ones they cannot open right now.
 */
function ProgramSummary() {
  const { snap, me } = useApp()
  const { scope, projects } = reportScope(me, snap)
  const programs = [...new Set(projects.map(p => p.program))]
  const bucket = (p) => p.currentStage === 'ARCHIVED' ? 'archived'
    : courseOfStage(p.currentStage) === COURSES.C1 ? 'c1' : 'c2'
  const count = (list, k) => list.filter(p => bucket(p) === k).length
  const overdue = (list) => list.filter(p => p.revisionDeadline && new Date(p.revisionDeadline) < Date.now()).length
  return (
    <Section title={scope ? 'Your programs at a glance' : 'School at a glance'} aside={<Link className="small" to="/reports">Reports</Link>}>
      <div className="table-scroll"><table>
        <thead>
          <tr><th>Program</th><th className="tight">Groups</th><th className="tight">Capstone 1</th><th className="tight">Capstone 2</th><th className="tight">Archived</th><th className="tight">Overdue</th></tr>
        </thead>
        <tbody>
          {programs.map(name => {
            const list = projects.filter(p => p.program === name)
            return (
              <tr key={name}>
                <td title={name}><strong>{programCode(name)}</strong> <span className="faint small prog-long">{name.replace(/^Bachelor of Science Major in /, '')}</span></td>
                <td className="tight mono">{list.length}</td>
                <td className="tight mono">{count(list, 'c1')}</td>
                <td className="tight mono">{count(list, 'c2')}</td>
                <td className="tight mono">{count(list, 'archived')}</td>
                <td className={`tight mono${overdue(list) ? ' tone-warn' : ''}`}>{overdue(list)}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <p className="faint small" style={{ marginTop: 8 }}>Counts only. A project opens to you while one of its steps is yours.</p>
    </Section>
  )
}

/** S10.1 — a way into the records-table archive from the worklist. */
function RecordsSearch() {
  const { snap } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const archived = (snap.projects ?? []).filter(p => p.currentStage === 'ARCHIVED').length
  return (
    <Section title="Records archive" aside={<Link className="small" to="/records">Open archive</Link>}>
      <form className="records-search" role="search" onSubmit={e => { e.preventDefault(); navigate(`/records${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the records archive"
          placeholder="Search title, research area, adviser or student" />
        <button type="submit">Search</button>
      </form>
      <p className="faint small" style={{ marginTop: 8 }}>
        {archived} archived project{archived === 1 ? '' : 's'} with a Pass result. Records hold no grades and no manuscript text.
      </p>
    </Section>
  )
}

/**
 * For Instructor 2: where the group stands in Capstone 2 — milestones (S6.5),
 * readiness and the recommendation (S6.7), the PC's endorsement (S7.1), the
 * final-defense schedule (S7.3) and post-defense requirements (S8.5).
 */
function Capstone2Facts({ r, me }) {
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

const MANUSCRIPTS = [DOC_TYPES.PROPOSAL_MANUSCRIPT, DOC_TYPES.FINAL_MANUSCRIPT, DOC_TYPES.REVISED_MANUSCRIPT]

/** For a panelist: the open defense and the one manuscript version they may read (T15). */
function PanelFacts({ r, me }) {
  const b = viewBundle(me, r.bundle)
  const defense = b.defenses.find(d => !d.verdict)
  const latest = b.documents.filter(d => MANUSCRIPTS.includes(d.docType))
    .sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt))[0]
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
