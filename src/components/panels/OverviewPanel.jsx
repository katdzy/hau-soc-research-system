import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/cac.js'
import { addMember, removeMember, assignRole, unassignRole } from '../../services/actions.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDate } from '../ui.jsx'
import { GLOBAL_ROLES, PROJECT_ROLES } from '../../domain/constants.js'
import GatePanel from './GatePanel.jsx'

export default function OverviewPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [pickMember, setPickMember] = useState('')
  const [pickRole, setPickRole] = useState('')
  const [pickUser, setPickUser] = useState('')

  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id

  const assignable = []
  if (can(ctx, 'adviser.assign')) assignable.push(PROJECT_ROLES.ADVISER, PROJECT_ROLES.INSTRUCTOR_2)
  if (can(ctx, 'panel.assign')) assignable.push(PROJECT_ROLES.PANEL_CHAIR, PROJECT_ROLES.PANEL_MEMBER)

  const takenMembers = new Set(b.members.map(m => m.userId))
  const candidates = users.filter(u => u.globalRole === GLOBAL_ROLES.STUDENT && !takenMembers.has(u.id))
  const faculty = users.filter(u => u.globalRole !== GLOBAL_ROLES.STUDENT)

  // BR-07 style conflict check: the Adviser may not sit on their advisee's panel.
  const adviserIds = new Set(b.assignments.filter(a => a.roleType === PROJECT_ROLES.ADVISER).map(a => a.userId))
  const conflicted = (userId, roleType) =>
    (roleType === PROJECT_ROLES.PANEL_CHAIR || roleType === PROJECT_ROLES.PANEL_MEMBER) && adviserIds.has(userId)

  return (
    <>
      <Section title="Next step">
        <GatePanel b={b} ctx={ctx} />
      </Section>

      <Section title="Project record">
        <dl className="kv">
          <dt>Working title</dt><dd>{b.project.title}</dd>
          {b.project.previousTitles?.length > 0 && (
            <>
              <dt>Previous titles</dt>
              <dd className="muted small">{b.project.previousTitles.join(' · ')}</dd>
            </>
          )}
          <dt>Programme</dt><dd>{b.project.program}</dd>
          <dt>Research area</dt><dd>{b.project.researchArea}</dd>
          <dt>Academic term</dt><dd>{b.project.term}</dd>
          <dt>Registered</dt><dd>{fmtDate(b.project.createdAt)}</dd>
          {b.project.archiveResult && (
            <>
              <dt>Archive result</dt>
              <dd><Badge tone={b.project.archiveResult === 'Pass' ? 'ok' : 'stop'}>{b.project.archiveResult}</Badge></dd>
            </>
          )}
        </dl>
      </Section>

      <Section
        title="Group members"
        aside={<span className="faint small">{b.members.length} student{b.members.length === 1 ? '' : 's'}</span>}
      >
        {b.members.length === 0 && <Empty>No students added yet.</Empty>}
        {b.members.length > 0 && (
          <table>
            <thead><tr><th>Student</th><th>ID number</th><th>Programme</th><th className="tight" /></tr></thead>
            <tbody>
              {b.members.map(m => {
                const u = users.find(x => x.id === m.userId)
                return (
                  <tr key={m.id}>
                    <td>{u?.name ?? m.userId}</td>
                    <td className="mono muted">{u?.idNumber || '—'}</td>
                    <td className="small muted">{u?.program} · {u?.yearLevel}</td>
                    <td className="tight">
                      {can(ctx, 'roster.manage') && (
                        <button className="quiet small danger" disabled={busy}
                          onClick={() => run(() => removeMember(me, b.project.id, m.id, m.userId))}>
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

        {can(ctx, 'roster.manage') && (
          <div className="row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <Field label="Add student to group">
              <select value={pickMember} onChange={e => setPickMember(e.target.value)}>
                <option value="">Select a student…</option>
                {candidates.map(u => (
                  <option key={u.id} value={u.id}>{u.name} — {u.idNumber}</option>
                ))}
              </select>
            </Field>
            <div style={{ flex: '0 0 auto', marginBottom: 14 }}>
              <button disabled={!pickMember || busy}
                onClick={() => run(async () => { await addMember(me, b.project.id, pickMember); setPickMember('') })}>
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
            <thead><tr><th>Role</th><th>Faculty</th><th className="tight">Assigned</th><th className="tight" /></tr></thead>
            <tbody>
              {b.assignments.map(a => (
                <tr key={a.id}>
                  <td><Badge tone="accent">{a.roleType}</Badge></td>
                  <td>{nameOf(a.userId)}</td>
                  <td className="tight small faint">{fmtDate(a.assignedAt)}</td>
                  <td className="tight">
                    {assignable.includes(a.roleType) && (
                      <button className="quiet small danger" disabled={busy}
                        onClick={() => run(() => unassignRole(me, b.project.id, a.id, { userId: a.userId, roleType: a.roleType }))}>
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
          <div className="row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <Field label="Role">
              <select value={pickRole} onChange={e => setPickRole(e.target.value)}>
                <option value="">Select a role…</option>
                {assignable.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Faculty member">
              <select value={pickUser} onChange={e => setPickUser(e.target.value)}>
                <option value="">Select faculty…</option>
                {faculty.map(u => (
                  <option key={u.id} value={u.id} disabled={conflicted(u.id, pickRole)}>
                    {u.name}{conflicted(u.id, pickRole) ? ' — conflict: adviser on this project' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ flex: '0 0 auto', marginBottom: 14 }}>
              <button disabled={!pickRole || !pickUser || busy}
                onClick={() => run(async () => {
                  if (conflicted(pickUser, pickRole)) throw new Error('The Adviser cannot be assigned to their own advisee’s panel.')
                  await assignRole(me, b.project.id, pickUser, pickRole)
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
