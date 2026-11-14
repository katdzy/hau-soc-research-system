import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { runGate } from '../../services/api.js'
import { stageByKey } from '../../domain/stages.js'
import { FLAGS } from '../../domain/flags.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from '../../domain/constants.js'
import { programShort } from '../ui.jsx'
import { useAction, ActionError } from '../useAction.jsx'
import Dialog from '../Dialog.jsx'

const STEPS = ['Review group details', 'Confirm and forward']
const gateOf = (b) => stageByKey(b.project.currentStage)?.gates.find(g => g.action === 'ENDORSE_ROSTER')

/**
 * Forwarding groups to the Program Chair (Group Formation →
 * Adviser Assignment; Figma S-22 "Send groups to Program Chair"), in two
 * steps like the other approvals (M-20/M-21): first check what the Program
 * Chair will receive — members, student numbers, section, program, term —
 * then confirm the route. `groups` are project bundles at Group Formation;
 * with several, each can be left out.
 */
export default function ForwardRosterDialog({ groups, onClose, onDone }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState(() => new Set(groups.filter(b => !gateOf(b)?.requires(b, me)).map(b => b.project.id)))
  const [checked, setChecked] = useState(false)
  const [sent, setSent] = useState([])

  const users = snap.users ?? []
  const userOf = (id) => users.find(u => u.id === id)
  const chairsFor = (program) => users.filter(u => (u.globalRoles ?? []).includes(G.COORDINATOR) &&
    (u.programScope ?? []).includes(program))
  const chosen = groups.filter(b => picked.has(b.project.id))
  const programs = [...new Set(chosen.map(b => b.project.program))]
  const chairs = programs.flatMap(chairsFor)
  const chairNames = chairs.map(u => u.name).join(', ')
  const plural = chosen.length === 1 ? 'group' : 'groups'

  const toggle = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function forward() {
    run(async () => {
      const done = []
      for (const b of chosen) {
        if (sent.includes(b.project.id)) continue
        await runGate(me, snap, b.project.id, { ...gateOf(b) })
        done.push(b.project.id)
        setSent(s => [...s, b.project.id])
      }
      onDone?.(done)
      onClose()
    })
  }

  const footer = step === 0
    ? <>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={!chosen.length || !checked} onClick={() => setStep(1)}>
          Next: Confirm and forward →
        </button>
      </>
    : <>
        <button type="button" onClick={() => setStep(0)} disabled={busy}>Back</button>
        <button type="button" className="primary" disabled={busy || !chosen.length} onClick={forward}>
          {busy ? 'Forwarding…' : `Forward ${chosen.length} ${plural} to the Program Chair`}
        </button>
      </>

  return (
    <Dialog
      wide
      title={groups.length === 1 ? `Forward to the Program Chair — ${groups[0].project.title}` : 'Send groups to the Program Chair'}
      sub={step === 0
        ? 'Check what the Program Chair will receive. The roster locks once it is forwarded.'
        : 'Confirm the route. The Program Chair then assigns an adviser.'}
      steps={STEPS} step={step} footer={footer} onClose={busy ? undefined : onClose}
    >
      {step === 0 && (
        <>
          <div className="fwd-groups">
            {groups.map(b => {
              const gate = gateOf(b)
              const blocker = gate?.requires(b, me)
              const members = b.members.map(m => userOf(m.userId)).filter(Boolean)
              const noId = members.filter(u => !u.idNumber)
              const otherBlock = members.filter(u => u.block && u.block !== b.project.block)
              const i1 = b.assignments.filter(a => a.roleType === P.INSTRUCTOR_1).map(a => userOf(a.userId)?.name).filter(Boolean)
              const chair = chairsFor(b.project.program)
              const checks = [
                members.length >= FLAGS.GROUP_SIZE
                  ? ['pass', `${members.length} of ${FLAGS.GROUP_SIZE} members`]
                  : ['warn', `${members.length} of ${FLAGS.GROUP_SIZE} members — the group is short`],
                noId.length
                  ? ['warn', `No student number on record for ${noId.map(u => u.name).join(', ')}`]
                  : ['pass', 'Every member has a student number'],
                otherBlock.length
                  ? ['fail', `${otherBlock.map(u => u.name).join(', ')} ${otherBlock.length === 1 ? 'is' : 'are'} not in ${b.project.block}`]
                  : ['pass', `Everyone is in section ${b.project.block}`],
                chair.length
                  ? ['pass', `Program Chair: ${chair.map(u => u.name).join(', ')}`]
                  : ['warn', `No Program Chair covers ${programShort(b.project.program)} yet — the System Administrator assigns one`],
              ]
              const on = picked.has(b.project.id)
              return (
                <section key={b.project.id} className={`fwd-group${on ? '' : ' is-off'}`} aria-labelledby={`fwd-${b.project.id}`}>
                  <header className="fwd-head">
                    {groups.length > 1
                      ? <label className="fwd-pick">
                          <input type="checkbox" checked={on} disabled={Boolean(blocker)} onChange={() => toggle(b.project.id)} />
                          <strong id={`fwd-${b.project.id}`}>{b.project.title}</strong>
                        </label>
                      : <strong id={`fwd-${b.project.id}`}>{b.project.title}</strong>}
                    <span className="small faint">{programShort(b.project.program)} · {b.project.block}{b.project.term ? ` · ${b.project.term}` : ''}</span>
                  </header>
                  {blocker && <p className="small error-text m-0">{blocker}</p>}
                  <div className="fwd-body">
                    <table className="fwd-members">
                      <thead><tr><th>Member</th><th>Student number</th><th>Email</th></tr></thead>
                      <tbody>
                        {members.map(u => (
                          <tr key={u.id}>
                            <td>{u.name}</td>
                            <td className="mono">{u.idNumber || <span className="tone-warn">missing</span>}</td>
                            <td className="small muted">{u.email}</td>
                          </tr>
                        ))}
                        {!members.length && <tr><td colSpan="3" className="small faint">No members yet.</td></tr>}
                      </tbody>
                    </table>
                    <div>
                      <dl className="fwd-facts">
                        <dt>Working title</dt><dd>{b.project.title}</dd>
                        <dt>Instructor 1</dt><dd>{i1.join(', ') || '—'}</dd>
                      </dl>
                      <ul className="checks">
                        {checks.map(([tone, text]) => <li key={text} className={`is-${tone} small`}>{text}</li>)}
                      </ul>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
          <label className="fwd-confirm">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <span>I checked the members, student numbers, section and program against my class list.</span>
          </label>
        </>
      )}

      {step === 1 && (
        <div className="fwd-route">
          <div>
            <p className="m-0">
              Forwarding <strong>{chosen.map(b => b.project.title).join(', ')}</strong>.
              Each moves from Group Formation to Adviser Assignment, and you can no longer add or remove members.
            </p>
            {!chairs.length && (
              <p className="note mt-2">
                No Program Chair covers {programs.map(programShort).join(', ')} yet. The {plural} will wait in
                Adviser Assignment until the System Administrator assigns one.
              </p>
            )}
            {sent.length > 0 && <p className="small ok-inline mt-2" role="status">Forwarded {sent.length} so far.</p>}
            <ActionError error={error} />
          </div>
          <div>
            <h3 className="label mt-0">Route after you confirm</h3>
            <ol className="routing">
              <li className="is-done"><strong className="small">Instructor 1 · you</strong><span className="small muted">Forwards the roster</span></li>
              <li className="is-current">
                <strong className="small">Program Chair{chairNames ? ` · ${chairNames}` : ''}</strong>
                <span className="small muted">Assigns an adviser and routes it for approval</span>
              </li>
              <li><strong className="small">Dean and Associate Dean</strong><span className="small muted">Approve the adviser assignment</span></li>
            </ol>
          </div>
        </div>
      )}
    </Dialog>
  )
}
