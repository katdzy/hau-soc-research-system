// Service-level checks against the local adapter: the write path (guard →
// all-or-nothing write → audit → history → notification/outbox).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import {
  submitDocument, unassignRole, decideWeeklyLog, flagOverdueRevisions, registerAccount, verifyEmail,
  setAccountStatus, runGate, recordVerdict,
} from '../services/actions.js'
import { canView } from '../domain/guard.js'
import { DOC_TYPES, DOC_STATUS, PROJECT_ROLES as P, GLOBAL_ROLES as G } from '../domain/constants.js'
import { stageByKey } from '../domain/stages.js'

const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }

// These tests replace the whole store. Refuse to run anywhere but in memory.
beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('write path', () => {
  it('T13 — a re-upload creates vN+1 and supersedes the old version; nothing is overwritten', async () => {
    const me = as('s_kilo')
    const before = snap().documents.find(d => d.id === 'd_g1_topic')
    const topics = ['A', 'B', 'C', 'D', 'E'].map(x => `Topic ${x}`)
    const v2 = await submitDocument(me, null, 'p_g1', { docType: DOC_TYPES.TOPIC_PROPOSAL, topics, fileName: 't.pdf' })
    expect(v2.versionNumber).toBe(2)
    expect(v2.supersedes).toBe('d_g1_topic')
    const old = snap().documents.find(d => d.id === 'd_g1_topic')
    expect(old.status).toBe(DOC_STATUS.SUPERSEDED)
    expect({ ...old, status: before.status, updatedAt: undefined }).toEqual({ ...before, updatedAt: undefined })
    // Another group's student cannot upload here.
    await expect(submitDocument(as('s_november'), null, 'p_g1', { docType: DOC_TYPES.TOPIC_PROPOSAL, title: 'x' })).rejects.toThrow(/not available/)
  })

  it('T16 — PC removes Charlie from the G1 panel: G1 leaves Charlie’s view and the audit records it', async () => {
    await load(scenarioStore('T16'))
    const row = snap().projectAssignments.find(a => a.projectId === 'p_g1' && a.userId === 'f_charlie')
    await unassignRole(as('f_alpha'), null, 'p_g1', row)
    expect(canView(user('f_charlie'), bundle(snap(), 'p_g1'))).toBe(false)
    const entry = snap().auditLogs.find(l => l.action === 'ROLE_UNASSIGNED')
    expect(entry).toMatchObject({ actorId: 'f_alpha', hat: G.COORDINATOR, projectId: 'p_g1', before: { userId: 'f_charlie', roleType: P.PANEL_MEMBER }, after: null })
    // The System Administrator cannot do it (permission overrides only).
    await load(scenarioStore('T16'))
    await expect(unassignRole(as('a_sierra'), null, 'p_g1', row)).rejects.toThrow()
  })

  it('T17 — a double-clicked approval records once', async () => {
    await load(scenarioStore('T17'))
    const log = snap().weeklyLogs.find(l => l.projectId === 'p_g1' && l.status === 'Submitted')
    const me = as('f_alpha')
    const results = await Promise.allSettled([
      decideWeeklyLog(me, null, 'p_g1', log.id, { approve: true }),
      decideWeeklyLog(me, null, 'p_g1', log.id, { approve: true }),
    ])
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1)
    expect(snap().auditLogs.filter(l => l.action === 'WEEKLY_LOG_SIGNED').length).toBe(1)
    expect(snap().weeklyLogs.find(l => l.id === log.id).status).toBe('Approved')
  })

  it('T18 — an expired countdown is flagged overdue once, with notification and outbox email', async () => {
    await load(scenarioStore('T18'))
    expect(await flagOverdueRevisions()).toBe(1)
    expect(await flagOverdueRevisions()).toBe(0)
    const d = snap().defenses.find(x => x.projectId === 'p_g3' && x.type === 'Final')
    expect(d.revisionStatus).toBe('Overdue')
    const g3 = snap().projectMembers.filter(m => m.projectId === 'p_g3').map(m => m.userId)
    expect(g3).toEqual(expect.arrayContaining(['s_quebec', 's_romeo']))
    expect(snap().outbox.filter(m => m.event === 'Overdue Revision').flatMap(m => m.userIds).sort())
      .toEqual(['f_delta', ...g3].sort())
    expect(snap().outbox.some(m => m.event === 'Overdue Revision')).toBe(true)
  })

  it('T21 — a stage change writes audit (actor, hat, before → after) and workflow history', async () => {
    const me = as('f_bravo')
    await runGate(me, null, 'p_g4', { action: 'ENDORSE_ROSTER' })
    const a = snap().auditLogs.find(l => l.action === 'STAGE_ENDORSE_ROSTER')
    expect(a).toMatchObject({ actorId: 'f_bravo', hat: P.INSTRUCTOR_1, before: { stage: 'GROUP_FORMATION' }, after: { stage: 'ADVISER_ASSIGNMENT' } })
    expect(snap().workflowHistory.some(h => h.projectId === 'p_g4' && h.toStage === 'ADVISER_ASSIGNMENT' && h.hat === P.INSTRUCTOR_1)).toBe(true)
    expect(snap().outbox.some(m => m.projectId === 'p_g4')).toBe(true)
  })

  it('a verdict writes a history entry and rolls back completely if it fails midway', async () => {
    const me = as('f_alpha')
    const before = JSON.stringify(snap().defenses)
    await expect(recordVerdict(me, null, 'p_g2', { verdict: 'Not a verdict' })).rejects.toThrow()
    expect(JSON.stringify(snap().defenses)).toBe(before)
    await recordVerdict(me, null, 'p_g2', { verdict: 'Passed with Minor Revisions', remarks: 'Tighten the scope.' })
    expect(snap().projects.find(p => p.id === 'p_g2').currentStage).toBe('PROPOSAL_REVISION')
  })
})

