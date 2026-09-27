import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { visibleProjects, gateRows } from '../../services/views.js'
import { assignRole, unassignRole, runGate, scheduleDefense, assignmentConflict } from '../../services/actions.js'
import { can } from '../../domain/caac.js'
import { stageLabel, stageByKey, STAGES } from '../../domain/stages.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, StatTile, ProjectPicker, useProjectPick, Empty } from '../../components/blocks.jsx'
import { Field } from '../../components/ui.jsx'
import { PROJECT_ROLES as P, ACCOUNT_STATUS, accountType } from '../../domain/constants.js'

// Program Chair/Coordinator context (wireframes S-12, S-13, S-14). Scoped to
// the programs this Coordinator covers, and — by progressive visibility — to
// groups whose roster Instructor 1 has already turned over.

const faculty = (snap) => (snap.users ?? []).filter(u => accountType(u.email) === 'Faculty' && u.status === ACCOUNT_STATUS.ACTIVE)
const adviseeCount = (snap, userId) => (snap.projectAssignments ?? [])
  .filter(a => a.userId === userId && a.roleType === P.ADVISER)
  .filter(a => (snap.projects ?? []).find(p => p.id === a.projectId)?.currentStage !== 'ARCHIVED').length

function statusOf(b) {
  const s = b.project.currentStage
  if (b.project.revisionDeadline && new Date(b.project.revisionDeadline) < Date.now()) return ['Overdue', 'stop']
  if (s === 'ADVISER_ASSIGNMENT') return ['Needs adviser', 'warn']
  if (s === 'PANEL_ASSIGNMENT') return ['Needs panel', 'warn']
  if (s.endsWith('_DEFENSE')) return ['Scheduled', undefined]
  if (s === 'URO_VERIFICATION' || s === 'FINAL_APPROVAL') return ['Routed', undefined]
  if (s === 'ARCHIVED') return ['Archived', 'ok']
  return ['On track', undefined]
}

