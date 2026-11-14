import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { canDo } from '../../domain/guard.js'
import { FLAGS } from '../../domain/flags.js'
import { ADVISER_APPROVERS, requiredAdviserApprovers, adviserReturnOf } from '../../domain/stages.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, ACCOUNT_STATUS, accountType, programCode } from '../../domain/constants.js'
import { assignRole, unassignRole, runGate, returnAdviserAssignment, assignmentConflict } from '../../services/api.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Badge, Field, fmtDate, programShort } from '../ui.jsx'
import Dialog from '../Dialog.jsx'
import { Act } from '../ViewOnly.jsx'

// Adviser Assignment, as the wireframe lays it out (Capstone 1 · Step 2):
// the Program Chair picks an adviser and routes the slip (M-24); the
// Associate Dean and the Dean read the slip, then approve or return it
// (M-01 – M-04). Both dialogs call the same services the Overview tab does —
// assignRole, the ROUTE_ADVISER and APPROVE_ADVISER gates,
// returnAdviserAssignment — so the guard decides exactly as before.

/** Groups a faculty member advises now (completed projects do not count). */
export function adviserLoad(snap, userId) {
  const open = new Set((snap.projects ?? []).filter(p => p.currentStage !== 'ARCHIVED').map(p => p.id))
  return (snap.projectAssignments ?? [])
    .filter(a => a.userId === userId && a.roleType === P.ADVISER && a.status !== 'Declined' && open.has(a.projectId)).length
}

const officesOf = (u) => (u.globalRoles ?? []).filter(x => x !== G.FACULTY && x !== G.STUDENT)
const groups = (n) => `${n} group${n === 1 ? '' : 's'}`
// The slip reads Associate Dean, then Dean; either may act first (flag ADVISER_APPROVAL).
const OFFICES = [G.ASSOCIATE_DEAN, G.DEAN].filter(r => ADVISER_APPROVERS.includes(r))

/** The route down the side of both dialogs: who has acted, who is next. */
function Route({ title, steps }) {
  return (
    <div>
      <h3 className="label mt-0">{title}</h3>
      <ol className="routing">
        {steps.map(s => (
          <li key={s.who} className={s.state ? `is-${s.state}` : undefined}>
            <strong className="small">{s.who}</strong>
            <span className="small muted">{s.sub}</span>
            {s.chip && <Badge tone={s.chip[1]}>{s.chip[0]}</Badge>}
          </li>
        ))}
      </ol>
    </div>
  )
}

// --- M-24 · Program Chair: assign an adviser -----------------------------------------

