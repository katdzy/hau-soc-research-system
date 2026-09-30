import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import {
  addMember, removeMember, assignRole, unassignRole, ASSIGNING_CAPABILITY, assignmentConflict,
} from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDate } from '../ui.jsx'
import {
  GLOBAL_ROLES as G, ACCOUNT_STATUS, COURSES, accountType, capstone2SectionOf, nextSemester,
} from '../../domain/constants.js'
import { courseOfStage } from '../../domain/stages.js'
import { FLAGS } from '../../domain/flags.js'
import GatePanel from './GatePanel.jsx'
import Capstone2Checks from './Capstone2Checks.jsx'
import UroReview from './UroReview.jsx'

export default function OverviewPanel({ b, ctx, goTo }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [pickMember, setPickMember] = useState('')
  const [pickRole, setPickRole] = useState('')
  const [pickUser, setPickUser] = useState('')

  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id

  // Roles this user may hand out here — decided by capability in context.
  const assignable = Object.entries(ASSIGNING_CAPABILITY)
    .filter(([, cap]) => can(ctx, cap))
    .map(([role]) => role)

  const grouped = new Set((snap.projectMembers ?? []).map(m => m.userId))
  const candidates = users.filter(u =>
    (u.globalRoles ?? []).includes(G.STUDENT) && u.block === b.project.block && !grouped.has(u.id))
  const faculty = users.filter(u => accountType(u.email) === 'Faculty' && u.status === ACCOUNT_STATUS.ACTIVE)

  return (
    <>
      <Section title="Next step">
        <GatePanel b={b} ctx={ctx} goTo={goTo} />
      </Section>

      <UroReview b={b} ctx={ctx} goTo={goTo} />

      <Capstone2Checks b={b} ctx={ctx} />

      <Section title="Project record">
        <dl className="kv">
          <dt>Title</dt><dd>{b.project.title}</dd>
          {b.project.previousTitles?.length > 0 && (
            <>
              <dt>Previous titles</dt>
              <dd className="muted small">{b.project.previousTitles.join(' · ')}</dd>
            </>
          )}
          <dt>Program</dt><dd>{b.project.program}</dd>
          <dt>Capstone 1 section</dt><dd>{b.project.block} <span className="faint small">· {b.project.term}</span></dd>
          <dt>Capstone 2 section</dt>
          <dd>
            {capstone2SectionOf(b.project.block)} <span className="faint small">· {nextSemester(b.project.term)}
              {courseOfStage(b.project.currentStage) === COURSES.C1 && ' (upcoming)'}</span>
          </dd>
          <dt>Research area</dt><dd>{b.project.researchArea}</dd>
          <dt>Group created</dt><dd>{fmtDate(b.project.createdAt)}</dd>
          {b.project.topicRegisteredAt && <><dt>Title registered</dt><dd>{fmtDate(b.project.topicRegisteredAt)}</dd></>}
          {b.project.archiveResult && (
            <>
              <dt>Result</dt>
              <dd><Badge tone="ok">{b.project.archiveResult}</Badge> <span className="faint small">archived {fmtDate(b.project.archivedAt)}</span></dd>
            </>
          )}
        </dl>
      </Section>

      <Section
        title="Group members"
        aside={<span className={`small ${b.members.length < FLAGS.GROUP_SIZE ? 'tone-warn' : 'faint'}`}>{b.members.length} of {FLAGS.GROUP_SIZE} students</span>}
      >
        {b.members.length === 0 && <Empty>No students added yet.</Empty>}
        {b.members.length > 0 && (
          <table>
            <thead><tr><th>Student</th><th>Student number</th><th>Year and section</th><th className="tight" /></tr></thead>
            <tbody>
              {b.members.map(m => {
                const u = users.find(x => x.id === m.userId)
                return (
                  <tr key={m.id}>
                    <td>{u?.name ?? m.userId}</td>
                    <td className="mono muted">{u?.idNumber || '—'}</td>
                    <td className="small muted">{u?.yearLevel} · {u?.block}</td>
                    <td className="tight">
                      {can(ctx, 'roster.manage') && (
                        <button className="quiet small danger" disabled={busy}
                          onClick={() => run(() => removeMember(me, snap, b.project.id, m.id, m.userId))}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {can(ctx, 'roster.manage') && b.members.length < FLAGS.GROUP_SIZE && (
          <div className="row inline-form">
            <Field label={`Add a student from ${b.project.block}`}>
              <select value={pickMember} onChange={e => setPickMember(e.target.value)}>
                <option value="">{candidates.length ? 'Select a student…' : 'Everyone in the section is already grouped'}</option>
                {candidates.map(u => <option key={u.id} value={u.id}>{u.name} — {u.idNumber}</option>)}
              </select>
            </Field>
            <div className="inline-form-action">
              <button disabled={!pickMember || busy}
                onClick={() => run(async () => { await addMember(me, snap, b.project.id, pickMember); setPickMember('') })}>
                Add to group
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Faculty assignments">
        {b.assignments.length === 0 && <Empty>Nobody has been assigned yet.</Empty>}
        {b.assignments.length > 0 && (
          <table>
            <thead><tr><th>Project role</th><th>Faculty</th><th className="tight">Assigned</th><th className="tight" /></tr></thead>
            <tbody>
              {b.assignments.map(a => (
                <tr key={a.id}>
                  <td><Badge tone="accent">{a.roleType}</Badge></td>
                  <td>{nameOf(a.userId)}</td>
                  <td className="tight small faint">{fmtDate(a.assignedAt)}</td>
                  <td className="tight">
                    {assignable.includes(a.roleType) && (
                      <button className="quiet small danger" disabled={busy}
                        onClick={() => run(() => unassignRole(me, snap, b.project.id, a))}>
                        Unassign
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {assignable.length > 0 && (
          <div className="row inline-form">
            <Field label="Project role">
              <select value={pickRole} onChange={e => { setPickRole(e.target.value); setPickUser('') }}>
                <option value="">Select a role…</option>
                {assignable.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Faculty member">
              <select value={pickUser} onChange={e => setPickUser(e.target.value)} disabled={!pickRole}>
                <option value="">Select faculty…</option>
                {faculty.map(u => {
                  const conflict = pickRole ? assignmentConflict(b, u.id, pickRole) : null
                  return (
                    <option key={u.id} value={u.id} disabled={Boolean(conflict)}>
                      {u.name}{conflict ? ` — ${conflict}` : ''}
                    </option>
                  )
                })}
              </select>
            </Field>
            <div className="inline-form-action">
              <button disabled={!pickRole || !pickUser || busy}
                onClick={() => run(async () => {
                  await assignRole(me, snap, b.project.id, pickUser, pickRole)
                  setPickUser(''); setPickRole('')
                })}>
                Assign
              </button>
            </div>
          </div>
        )}
        <ActionError error={error} />
      </Section>
    </>
  )
}