describe('guard cannot be bypassed', () => {
  it('rejects a call made as someone other than the signed-in user', async () => {
    setSessionUserId('s_kilo')
    await expect(recordVerdict(user('f_alpha'), null, 'p_g2', { verdict: 'Passed with Minor Revisions' }))
      .rejects.toThrow(/signed-in account/)
  })

  it('ignores a doctored user object and snapshot', async () => {
    as('s_kilo')
    const forged = { ...user('s_kilo'), globalRoles: ['Dean', 'System Administrator'] }
    const fakeSnap = { ...snap(), projectAssignments: [{ projectId: 'p_g2', userId: 's_kilo', roleType: P.PANEL_CHAIR }] }
    await expect(recordVerdict(forged, fakeSnap, 'p_g2', { verdict: 'Re-defense' })).rejects.toThrow(/not available/)
  })

  it('refuses a gate from another stage even with a forged gate object', async () => {
    const me = as('f_bravo')
    const gate = { ...stageByKey('ADVISER_APPROVAL').gates[0], capability: 'roster.endorse', requires: () => null }
    await expect(runGate(me, null, 'p_g4', gate)).rejects.toThrow()
  })

  it('notifications are email only: no in-app notification is stored', async () => {
    await runGate(as('f_bravo'), null, 'p_g4', { action: 'ENDORSE_ROSTER' })
    expect(snap().outbox.some(m => m.projectId === 'p_g4')).toBe(true)
    expect(snap().notifications).toBeUndefined()
  })
})

describe('accounts (S0, flags ACCOUNT_ACTIVATION + FACULTY_BASE_IDENTITY)', () => {
  it('register → verify email → admin activates', async () => {
    const u = await registerAccount(null, { name: 'New Faculty', email: '  New.Faculty@HAU.edu.ph ' })
    expect(u).toMatchObject({ email: 'new.faculty@hau.edu.ph', status: 'Inactive', emailVerified: false, globalRoles: [] })
    const mail = snap().outbox.find(m => m.event === 'Account verification')
    expect(mail.to).toEqual(['new.faculty@hau.edu.ph'])

    const admin = as('a_sierra')
    await expect(setAccountStatus(admin, null, u.id, 'Active')).rejects.toThrow(/not verified/)
    await verifyEmail(mail.link.token)
    let now = user(u.id)
    expect(now).toMatchObject({ emailVerified: true, status: 'Inactive', globalRoles: [G.FACULTY] })
    await expect(verifyEmail(mail.link.token)).rejects.toThrow(/invalid/)

    await setAccountStatus(admin, null, u.id, 'Active')
    now = user(u.id)
    expect(now.status).toBe('Active')
    expect(snap().auditLogs.find(l => l.action === 'ACCOUNT_STATUS_CHANGED')).toMatchObject({ before: { status: 'Inactive' }, after: { status: 'Active' }, hat: G.ADMIN })
  })

  it('rejects look-alike domains and duplicates', async () => {
    for (const email of ['x@gmail.com', 'x@hau.edu.ph.evil.com', 'x@evilhau.edu.ph', 'x@fake.student.hau.edu.ph']) {
      await expect(registerAccount(null, { name: 'X', email })).rejects.toThrow(/restricted/)
    }
    await expect(registerAccount(null, { name: 'X', email: 'KILO@student.hau.edu.ph' })).rejects.toThrow(/already/)
  })

  it('a student registration verifies to the Student role', async () => {
    const u = await registerAccount(null, { name: 'New Student', email: 'new@student.hau.edu.ph', block: 'WD-401' })
    await verifyEmail(snap().outbox.find(m => m.to?.[0] === 'new@student.hau.edu.ph').link.token)
    expect(user(u.id).globalRoles).toEqual([G.STUDENT])
  })
})

describe('adviser approval (NEW-7, flag ADVISER_APPROVAL = both)', () => {
  it('needs the Dean and the Associate Dean, in either order', async () => {
    await load(scenarioStore('T9'))
    await runGate(as('f_echo'), null, 'p_g1', { action: 'APPROVE_ADVISER' })
    expect(snap().projects.find(p => p.id === 'p_g1').currentStage).toBe('ADVISER_APPROVAL')
    await expect(runGate(as('f_echo'), null, 'p_g1', { action: 'APPROVE_ADVISER' })).rejects.toThrow(/already|approved/i)
    await runGate(as('f_delta'), null, 'p_g1', { action: 'APPROVE_ADVISER' })
    expect(snap().projects.find(p => p.id === 'p_g1').currentStage).toBe('TOPIC_PROPOSAL')
  })
})
