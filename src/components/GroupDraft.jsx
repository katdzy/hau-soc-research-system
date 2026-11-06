// Group drafts (revision 2026-10-30, flag STUDENT_GROUP_DRAFTS): a student with
// no group starts one from the dashboard and invites classmates; a full group
// submits it; the section's Instructor 1 approves or returns it.

import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import {
  createGroupDraft, inviteToGroupDraft, respondToGroupInvite, leaveGroupDraft, submitGroupDraft, decideGroupDraft,
} from '../services/api.js'
import { useAction, ActionError } from './useAction.jsx'
import { Section, Badge, Field, fmtDate } from './ui.jsx'
import { Act } from './ViewOnly.jsx'
import { ACCOUNT_STATUS, COURSES, accountType } from '../domain/constants.js'
import { FLAGS } from '../domain/flags.js'

const LIVE = ['Draft', 'Returned', 'Submitted']
const OPEN = ['Draft', 'Returned']

/** The live draft the student has joined, if any. */
export function myGroupDraft(snap, me) {
  return (snap.groupDrafts ?? []).find(d => LIVE.includes(d.status) &&
    d.members.some(m => m.userId === me.id && m.status === 'Joined')) ?? null
}

const initials = (name) => (name ?? '?').replace(/^(Prof|Dr|Engr)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  .map(w => w[0]).slice(0, 2).join('').toUpperCase()

const listNames = (names) => names.length < 2 ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** The student's side: start a group, answer invitations, fill and submit the draft. */
export function GroupDraftCard() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const drafts = (snap.groupDrafts ?? []).filter(d => LIVE.includes(d.status))
  const mine = myGroupDraft(snap, me)
  const invites = drafts.filter(d => OPEN.includes(d.status) && d.members.some(m => m.userId === me.id && m.status === 'Invited'))
  const section = (snap.sections ?? []).find(s => s.block === me.block && s.course === COURSES.C1)
  const instructor = section ? nameOf(section.instructorId) : 'your Instructor 1'

  // Classmates who can still be invited: same section, active, in no group and no other draft.
  const inGroup = new Set((snap.projectMembers ?? []).map(m => m.userId))
  const joinedSomewhere = new Set(drafts.flatMap(d => d.members.filter(m => m.status === 'Joined').map(m => m.userId)))
  const classmates = users.filter(u => accountType(u.email) === 'Student' && u.block === me.block && u.id !== me.id &&
    u.status === ACCOUNT_STATUS.ACTIVE && !inGroup.has(u.id) && !joinedSomewhere.has(u.id) &&
    !mine?.members.some(m => m.userId === u.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const size = FLAGS.GROUP_SIZE
  const joined = mine ? mine.members.filter(m => m.status === 'Joined') : []
  const pending = mine ? mine.members.filter(m => m.status === 'Invited') : []
  const openSeats = mine ? Math.max(0, size - mine.members.length) : 0
  const ready = Boolean(mine) && joined.length === size && pending.length === 0
  const editable = Boolean(mine) && OPEN.includes(mine.status)
  // Where the group is in the four steps: forming → submit → approval → workspace.
  const step = !mine ? 0 : mine.status === 'Submitted' ? 2 : ready ? 1 : 0

  const blocker = () => {
    const parts = []
    if (openSeats) parts.push(`Invite ${openSeats} more classmate${openSeats === 1 ? '' : 's'}`)
    if (pending.length) parts.push(`${parts.length ? 'waiting' : 'Waiting'} for ${listNames(pending.map(m => nameOf(m.userId)))} to accept`)
    return `${parts.join('; ')}.`
  }

  const steps = (
    <aside className="draft-steps" aria-labelledby="draft-steps-h">
      <h3 id="draft-steps-h" className="draft-steps-h">How your group gets approved</h3>
      <ol className="trail">
        {[
          { name: 'Form a group of ' + size, meta: `You and ${size - 1} classmates from ${me.block || 'your section'} join.` },
          { name: 'Submit it', meta: `Any member sends it to ${instructor}.` },
          { name: `${instructor} approves`, meta: 'Or returns it with remarks for you to fix.' },
          { name: 'Your workspace opens', meta: 'Stage, adviser and deadlines appear on this dashboard.' },
        ].map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'now' : 'later'
          return (
            <li key={s.name} className={`trail-step is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="trail-mark" aria-hidden="true">
                {state === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <div>
                <div className="trail-name">{s.name}</div>
                <div className="trail-meta">{s.meta}</div>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="draft-steps-foot">
        {instructor === 'your Instructor 1' ? 'Your Instructor 1' : instructor} can also place you in a group directly.
        Each step is emailed to <span className="nowrap">{me.email}</span>.
      </p>
    </aside>
  )

  return (
    <>
      {invites.map(d => {
        const going = d.members.filter(m => m.status === 'Joined').length
        return (
          <Section key={d.id} title={`${nameOf(d.createdBy)} invited you to their group`} tone="accent"
            aside={<Badge>{going} of {size} joined</Badge>}>
            <p className="small muted m-0">
              Members so far: {listNames(d.members.filter(m => m.userId !== me.id).map(m => `${nameOf(m.userId)}${m.status === 'Invited' ? ' (invited)' : ''}`))}
            </p>
            {mine && <p className="small faint m-0 mt-half">Leave your current group first to accept.</p>}
            <Act>
              <div className="actions mt-2">
                <button className="primary" disabled={busy || Boolean(mine)} onClick={() => run(() => respondToGroupInvite(me, snap, d.id, { accept: true }))}>Join this group</button>
                <button disabled={busy} onClick={() => run(() => respondToGroupInvite(me, snap, d.id, { accept: false }))}>Decline</button>
              </div>
            </Act>
          </Section>
        )
      })}

      {!mine && (
        <Section className="draft">
          <div className="draft-grid">
            <div className="draft-main">
              <h2>No group yet — create one?</h2>
              <p className="measure mt-1 mb-0">
                Create a group, then invite {size - 1} classmates from {me.block || 'your section'} to join it.
                {invites.length > 0 && ' Or accept an invitation above.'}
              </p>
              <Act>
                <div className="actions mt-3">
                  <button className="primary" disabled={busy} onClick={() => run(() => createGroupDraft(me, snap))}>
                    Create a group
                  </button>
                </div>
              </Act>
            </div>
            {steps}
          </div>
        </Section>
      )}

      {mine && (
        <Section className="draft">
          <div className="draft-grid">
            <div className="draft-main">
              <div className="section-head">
                <h2>Your group</h2>
                <Badge tone={mine.status === 'Returned' ? 'stop' : mine.status === 'Submitted' ? 'warn' : ready ? 'ok' : 'neutral'}>
                  {mine.status === 'Submitted' ? 'Waiting for approval'
                    : mine.status === 'Returned' ? 'Returned'
                      : `${joined.length} of ${size} joined`}
                </Badge>
              </div>
              {mine.status === 'Returned' && (
                <p className="note small m-0 mb-2" role="note">
                  <strong>Returned by {nameOf(mine.decidedBy)}:</strong> {mine.remarks}
                </p>
              )}

              <ul className="seats" aria-label={`Members, ${joined.length} of ${size} joined`}>
                {mine.members.map(m => {
                  const isJoined = m.status === 'Joined'
                  const you = m.userId === me.id
                  return (
                    <li key={m.userId} className={`seat ${isJoined ? 'is-joined' : 'is-invited'}`}>
                      <span className="seat-mark" aria-hidden="true">{initials(nameOf(m.userId))}</span>
                      <span className="seat-who">
                        <span className="seat-name">{nameOf(m.userId)}{you && <span className="faint"> (you)</span>}</span>
                        <span className="seat-state">
                          {isJoined ? (m.userId === mine.createdBy ? 'Joined · started the group' : 'Joined') : 'Invited · no answer yet'}
                        </span>
                      </span>
                      {editable && !isJoined && <Act>
                        <button className="quiet small" disabled={busy} aria-label={`Withdraw the invitation to ${nameOf(m.userId)}`}
                          onClick={() => run(() => leaveGroupDraft(me, snap, mine.id, m.userId))}>Withdraw</button>
                      </Act>}
                    </li>
                  )
                })}
                {Array.from({ length: openSeats }, (_, i) => (
                  <li key={`open-${i}`} className="seat is-open">
                    <span className="seat-mark" aria-hidden="true"><PlusIcon /></span>
                    <span className="seat-who">
                      <span className="seat-name">Open seat</span>
                      <span className="seat-state">{editable ? 'Invite a classmate below' : 'Empty'}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {editable && openSeats > 0 && <Act>
                <ClassmateSearch classmates={classmates} block={me.block} busy={busy}
                  onInvite={(id) => run(() => inviteToGroupDraft(me, snap, mine.id, id))} />
              </Act>}

              {mine.status === 'Submitted' && (
                <p className="draft-status m-0">
                  Submitted {fmtDate(mine.submittedAt)}{mine.submittedBy ? ` by ${mine.submittedBy === me.id ? 'you' : nameOf(mine.submittedBy)}` : ''}.
                  {' '}{instructor} approves it or returns it with remarks; you’ll get an email either way.
                </p>
              )}

              {editable && <Act>
                <div className="draft-foot">
                  <div className="draft-submit">
                    <button className={ready ? 'primary' : undefined} disabled={busy || !ready} aria-describedby="draft-why"
                      onClick={() => run(() => submitGroupDraft(me, snap, mine.id))}>
                      {mine.status === 'Returned' ? 'Resubmit' : 'Submit'} to {instructor}
                    </button>
                    <span id="draft-why" className={`small ${ready ? 'ok-text' : 'muted'}`}>
                      {!ready ? blocker()
                        : mine.status === 'Returned' ? 'Make the changes the remarks ask for, then resubmit.'
                          : 'Everyone has joined. You can submit.'}
                    </span>
                  </div>
                  <LeaveGroup busy={busy} last={joined.length === 1}
                    onLeave={() => run(() => leaveGroupDraft(me, snap, mine.id))} />
                </div>
              </Act>}
            </div>
            {steps}
          </div>
        </Section>
      )}
      <ActionError error={error} />
    </>
  )
}

/** Leaving asks once: the last member to leave closes the group. */
function LeaveGroup({ busy, last, onLeave }) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button className="quiet" disabled={busy} onClick={() => setAsking(true)}>Leave group</button>
  return (
    <div className="leave-confirm" role="group" aria-label="Confirm leaving the group">
      <span className="small">{last ? 'You’re the only member, so the group closes and invitations are withdrawn.' : 'Leave this group?'}</span>
      <button className="small danger" disabled={busy} onClick={() => { setAsking(false); onLeave() }}>Leave</button>
      <button className="small quiet" disabled={busy} onClick={() => setAsking(false)}>Stay</button>
    </div>
  )
}

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

/**
 * Find a classmate by name or ID number and invite them. Results show only
 * once something is typed, so a long section roster never fills the card.
 */
function ClassmateSearch({ classmates, block, busy, onInvite }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hits = q ? classmates.filter(u => [u.name, u.idNumber, u.email].some(v => v?.toLowerCase().includes(q))) : []
  const shown = hits.slice(0, 8)
  return (
    <div className="mt-2 classmate-search">
      <Field label="Invite a classmate" hint={classmates.length
        ? `Search the ${classmates.length} student${classmates.length === 1 ? '' : 's'} in ${block} who are not in a group yet, by name or ID number.`
        : `No one else in ${block} is free right now.`}>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} disabled={!classmates.length}
          placeholder="Type a name or ID number" aria-controls="classmate-results" autoComplete="off" />
      </Field>
      {q && (
        <ul className="classmate-results" id="classmate-results" aria-live="polite">
          {shown.length === 0 && <li className="small faint">No free classmate matches “{query.trim()}”.</li>}
          {shown.map(u => (
            <li key={u.id}>
              <span><strong className="small">{u.name}</strong>{u.idNumber && <span className="faint small mono"> · {u.idNumber}</span>}</span>
              <button className="small" disabled={busy} onClick={() => { onInvite(u.id); setQuery('') }}>Invite</button>
            </li>
          ))}
          {hits.length > shown.length && <li className="small faint">{hits.length - shown.length} more — keep typing to narrow it down.</li>}
        </ul>
      )}
    </div>
  )
}

/** Instructor 1: the groups students drafted in one section — approve or return the submitted ones. */
export function GroupDraftReview({ section }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [remarks, setRemarks] = useState({})
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const drafts = (snap.groupDrafts ?? []).filter(d => d.sectionId === section.id && LIVE.includes(d.status))
  const submitted = drafts.filter(d => d.status === 'Submitted')
  const forming = drafts.length - submitted.length
  if (!drafts.length) return null

  return (
    <div className="mt-2">
      <h3 className="label group-sub">Groups drafted by students</h3>
      {submitted.length === 0 && <p className="small faint m-0">{forming} group{forming === 1 ? ' is' : 's are'} still forming; none submitted yet.</p>}
      {submitted.map(d => (
        <div className="entry" key={d.id}>
          <div className="entry-head">
            <strong className="text-sm">Group started by {nameOf(d.createdBy)}</strong>
            <Badge tone="warn">Waiting for you</Badge>
          </div>
          <div className="small muted">{d.members.map(m => nameOf(m.userId)).join(', ')}</div>
          <div className="faint small">Submitted {fmtDate(d.submittedAt)} by {nameOf(d.submittedBy)}</div>
          <Act>
            <div className="subform">
              <Field label="Remarks (required to return)">
                <input value={remarks[d.id] ?? ''} onChange={e => setRemarks(r => ({ ...r, [d.id]: e.target.value }))} />
              </Field>
              <div className="actions">
                <button className="primary" disabled={busy} onClick={() => run(() => decideGroupDraft(me, snap, d.id, { approve: true, remarks: remarks[d.id] }))}>
                  Approve group
                </button>
                <button disabled={busy || !remarks[d.id]?.trim()} onClick={() => run(() => decideGroupDraft(me, snap, d.id, { approve: false, remarks: remarks[d.id] }))}>
                  Return with remarks
                </button>
              </div>
            </div>
          </Act>
        </div>
      ))}
      {submitted.length > 0 && forming > 0 && <p className="small faint mt-1">{forming} more still forming.</p>}
      <ActionError error={error} />
    </div>
  )
}
