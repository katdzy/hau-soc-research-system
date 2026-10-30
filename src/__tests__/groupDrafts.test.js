// Students draft their own groups; Instructor 1 approves them (revision
// 2026-10-30, flag STUDENT_GROUP_DRAFTS, replacing Decision 17).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { setSessionUserId } from '../state/session.js'
import {
  registerAccount, verifyEmail, createGroupDraft, inviteToGroupDraft, respondToGroupInvite,
  leaveGroupDraft, submitGroupDraft, decideGroupDraft, createProject,
} from '../services/actions.js'
import { canView } from '../domain/guard.js'
import { bundle } from '../services/core.js'
import { FLAGS } from '../domain/flags.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const draft = (id) => snap().groupDrafts.find(d => d.id === id)
const mails = (event) => snap().outbox.filter(m => m.event === event)

/** A verified, active student in WD-401 with no group. */
async function newStudent(name) {
  const email = `${name.toLowerCase()}@student.hau.edu.ph`
  const u = await registerAccount(null, { name, email, block: 'WD-401' })
  await verifyEmail(snap().outbox.find(m => m.to?.[0] === email).link.token)
  return u.id
}

let S // four free WD-401 students: Whiskey (seed) and three new ones

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => {
  await load(buildSeed())
  S = ['s_whiskey', await newStudent('Alfa'), await newStudent('Bravia'), await newStudent('Cielo')]
})

async function fullDraft() {
  const d = await createGroupDraft(as(S[0]), null)
  for (const id of S.slice(1)) await inviteToGroupDraft(as(S[0]), null, d.id, id)
  for (const id of S.slice(1)) await respondToGroupInvite(as(id), null, d.id, { accept: true })
  return d
}

describe('drafting', () => {
  it('a student with no group starts one; invitees accept or decline; a full group submits', async () => {
    const d = await createGroupDraft(as(S[0]), null, {})
    expect(draft(d.id)).toMatchObject({ block: 'WD-401', status: 'Draft', members: [{ userId: S[0], status: 'Joined' }] })
    await expect(createGroupDraft(as(S[0]), null, {})).rejects.toThrow(/another group draft/)

    await inviteToGroupDraft(as(S[0]), null, d.id, S[1])
    expect(mails('Invited to a group').at(-1).userIds).toEqual([S[1]])
    await respondToGroupInvite(as(S[1]), null, d.id, { accept: false })
    expect(draft(d.id).members.map(m => m.userId)).toEqual([S[0]])

    for (const id of S.slice(1)) await inviteToGroupDraft(as(S[0]), null, d.id, id)
    await expect(submitGroupDraft(as(S[0]), null, d.id)).rejects.toThrow(/accepted/)
    for (const id of S.slice(1)) await respondToGroupInvite(as(id), null, d.id, { accept: true })
    await submitGroupDraft(as(S[2]), null, d.id)
    expect(draft(d.id).status).toBe('Submitted')
    expect(mails('Group submitted for approval').at(-1).userIds).toEqual(['f_bravo']) // WD-401's Instructor 1
    await expect(leaveGroupDraft(as(S[1]), null, d.id)).rejects.toThrow(/submitted/)
  })

  it('only classmates from the same section, free, up to the group size', async () => {
    const d = await createGroupDraft(as(S[0]), null, {})
    await expect(inviteToGroupDraft(as(S[0]), null, d.id, 's_kilo')).rejects.toThrow(/already in a project group/)
    await expect(inviteToGroupDraft(as(S[0]), null, d.id, 'f_bravo')).rejects.toThrow(/student/)
    await expect(inviteToGroupDraft(as(S[1]), null, d.id, S[2])).rejects.toThrow(/Only members/)
    for (const id of S.slice(1)) await inviteToGroupDraft(as(S[0]), null, d.id, id)
    const fifth = await newStudent('Delta')
    await expect(inviteToGroupDraft(as(S[0]), null, d.id, fifth)).rejects.toThrow(new RegExp(`holds ${FLAGS.GROUP_SIZE}`))
    // A member can withdraw an invitation, not remove someone who joined.
    await leaveGroupDraft(as(S[0]), null, d.id, S[3])
    expect(draft(d.id).members).toHaveLength(3)
  })

  it('a student joined elsewhere cannot accept a second invitation; the last to leave closes the draft', async () => {
    const a = await createGroupDraft(as(S[0]), null, {})
    await inviteToGroupDraft(as(S[0]), null, a.id, S[1]) // invited, not yet joined: still free
    const b = await createGroupDraft(as(S[1]), null, {})
    await expect(inviteToGroupDraft(as(S[0]), null, a.id, S[1])).rejects.toThrow(/already in this group/)
    await expect(respondToGroupInvite(as(S[1]), null, a.id, { accept: true })).rejects.toThrow(/another group draft/)
    await leaveGroupDraft(as(S[1]), null, b.id)
    expect(draft(b.id).status).toBe('Cancelled')
    await respondToGroupInvite(as(S[1]), null, a.id, { accept: true })
    expect(draft(a.id).members.find(m => m.userId === S[1]).status).toBe('Joined')
  })

  it('faculty cannot draft groups', async () => {
    await expect(createGroupDraft(as('f_alpha'), null, {})).rejects.toThrow()
  })
})