export function AssignAdviserDialog({ r, onClose }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const b = r.bundle
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const current = b.assignments.find(a => a.roleType === P.ADVISER)
  const returned = adviserReturnOf(b)
  const [picked, setPicked] = useState(current?.userId ?? '')
  const [q, setQ] = useState('')

  const needle = q.trim().toLowerCase()
  const faculty = users
    .filter(u => accountType(u.email) === 'Faculty' && u.status === ACCOUNT_STATUS.ACTIVE)
    // The System Administrator and the URO are offices, not teaching faculty.
    .filter(u => u.id === current?.userId || !(u.globalRoles ?? []).some(x => x === G.ADMIN || x === G.URO))
    .map(u => ({ u, load: adviserLoad(snap, u.id), conflict: u.id === current?.userId ? null : assignmentConflict(b, u.id, P.ADVISER) }))
    .filter(f => !needle || f.u.name.toLowerCase().includes(needle))
    .sort((x, y) => x.load - y.load || x.u.name.localeCompare(y.u.name))

  const chosen = users.find(u => u.id === picked)
  // An office named as the Adviser sits the approval out (flag BLOCK_SELF_APPROVAL).
  const sitsOut = FLAGS.BLOCK_SELF_APPROVAL ? OFFICES.filter(o => (chosen?.globalRoles ?? []).includes(o)) : []
  const approvers = OFFICES.filter(o => !sitsOut.includes(o))
  const i1 = b.assignments.filter(a => a.roleType === P.INSTRUCTOR_1).map(a => nameOf(a.userId))

  function assign() {
    run(async () => {
      if (current && current.userId !== picked) await unassignRole(me, snap, b.project.id, current)
      if (current?.userId !== picked) await assignRole(me, snap, b.project.id, picked, P.ADVISER)
      await runGate(me, snap, b.project.id, { action: 'ROUTE_ADVISER' })
      onClose()
    })
  }

  return (
    <Dialog
      wide title={`Assign an adviser — ${b.project.title}`}
      sub={`Sent by ${i1.join(', ') || 'Instructor 1'} · ${programCode(b.project.program)} · ${b.project.block} · ${b.members.length} member${b.members.length === 1 ? '' : 's'}`}
      onClose={busy ? undefined : onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <Act>
          <button type="button" className="primary" disabled={busy || !picked} onClick={assign}>
            {busy ? 'Routing…' : 'Assign & route for approval'}
          </button>
        </Act>
      </>}
    >
      <div className="slip-cols">
        <div>
          {returned && (
            <div className="note stop mb-2" role="note">
              <strong className="small">Returned by the {returned.hat}</strong>
              <p className="small m-0 mt-half">{returned.remarks}</p>
              <p className="small muted m-0 mt-half">Keep or change the adviser, then route it again.</p>
            </div>
          )}
          <Field label="Search faculty">
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" />
          </Field>
          <fieldset className="choice adviser-list">
            <legend className="label">Available advisers</legend>
            {faculty.length === 0 && <p className="small faint m-0">{needle ? 'No faculty member matches.' : 'No active faculty account yet.'}</p>}
            {faculty.map(({ u, load, conflict }) => (
              <label key={u.id} className={`choice-card${conflict ? ' is-disabled' : ''}`}>
                <input type="radio" name="adviser" checked={picked === u.id} disabled={Boolean(conflict) || busy} onChange={() => setPicked(u.id)} />
                <span>
                  <strong className="small">{u.name}</strong>
                  <span className="faint small">
                    {conflict ?? (officesOf(u).join(', ') || 'Faculty')}
                    {u.id === current?.userId && ' · proposed now'}
                  </span>
                </span>
                <Badge tone={load === 0 ? 'ok' : undefined}>{load ? `Advises ${groups(load)}` : 'No advisees yet'}</Badge>
              </label>
            ))}
          </fieldset>
          <ActionError error={error} />
        </div>

        <div>
          <div className="slip-box">
            <strong>{b.project.title}</strong>
            <p className="small m-0 mt-half">{b.members.map(m => nameOf(m.userId)).join(', ') || 'No members'}</p>
            <p className="small faint m-0 mt-half">
              {b.project.topicRegisteredAt ? b.project.researchArea : 'Working title not set yet'}
            </p>
          </div>
          <Route title="Route after you assign" steps={[
            { who: 'Program Chair · you', sub: 'Assign an adviser', state: 'current', chip: ['Awaiting you', 'warn'] },
            ...approvers.map(o => ({ who: o, sub: 'Approves the assignment', chip: ['Not yet'] })),
            ...sitsOut.map(o => ({ who: o, sub: 'Named as the adviser, so this office does not approve', chip: ['Sits out'] })),
          ]} />
          {approvers.length > 1 && (
            <p className="small faint m-0">
              {FLAGS.ADVISER_APPROVAL === 'either' ? 'Either office’s approval confirms the adviser.' : 'Both offices approve, in either order.'}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// --- M-01 – M-04 · Associate Dean and Dean: the adviser routing slip ---------------------

const SLIP_STEPS = ['View group & adviser', 'Decide']

export function RoutingSlipDialog({ r, onClose }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const b = r.bundle
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState('approve')
  const [remarks, setRemarks] = useState('')

  const hat = ADVISER_APPROVERS.find(o => (me.globalRoles ?? []).includes(o))
  const approvals = b.project.adviserApprovals ?? {}
  const required = requiredAdviserApprovers(b)
  const mine = approvals[hat]
  const approve = canDo(me, 'APPROVE_ADVISER', b)
  const giveBack = canDo(me, 'returnAdviser', b)
  const canApprove = approve.ok && !mine
  const others = required.filter(o => o !== hat)
  const waitingOn = others.filter(o => !approvals[o])
  const completes = FLAGS.ADVISER_APPROVAL === 'either' || waitingOn.length === 0

  const assignment = b.assignments.find(a => a.roleType === P.ADVISER)
  const adviser = nameOf(assignment?.userId)
  const i1 = b.assignments.filter(a => a.roleType === P.INSTRUCTOR_1).map(a => nameOf(a.userId))
  const returning = step === 1 && choice === 'return'

  const officeStep = (o) => {
    const you = o === hat ? ' · you' : ''
    if (!required.includes(o)) return { who: o + you, sub: 'Named as the adviser, so this office does not approve', chip: ['Sits out'] }
    if (approvals[o]) return { who: o + you, sub: `Approved · ${fmtDate(approvals[o].at)}`, state: 'done', chip: ['Approved', 'ok'] }
    if (o === hat && step === 1 && canApprove) {
      return returning
        ? { who: o + you, sub: remarks.trim() ? `“${remarks.trim()}”` : 'Goes back to the Program Chair', state: 'stop', chip: ['Returned to preparer', 'stop'] }
        : { who: o + you, sub: 'Your approval', state: 'done', chip: ['Approved', 'ok'] }
    }
    return { who: o + you, sub: o === G.DEAN ? 'Approves the assignment' : 'Verifies school-level compliance', state: 'current', chip: [o === hat ? 'Awaiting you' : 'Awaiting', o === hat ? 'warn' : undefined] }
  }
  const route = [
    { who: 'Program Chair · preparer', sub: `Assigned the adviser · ${fmtDate(assignment?.assignedAt)}`, state: 'done', chip: ['Routed', 'ok'] },
    ...OFFICES.map(officeStep),
  ]

  function confirm() {
    run(async () => {
      if (choice === 'return') await returnAdviserAssignment(me, snap, b.project.id, { remarks })
      else await runGate(me, snap, b.project.id, { action: 'APPROVE_ADVISER' })
      onClose()
    })
  }

  const footer = !canApprove
    ? <button type="button" onClick={onClose}>Close</button>
    : step === 0
      ? <>
          <button type="button" onClick={onClose}>Cancel</button>
          {/* Reading the slip is fine on a phone; deciding is not (PHONE_VIEW_ONLY). */}
          <Act><button type="button" className="primary" onClick={() => setStep(1)}>Next: Decide →</button></Act>
        </>
      : <>
          <button type="button" onClick={() => setStep(0)} disabled={busy}>Back</button>
          {returning
            ? <button type="button" className="solid-stop" disabled={busy || !remarks.trim()} onClick={confirm}>{busy ? 'Returning…' : 'Return to preparer'}</button>
            : <button type="button" className="solid-ok" disabled={busy} onClick={confirm}>{busy ? 'Approving…' : 'Confirm approval'}</button>}
        </>

  return (
    <Dialog
      wide title={`Adviser routing slip — ${b.project.title}`}
      sub={step === 1 ? 'Decide whether to approve or return to the preparer' : `Routed by the Program Chair${others.some(o => approvals[o]) ? ` · approved by the ${others.filter(o => approvals[o]).join(' and ')}` : ''}`}
      steps={canApprove ? SLIP_STEPS : undefined} step={step} footer={footer} onClose={busy ? undefined : onClose}
    >
      <div className="slip-cols">
        {step === 0 && (
          <div className="slip-stack">
            {mine && (
              <p className="note small m-0" role="status">
                You approved this on {fmtDate(mine.at)}.{waitingOn.length > 0 && ` It still needs the ${waitingOn.join(' and ')}.`}
              </p>
            )}
            {!mine && !approve.ok && <p className="note small m-0" role="status">{approve.reason ?? 'This slip is not yours to decide.'}</p>}
            <div className="slip-box">
              <h3>Group</h3>
              <dl className="slip-facts">
                <dt>Group</dt><dd>{b.project.title}</dd>
                <dt>Program</dt><dd>{programCode(b.project.program)} — {programShort(b.project.program)}</dd>
                <dt>Section</dt><dd>{b.project.block}{b.project.term ? ` · ${b.project.term}` : ''}</dd>
                <dt>Members</dt><dd>{b.members.map(m => nameOf(m.userId)).join(', ') || '—'}</dd>
                <dt>Instructor 1</dt><dd>{i1.join(', ') || '—'}</dd>
              </dl>
            </div>
            <div className="slip-box is-accent">
              <h3>Adviser assigned by the Program Chair</h3>
              <dl className="slip-facts">
                <dt>Adviser</dt><dd>{adviser}</dd>
                <dt>Current advisory load</dt><dd>{assignment ? groups(adviserLoad(snap, assignment.userId)) : '—'}, this one included</dd>
                <dt>Assigned</dt><dd>{fmtDate(assignment?.assignedAt)}{assignment?.assignedBy && ` · ${nameOf(assignment.assignedBy)}`}</dd>
              </dl>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <fieldset className="choice decide">
              <legend className="sr-only">Decision</legend>
              <label className="choice-card is-ok">
                <input type="radio" name="slip-decision" checked={choice === 'approve'} onChange={() => setChoice('approve')} disabled={busy} />
                <span>
                  <strong>{completes ? 'Approve' : 'Approve & forward'}</strong>
                  <span className="small muted">
                    {completes
                      ? `Confirms ${adviser} as the adviser of ${b.project.title} and emails the group, the adviser and Instructor 1.`
                      : `Records your approval. The slip still needs the ${waitingOn.join(' and ')}.`}
                  </span>
                </span>
              </label>
              <label className={`choice-card is-stop${giveBack.ok ? '' : ' is-disabled'}`}>
                <input type="radio" name="slip-decision" checked={choice === 'return'} onChange={() => setChoice('return')} disabled={busy || !giveBack.ok} />
                <span>
                  <strong>Return to preparer</strong>
                  <span className="small muted">
                    {giveBack.ok ? 'Sends the slip back to the Program Chair with your remarks. Approvals already given are cleared.' : giveBack.reason}
                  </span>
                </span>
              </label>
            </fieldset>
            {returning && (
              <Field label="Remarks (required)" hint="Emailed to the Program Chair and the other office. Not to the proposed adviser or the students.">
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} required />
              </Field>
            )}
            <ActionError error={error} />
          </div>
        )}

        <Route title={step === 1 && canApprove ? 'Route after you confirm' : 'Route'} steps={route} />
      </div>
    </Dialog>
  )
}

// --- Several slips at once (Executive approvals: "Approve selected") ------------------------

/**
 * Approves several adviser routing slips in one go, for an office with a full
 * queue. Each goes through the same APPROVE_ADVISER gate the slip uses, so
 * the guard decides each one as before (NEW-5 included). `rows` are worklist
 * rows this office can approve now.
 */
export function BulkApproveDialog({ rows, onClose, onDone }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [done, setDone] = useState([])
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const hat = ADVISER_APPROVERS.find(o => (me.globalRoles ?? []).includes(o))
  const n = rows.length

  const outcome = (b) => {
    const approvals = b.project.adviserApprovals ?? {}
    const waitingOn = requiredAdviserApprovers(b).filter(o => o !== hat && !approvals[o])
    return FLAGS.ADVISER_APPROVAL === 'either' || waitingOn.length === 0
      ? ['Appoints the adviser', 'ok']
      : [`Still needs the ${waitingOn.join(' and ')}`, undefined]
  }

  function approveAll() {
    run(async () => {
      for (const r of rows) {
        if (done.includes(r.project.id)) continue
        await runGate(me, snap, r.project.id, { action: 'APPROVE_ADVISER' })
        setDone(d => [...d, r.project.id])
      }
      onDone?.()
      onClose()
    })
  }

  return (
    <Dialog
      title={`Approve ${n} adviser assignment${n === 1 ? '' : 's'}`}
      sub={`As ${hat}. Each one is recorded and emailed as if you approved its slip.`}
      onClose={busy ? undefined : onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <Act>
          <button type="button" className="solid-ok" disabled={busy} onClick={approveAll}>
            {busy ? `Approving ${done.length + 1} of ${n}…` : `Approve ${n}`}
          </button>
        </Act>
      </>}
    >
      <ul className="bulk-list">
        {rows.map(r => {
          const b = r.bundle
          const adviser = b.assignments.find(a => a.roleType === P.ADVISER)?.userId
          const [what, tone] = outcome(b)
          return (
            <li key={r.project.id}>
              <span>
                <strong className="small">{nameOf(adviser)}</strong>
                <span className="faint small"> → {r.project.title} · {programCode(b.project.program)} · {adviserLoad(snap, adviser)} group{adviserLoad(snap, adviser) === 1 ? '' : 's'} advised</span>
              </span>
              {done.includes(r.project.id) ? <Badge tone="ok">Approved</Badge> : <Badge tone={tone}>{what}</Badge>}
            </li>
          )
        })}
      </ul>
      <p className="small muted m-0 mt-2">To return one instead, open its slip. A return needs remarks for the Program Chair.</p>
      <ActionError error={error} />
    </Dialog>
  )
}
