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

/** The student's side: start a group, answer invitations, fill and submit the draft. */
export function GroupDraftCard() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? '—'
  const drafts = (snap.groupDrafts ?? []).filter(d => LIVE.includes(d.status))
  const mine = drafts.find(d => d.members.some(m => m.userId === me.id && m.status === 'Joined'))
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

  return (
    <>
      {invites.map(d => (
        <Section key={d.id} title="Group invitation" tone="accent">
          <p className="m-0">
            <strong>{nameOf(d.createdBy)}</strong> invited you to their group.
          </p>
          <p className="small muted m-0 mt-half">
            Members: {d.members.map(m => `${nameOf(m.userId)}${m.status === 'Invited' ? ' (invited)' : ''}`).join(', ')}
          </p>
          {mine && <p className="small faint m-0 mt-half">Leave your current group first to accept.</p>}
          <Act>
            <div className="actions mt-2">
              <button className="primary" disabled={busy || Boolean(mine)} onClick={() => run(() => respondToGroupInvite(me, snap, d.id, { accept: true }))}>Accept</button>
              <button disabled={busy} onClick={() => run(() => respondToGroupInvite(me, snap, d.id, { accept: false }))}>Decline</button>
            </div>
          </Act>
        </Section>
      ))}

      {!mine && (
        <Section title="No group yet — create one?">
          <p className="measure m-0">
            Start a group and invite {FLAGS.GROUP_SIZE - 1} classmates from section {me.block || 'your section'}. Once all {FLAGS.GROUP_SIZE} have
            joined, submit it; {instructor} approves it and your project workspace opens.
          </p>
          <Act>
            <div className="actions mt-2">
              <button className="primary" disabled={busy} onClick={() => run(() => createGroupDraft(me, snap))}>
                Create a group
              </button>
            </div>
          </Act>
        </Section>
      )}

      {mine && (() => {
        const open = OPEN.includes(mine.status)
        const joined = mine.members.filter(m => m.status === 'Joined').length
        const ready = joined === FLAGS.GROUP_SIZE && mine.members.length === joined
        return (
          <Section title="Your group"
            aside={<Badge tone={mine.status === 'Returned' ? 'stop' : mine.status === 'Submitted' ? 'warn' : 'neutral'}>
              {mine.status === 'Submitted' ? 'Waiting for approval' : mine.status === 'Returned' ? 'Returned' : `${joined} of ${FLAGS.GROUP_SIZE} joined`}
            </Badge>}>
            {mine.status === 'Returned' && (
              <p className="note small" role="note">Returned by {nameOf(mine.decidedBy)}: {mine.remarks}</p>
            )}
            {mine.status === 'Submitted' && (
              <p className="small muted m-0">Submitted {fmtDate(mine.submittedAt)}. {instructor} approves it or returns it with remarks; you’ll get an email either way.</p>
            )}
            <ul className="plain-list mt-1">
              {mine.members.map(m => (
                <li key={m.userId} className="inline small">
                  <strong>{nameOf(m.userId)}</strong>
                  <span className="faint">{m.status === 'Joined' ? (m.userId === mine.createdBy ? 'started the group' : 'joined') : 'invited — waiting for an answer'}</span>
                  {open && m.status === 'Invited' && <Act>
                    <button className="quiet small" disabled={busy} onClick={() => run(() => leaveGroupDraft(me, snap, mine.id, m.userId))}>Withdraw</button>
                  </Act>}
                </li>
              ))}
            </ul>
            {open && <Act>
              {mine.members.length < FLAGS.GROUP_SIZE && (
                <ClassmateSearch classmates={classmates} block={me.block} busy={busy}
                  onInvite={(id) => run(() => inviteToGroupDraft(me, snap, mine.id, id))} />
              )}
              <div className="actions mt-2">
                <button className="primary" disabled={busy || !ready} onClick={() => run(() => submitGroupDraft(me, snap, mine.id))}>
                  Submit to {instructor}
                </button>
                <button className="quiet" disabled={busy} onClick={() => run(() => leaveGroupDraft(me, snap, mine.id))}>Leave group</button>
              </div>
              {!ready && <p className="faint small mt-1">You can submit once all {FLAGS.GROUP_SIZE} members have joined.</p>}
            </Act>}
          </Section>
        )
      })()}
      <ActionError error={error} />
    </>
  )
}

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