describe('Instructor 1 decides', () => {
  it('approve: the draft becomes the group at Group Formation, with its Instructor 1 and members', async () => {
    const d = await fullDraft()
    await submitGroupDraft(as(S[0]), null, d.id)
    await expect(decideGroupDraft(as('f_foxtrot'), null, d.id, { approve: true })).rejects.toThrow() // no Capstone 1 section
    await expect(decideGroupDraft(as(S[0]), null, d.id, { approve: true })).rejects.toThrow()
    const project = await decideGroupDraft(as('f_bravo'), null, d.id, { approve: true })
    const b = bundle(snap(), project.id)
    expect(b.project).toMatchObject({ title: 'Untitled — WD-401', block: 'WD-401', currentStage: 'GROUP_FORMATION' })
    expect(b.members.map(m => m.userId).sort()).toEqual([...S].sort())
    expect(b.assignments).toEqual([expect.objectContaining({ userId: 'f_bravo', roleType: 'Instructor 1' })])
    expect(draft(d.id)).toMatchObject({ status: 'Approved', projectId: project.id })
    for (const id of S) expect(canView(user(id), b)).toBe(true)
    expect(mails('Group approved').at(-1).userIds.sort()).toEqual([...S].sort())
    // They are in a group now: no new draft.
    await expect(createGroupDraft(as(S[0]), null, {})).rejects.toThrow(/project group/)
  })

  it('return: remarks required; the group edits and submits again', async () => {
    const d = await fullDraft()
    await submitGroupDraft(as(S[0]), null, d.id)
    await expect(decideGroupDraft(as('f_bravo'), null, d.id, { approve: false })).rejects.toThrow(/why/)
    await decideGroupDraft(as('f_bravo'), null, d.id, { approve: false, remarks: 'Balance the skills across the group.' })
    expect(draft(d.id)).toMatchObject({ status: 'Returned', remarks: 'Balance the skills across the group.' })
    await leaveGroupDraft(as(S[3]), null, d.id)
    const other = await newStudent('Echo')
    await inviteToGroupDraft(as(S[0]), null, d.id, other)
    await respondToGroupInvite(as(other), null, d.id, { accept: true })
    await submitGroupDraft(as(S[0]), null, d.id)
    expect(draft(d.id).status).toBe('Submitted')
  })

  it('Instructor 1 can still create a group directly', async () => {
    const p = await createProject(as('f_bravo'), null, { title: 'Made by I1', sectionId: 'sec_wd401' })
    expect(p.currentStage).toBe('GROUP_FORMATION')
  })
})