export function CoordinatorDashboard() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me)
  const active = rows.filter(r => r.b.project.currentStage !== 'ARCHIVED')
  const month = new Date().getMonth()
  const defensesThisMonth = active.flatMap(r => r.b.defenses).filter(d => new Date(d.scheduledAt).getMonth() === month).length
  const overdue = active.filter(r => statusOf(r.b)[0] === 'Overdue').length
  const [stage, setStage] = useState('')
  const [adviser, setAdviser] = useState('')
  const [q, setQ] = useState('')
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name
  const adviserOf = (b) => b.assignments.find(a => a.roleType === P.ADVISER)?.userId
  const shown = rows.filter(({ b }) =>
    (!stage || b.project.currentStage === stage) && (!adviser || adviserOf(b) === adviser) &&
    (!q || `${b.project.groupName} ${b.project.title}`.toLowerCase().includes(q.toLowerCase())))

  const actions = [
    { label: 'Assign advisers', n: gateRows(snap, me, ['adviser.assign']).length, note: 'block rosters from Instructor 1', to: '/adviser-assignment' },
    { label: 'Assign panels', n: gateRows(snap, me, ['panel.assign']).length, note: 'groups cleared for proposal defense', to: '/panel-assignment' },
    { label: 'Schedule proposal defenses', n: gateRows(snap, me, ['defense.schedule']).length, note: 'panels confirmed', to: '/panel-assignment' },
    { label: 'Endorse for final defense', n: gateRows(snap, me, ['finaldefense.endorse']).length, note: 'Adviser recommendations', to: '/endorsement' },
    { label: 'Endorse Approval Sheet to URO', n: gateRows(snap, me, ['clearance.endorse']).length, note: 'signed by the Adviser and panel', to: '/clearance' },
  ]
  const load = faculty(snap).map(u => ({ u, n: adviseeCount(snap, u.id) })).filter(x => x.n).sort((a, b) => b.n - a.n)
  const max = Math.max(1, ...load.map(x => x.n))

  return (
    <div className="page page-wide">
      <PageHead title="Program visibility dashboard"
        lede={`${(me.programScope ?? []).join(' & ')} · ${active.length} active project${active.length === 1 ? '' : 's'}`} />
      <div className="stat-row five">
        <StatTile label="Active projects" value={active.length} />
        <StatTile label="Awaiting adviser" value={actions[0].n} />
        <StatTile label="Awaiting panel" value={actions[1].n} />
        <StatTile label="Defenses this month" value={defensesThisMonth} />
        <StatTile label="Overdue revisions" value={overdue} tone={overdue ? 'stop' : undefined} />
      </div>

      <div className="two-col wide-left">
        <section className="panel flush">
          <div className="panel-head padded">
            <h2>All projects in your program</h2>
            <Link className="btn small" to="/reports">Export report</Link>
          </div>
          <div className="toolbar padded">
            <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Stage">
              <option value="">Stage</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={adviser} onChange={e => setAdviser(e.target.value)} aria-label="Adviser">
              <option value="">Adviser</option>{faculty(snap).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search projects" />
          </div>
          <div className="table-scroll"><table>
            <thead><tr><th>Group</th><th>Adviser</th><th>Stage</th><th>Panel</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map(({ b }) => {
                const [label, tone] = statusOf(b)
                const panel = b.assignments.some(a => a.roleType === P.PANEL_CHAIR)
                return (
                  <tr key={b.project.id}>
                    <td><Link className="row-link" to={`/projects/${b.project.id}`}>{b.project.groupName}</Link><div className="small muted clamp-2">{b.project.title}</div></td>
                    <td className="small">{nameOf(adviserOf(b)) ?? <span className="faint">Not assigned</span>}</td>
                    <td className="small">{stageLabel(b.project.currentStage)}</td>
                    <td className="small">{panel ? 'Assigned' : '—'}</td>
                    <td><Chip tone={tone}>{label}</Chip></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Needs your action</h2></div>
            <ul className="action-list">
              {actions.map(a => (
                <li key={a.label}>
                  <span><strong className="small">{a.label}</strong><span className="small muted"> · {a.n} {a.note}</span></span>
                  {a.n > 0 ? <Link className="small" to={a.to}>Open</Link> : <span className="faint small">None</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Faculty advisory load</h2><span className="faint small">Current advisee groups</span></div>
            <ul className="load-list">
              {load.map(({ u, n }) => (
                <li key={u.id}>
                  <span className="small">{u.name}</span>
                  <span className="load-bar" aria-hidden="true"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                  <span className="mono small">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** Wireframe S-13. */
export function AdviserAssignment() {
  const { snap, me } = useApp()
  const rows = gateRows(snap, me, ['adviser.assign']).map(r => ({ b: r.b, ctx: r.ctx, gate: r.gate }))
  const [current, pick] = useProjectPick(rows)
  const [chosen, setChosen] = useState('')
  const [search, setSearch] = useState('')
  const [remarks, setRemarks] = useState('')
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'

  if (!current) {
    return <div className="page"><PageHead title="Adviser assignment" /><Empty>No groups are awaiting an adviser.</Empty></div>
  }
  const { b, gate } = current
  const assigned = b.assignments.find(a => a.roleType === P.ADVISER)
  const candidates = faculty(snap).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))
  const selected = chosen || assigned?.userId || ''

  async function saveAdviser() {
    if (assigned?.userId === selected) return
    if (assigned) await unassignRole(me, snap, b.project.id, assigned)
    await assignRole(me, await fresh(), b.project.id, selected, P.ADVISER)
  }

  return (
    <div className="page page-wide">
      <PageHead title="Adviser assignment"
        lede="Block rosters turned over by Instructor 1. The assignment goes to the Dean and Associate Dean for approval before the group is notified." />
      <div className="three-col">
        <section className="panel flush">
          <div className="panel-head padded"><h2>Awaiting adviser</h2><span className="faint small">{rows.length} group{rows.length === 1 ? '' : 's'}</span></div>
          <ul className="pick-list">
            {rows.map(r => (
              <li key={r.b.project.id}>
                <button className={r.b.project.id === b.project.id ? 'is-selected' : undefined} aria-pressed={r.b.project.id === b.project.id}
                  onClick={() => { pick(r.b.project.id); setChosen('') }}>
                  <strong>{r.b.project.groupName}</strong>
                  <span className="small muted">{r.b.members.map(m => nameOf(m.userId).split(' ')[0]).join(', ')} · {r.b.project.researchArea === 'Not yet set' ? 'no topic yet' : r.b.project.researchArea}</span>
                  <span className="chips"><Chip>{r.b.project.program.split(' — ')[0]}</Chip><Chip>Block {r.b.project.block}</Chip></span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{b.project.groupName} — assign an adviser</h2>
            <span className="faint small">Block {b.project.block} · {b.members.length} members · roster from Instructor 1</span>
          </div>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search faculty by name" aria-label="Search faculty" />
          <div className="label" style={{ margin: '16px 0 8px' }}>Available faculty</div>
          <fieldset className="choice">
            <legend className="sr-only">Adviser</legend>
            {candidates.map(u => {
              const conflict = assignmentConflict(b, u.id, P.ADVISER)
              const isCurrent = assigned?.userId === u.id
              return (
                <label key={u.id} className={`choice-card${conflict && !isCurrent ? ' is-disabled' : ''}`}>
                  <input type="radio" name="adviser" value={u.id} checked={selected === u.id} disabled={Boolean(conflict) && !isCurrent}
                    onChange={() => setChosen(u.id)} />
                  <span>
                    <strong>{u.name}</strong>
                    <span className="small muted">{(u.globalRoles ?? []).join(', ') || 'Faculty, SOC'} · advising {adviseeCount(snap, u.id)} group{adviseeCount(snap, u.id) === 1 ? '' : 's'}</span>
                    <Chip tone={conflict && !isCurrent ? 'stop' : undefined}>{isCurrent ? 'Assigned' : conflict ?? 'Available'}</Chip>
                  </span>
                </label>
              )
            })}
          </fieldset>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Routing</h2></div>
            <ol className="routing">
              <li className="is-done"><strong>Instructor 1</strong><span className="small muted">Roster turned over</span><Chip tone="ok">Done</Chip></li>
              <li className="is-current"><strong>Program Coordinator</strong><span className="small muted">Adviser selected</span><Chip>You</Chip></li>
              <li><strong>Dean / Associate Dean</strong><span className="small muted">Approve assignment</span><Chip>Next</Chip></li>
              <li><strong>Student group</strong><span className="small muted">Notified by email</span><Chip>Pending</Chip></li>
            </ol>
            <Field label="Justification / remarks"><textarea value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
            <button className="primary block" disabled={busy || !selected}
              onClick={() => run(async () => {
                await saveAdviser()
                await runGate(me, await fresh(), b.project.id, { ...gate, label: remarks.trim() ? `${gate.label} — ${remarks.trim()}` : gate.label })
                setChosen(''); setRemarks('')
              })}>
              Endorse to Dean / Assoc. Dean
            </button>
            <button className="block" style={{ marginTop: 8 }} disabled={busy || !selected || selected === assigned?.userId}
              onClick={() => run(async () => { await saveAdviser(); setChosen('') })}>
              Save without endorsing
            </button>
            <ActionError error={error} />
          </section>
          <section className="note">
            <strong>Conflict checking.</strong> The system flags duplicate assignments before the adviser is recorded;
            every assignment is written to the audit trail.
          </section>
        </aside>
      </div>
    </div>
  )
}

/** Wireframe S-14. */
export function PanelAssignment() {
  const { snap, me } = useApp()
  const rows = useMemo(() => [
    ...gateRows(snap, me, ['panel.assign']),
    ...gateRows(snap, me, ['defense.schedule']),
  ], [snap, me])
  const [current, pick] = useProjectPick(rows)
  const [slots, setSlots] = useState({})
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [venue, setVenue] = useState('SOC Conference Room, 3rd Floor')
  const { run, error, busy } = useAction()
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'

  if (!current) {
    return <div className="page"><PageHead title="Panel assignment" /><Empty>No group is waiting for a panel or a proposal defense schedule.</Empty></div>
  }
  const { b, ctx } = current
  const stage = b.project.currentStage
  const isProposal = stage === 'PANEL_ASSIGNMENT' || stage === 'PROPOSAL_DEFENSE_SCHEDULING'
  const existing = (role) => b.assignments.filter(a => a.roleType === role)
  const chair = existing(P.PANEL_CHAIR)[0]
  const members = existing(P.PANEL_MEMBER)
  const slotDefs = [
    { key: 'chair', role: P.PANEL_CHAIR, label: 'Panel Chair', help: 'Records the official verdict (exclusive)', current: chair },
    { key: 'm1', role: P.PANEL_MEMBER, label: 'Panel Member 1', help: 'Evaluates, annotates privately, confirms revisions', current: members[0] },
    { key: 'm2', role: P.PANEL_MEMBER, label: 'Panel Member 2', help: 'Evaluates, annotates privately, confirms revisions', current: members[1] },
  ]
  const picked = slotDefs.map(s => slots[s.key] || s.current?.userId).filter(Boolean)
  const adviser = b.assignments.find(a => a.roleType === P.ADVISER)
  const duplicate = picked.length !== new Set(picked).size
  const when = date ? new Date(`${date}T${time}`) : null
  const busyAt = (userId) => when && (snap.defenses ?? []).some(d => d.projectId !== b.project.id && !d.verdict &&
    Math.abs(new Date(d.scheduledAt) - when) < 90 * 60e3 &&
    (snap.projectAssignments ?? []).some(a => a.projectId === d.projectId && a.userId === userId))
  const clash = picked.filter(busyAt)
  const canAssign = can(ctx, 'panel.assign')
  const canSchedule = isProposal && (canAssign || can(ctx, 'defense.schedule'))

  async function submit(endorse) {
    for (const s of slotDefs) {
      const want = slots[s.key]
      if (!want || want === s.current?.userId) continue
      if (s.current) await unassignRole(me, snap, b.project.id, s.current)
      await assignRole(me, await fresh(), b.project.id, want, s.role)
    }
    if (!endorse) return
    if (stage === 'PANEL_ASSIGNMENT') await runGate(me, await fresh(), b.project.id, stageByKey(stage).gates[0])
    if (isProposal) {
      if (!when) throw new Error('Choose the defense date and time.')
      await scheduleDefense(me, await fresh(), b.project.id, { scheduledAt: when.toISOString(), venue })
    }
    setSlots({})
  }

  return (
    <div className="page page-wide">
      <PageHead title={`Panel assignment — ${b.project.groupName}`}
        lede={`${isProposal ? 'Proposal' : 'Final'} defense · designate the Panel Chair and Panel Members for this group`}>
        <ProjectPicker rows={rows} current={current} onPick={(id) => { pick(id); setSlots({}) }} />
      </PageHead>

      <div className="two-col wide-left">
        <section className="panel">
          <div className="panel-head"><h2>Panel composition</h2><span className="faint small">{stageLabel(stage)}</span></div>
          {slotDefs.map(s => {
            const value = slots[s.key] ?? s.current?.userId ?? ''
            return (
              <div key={s.key} className="slot">
                <div className="label">{s.label}</div>
                <div className="slot-row">
                  <select value={value} disabled={!canAssign} onChange={e => setSlots(x => ({ ...x, [s.key]: e.target.value }))} aria-label={s.label}>
                    <option value="">Select faculty…</option>
                    {faculty(snap).map(u => {
                      const c = u.id !== s.current?.userId ? assignmentConflict(b, u.id, s.role) : null
                      return <option key={u.id} value={u.id} disabled={Boolean(c) && c !== 'Already on this panel'}>{u.name}{c ? ` — ${c}` : ''}</option>
                    })}
                  </select>
                </div>
                <div className="small muted">{s.help}</div>
                <div className="chips">
                  {value ? <Chip tone="ok">Available</Chip> : <Chip>Not yet selected</Chip>}
                  {value && (busyAt(value) ? <Chip tone="warn">Schedule conflict</Chip> : <Chip>No conflicts found</Chip>)}
                </div>
              </div>
            )
          })}
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Conflict checks</h2><span className="faint small">Run on every selection</span></div>
            <ul className="checks">
              <li className={adviser && picked.includes(adviser.userId) ? 'is-fail' : 'is-pass'}>
                <strong className="small">Adviser of this group</strong>
                <span className="small muted">{adviser ? `${picked.includes(adviser.userId) ? 'Fail' : 'Pass'} — ${nameOf(adviser.userId)} excluded from the panel` : 'No adviser recorded'}</span>
              </li>
              <li className={duplicate ? 'is-fail' : 'is-pass'}>
                <strong className="small">Duplicate panel role</strong>
                <span className="small muted">{duplicate ? 'Fail — one person holds two slots' : 'Pass — no one holds two slots on this panel'}</span>
              </li>
              <li className={clash.length ? 'is-warn' : 'is-pass'}>
                <strong className="small">Schedule conflict</strong>
                <span className="small muted">{!when ? 'Choose a slot to check' : clash.length ? `Warning — ${clash.map(nameOf).join(', ')} has a defense in the same slot` : 'Pass — everyone is free'}</span>
              </li>
            </ul>
            <p className="small faint" style={{ margin: 0 }}>Schedule flags are advisory. Every assignment is written to the audit trail.</p>
          </section>
        </aside>
      </div>

      <div className="two-col wide-left" style={{ marginTop: 24 }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Defense schedule</h2>
            <span className="faint small">Proposal defenses are scheduled here; final oral defenses by Instructor 2</span>
          </div>
          {isProposal ? (
            <div className="row">
              <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
              <Field label="Time"><input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
              <Field label="Venue / link"><input value={venue} onChange={e => setVenue(e.target.value)} /></Field>
            </div>
          ) : <p className="small muted">Instructor 2 publishes the final defense schedule after your endorsement.</p>}
        </section>
        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Endorsement</h2></div>
            <p className="small muted">
              Assigning confirms the panel{isProposal ? ', publishes the schedule, generates the AI summary' : ''} and emails the panel,
              the Adviser and the group.
            </p>
            <button className="primary block" disabled={busy || duplicate || !canSchedule}
              onClick={() => run(() => submit(true))}>
              {isProposal ? 'Assign panel and publish schedule' : 'Save panel'}
            </button>
            {canAssign && isProposal && (
              <button className="block" style={{ marginTop: 8 }} disabled={busy || duplicate} onClick={() => run(() => submit(false))}>Save draft</button>
            )}
            <ActionError error={error} />
          </section>
        </aside>
      </div>
    </div>
  )
}

// The service layer reads its own fresh snapshot for guards; this keeps the
// page's multi-step submits honest between steps.
async function fresh() {
  const { db } = await import('../../backend/index.js')
  return db.snapshot()
}
