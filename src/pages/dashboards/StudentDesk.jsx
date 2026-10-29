import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { Badge, Section, Countdown, Avatar, daysLeft, fmtDate, fmtDateTime, verdictTone } from '../../components/ui.jsx'
import ProgressTrail from '../../components/ProgressTrail.jsx'
import { can, resolveContext, allowedDocTypes } from '../../domain/caac.js'
import { viewBundle } from '../../domain/guard.js'
import { macroStageOf, openGates, sectionNow, uroReturnOf, uroReturnOutstanding } from '../../domain/stages.js'
import { PROJECT_ROLES as P, ACCOUNT_STATUS, DOC_STATUS, REVIEWABLE_TYPES } from '../../domain/constants.js'
import { Stat, Stats, Feed, Activity } from './parts.jsx'

// The order the group meets its faculty in.
const PEOPLE = [P.INSTRUCTOR_1, P.ADVISER, P.PANEL_CHAIR, P.PANEL_MEMBER, P.INSTRUCTOR_2]

/**
 * §4 Student dashboard (Figma S-02) — the group's own project only: stage,
 * what the group owes, deadline, defense schedule, latest verdict, and its
 * faculty. Renders from the guard-filtered bundle, so a proposed Adviser or
 * panel stays hidden until the workflow announces it.
 */
export default function StudentDesk({ r }) {
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
  const returned = r.tasks.find(t => t.urgent && t.tab === 'documents')

  const deadline = daysLeft(b.project.revisionDeadline)
  const logsDone = b.weeklyLogs.filter(l => l.status === 'Approved').length

  return (
    <div aria-labelledby={`g-${b.project.id}`}>
      <section className="hero">
        <div>
          <h2 id={`g-${b.project.id}`}>{b.project.title}</h2>
          <div className="hero-pills">
            <Badge tone="accent">Stage: {macroStageOf(stage?.key)}{stage && macroStageOf(stage.key) !== stage.label ? ` · ${stage.label}` : ''}</Badge>
            {b.project.currentStage === 'ARCHIVED' && <Badge tone="ok">Completed</Badge>}
            {b.project.archiveResult && <Badge>Result: {b.project.archiveResult}</Badge>}
            {b.project.revisionStatus === 'Overdue' && <Badge tone="stop">Overdue</Badge>}
            <Countdown deadline={b.project.revisionDeadline} />
            {gate && <Badge tone="info">Next gate: {gate.label}</Badge>}
          </div>
          <dl className="hero-people">
            {people.filter(([role, names]) => names.length || role === P.ADVISER || role === P.INSTRUCTOR_1).map(([role, names]) => (
              <div key={role}>
                <dt>{role}</dt>
                <dd className={names.length ? undefined : 'faint'}>
                  {names.length ? names.join(', ') : role === P.ADVISER ? 'Awaiting appointment' : 'Not yet'}
                </dd>
              </div>
            ))}
            <div>
              <dt>Section</dt>
              <dd>{(({ section, course, term }) => `${section} · ${course} · ${term}`)(sectionNow(b.project))}</dd>
            </div>
          </dl>
        </div>
        <div className="hero-actions">
          <Link className="btn primary" to={link()}>Open project</Link>
          <Link className="btn" to={link('documents')}>{returned ? 'Resubmit document' : 'Version history'}</Link>
        </div>
      </section>

      {uroReturnOutstanding(b).length > 0 && (
        <div className="note stop mb-3" role="status">
          <strong>The University Research Office returned your {uroReturnOf(b).docTypes.join(' and ')}.</strong>{' '}
          {uroReturnOf(b).remarks}
        </div>
      )}

      <div className="desk-cols">
        <div className="desk-main">
          <Section title="Waiting on your group" tone={r.tasks.some(t => t.urgent) ? 'stop' : r.tasks.length ? 'accent' : undefined}>
            {r.tasks.length > 0 ? (
              <ul className="todo mt-0">
                {r.tasks.map((t, i) => (
                  <li key={i} className={t.urgent ? 'urgent' : undefined}>
                    <Link to={link(t.tab)}>{t.label}</Link>
                  </li>
                ))}
              </ul>
            ) : withReviewer.length ? (
              <p className="small muted m-0">
                Nothing right now. {withReviewer.map(d => `${d.docType} v${d.versionNumber}`).join(' and ')}
                {withReviewer.length > 1 ? ' are' : ' is'} waiting for a decision from {deciders.join(' or ')}.
              </p>
            ) : (
              <p className="small muted m-0">
                {gate
                  ? <>Nothing right now. Next: {gate.label.charAt(0).toLowerCase() + gate.label.slice(1)} — waiting on {gate.actorHint}.</>
                  : <>Your project is <strong>completed</strong>{b.project.archivedAt && <> and archived on {fmtDate(b.project.archivedAt)}</>}.</>}
              </p>
            )}
          </Section>

          <Stats>
            <Stat label="Pending tasks" n={r.tasks.length} tone={r.tasks.length ? 'accent' : undefined} />
            {deadline !== null
              ? <Stat label={deadline < 0 ? 'Days past the revision deadline' : 'Days before the revision deadline'}
                  n={deadline < 0 ? `−${Math.abs(deadline)}` : deadline} tone={deadline < 0 ? 'stop' : undefined} />
              : <Stat label="Documents submitted" n={b.documents.length} />}
            <Stat label="Weekly logs approved" n={`${logsDone} / ${b.weeklyLogs.length}`} to={link('logs')} />
          </Stats>

          {openDefense && (
            <Section title={`${openDefense.type} defense`}>
              <dl className="kv">
                <dt>Schedule</dt><dd>{fmtDateTime(openDefense.scheduledAt)}</dd>
                <dt>Venue or link</dt><dd>{openDefense.venue}</dd>
                {openDefense.instructions && <><dt>Instructions</dt><dd className="small">{openDefense.instructions}</dd></>}
              </dl>
            </Section>
          )}

          {verdict && (
            <Section title={`Latest verdict · ${verdict.type} defense`}>
              <div className="inline"><Badge tone={verdictTone(verdict.verdict)}>{verdict.verdict}</Badge>
                <span className="faint small">recorded {fmtDate(verdict.recordedAt)}</span>
                {verdict.revisionStatus === 'Completed' && <Badge tone="ok">revisions completed</Badge>}
              </div>
              {verdict.remarks && <p className="small m-0 mt-2 measure">{verdict.remarks}</p>}
            </Section>
          )}

          <Section title="Group members">
            <ul className="people-row">
              {b.members.map(m => (
                <li key={m.id}><Avatar name={nameOf(m.userId)} small />{nameOf(m.userId)}</li>
              ))}
            </ul>
          </Section>

          <Section title="Recent activity">
            <Activity rows={[r]} />
          </Section>
        </div>

        <aside className="desk-side" aria-label="Progress trail">
          <ProgressTrail b={b} history={b.history} />
          {openDefense && (
            <Section title="Coming up">
              <Feed items={[{ title: `${openDefense.type} defense`, sub: `${fmtDateTime(openDefense.scheduledAt)} · ${openDefense.venue}`, chip: ['Scheduled', 'info'], to: link('defense') }]} />
            </Section>
          )}
        </aside>
      </div>
    </div>
  )
}
