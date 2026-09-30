// Prompt 1 — System Administrator: accounts, Global Roles, program scope,
// permission overrides (deny-only), global settings, and everything the
// System Administrator must NOT be able to do (T20). Local backend only.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { db } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { applyStage } from '../backend/stageBuilder.js'
import { scenarioStore } from '../dev/scenarios.js'
import { setSessionUserId } from '../state/session.js'
import { bundle } from '../services/core.js'
import { worklist } from '../services/worklist.js'
import {
  registerAccount, verifyEmail, setAccountStatus, setGlobalRoles, setProgramScope,
  revokeCapability, liftOverride, updateRevisionDays, recordVerdict, decideWeeklyLog,
  runGate, signForm, assignRole, addAnnotation, submitReview,
} from '../services/actions.js'
import { canView, canDo, viewBundle, ACTIONS } from '../domain/guard.js'
import { resolveInstitution, can } from '../domain/caac.js'
import { STAGES } from '../domain/stages.js'
import { FLAGS } from '../domain/flags.js'
import { revisionDaysOf } from '../domain/settings.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P, DOC_TYPES, DOC_STATUS } from '../domain/constants.js'

const WD = 'Bachelor of Science Major in Information Technology with area of specialization in Web Development'
const snap = () => db.snapshot()
const user = (id) => snap().users.find(u => u.id === id)
const as = (id) => { setSessionUserId(id); return user(id) }
const load = async (store) => { await db.replaceAll(store); setSessionUserId(null) }
const b = (pid) => bundle(snap(), pid)
const audit = (action) => snap().auditLogs.filter(l => l.action === action)

/** S0.1 → S0.2 → S0.3: register, click the verification link, admin activates. */
async function newActiveAccount(email, name = 'Prof. Quinn Test') {
  const u = await registerAccount(null, { name, email })
  const mail = snap().outbox.find(m => m.event === 'Account verification' && m.to?.[0] === u.email)
  await verifyEmail(mail.link.token)
  await setAccountStatus(as('a_sierra'), null, u.id, 'Active')
  return user(u.id)
}

beforeAll(() => {
  if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
})
beforeEach(async () => { await load(buildSeed()) })

describe('S0.1–S0.2 registration', () => {
  it('normalizes mixed case and surrounding spaces, then verifies a student to Student', async () => {
    const u = await registerAccount(null, { name: 'New Student', email: '  New.Student@Student.HAU.edu.ph ', block: 'WD-401' })
    expect(u.email).toBe('new.student@student.hau.edu.ph')
    const mail = snap().outbox.find(m => m.to?.[0] === u.email)
    expect(mail).toMatchObject({ event: 'Account verification', link: { kind: 'verify' } })
    await verifyEmail(mail.link.token)
    expect(user(u.id)).toMatchObject({ emailVerified: true, status: 'Inactive', globalRoles: [G.STUDENT] })
  })

  it('a faculty address verifies to the Faculty base identity with no global permission (NEW-1)', async () => {
    const u = await newActiveAccount('quinn@hau.edu.ph')
    expect(u.globalRoles).toEqual([G.FACULTY])
    expect([...resolveInstitution(u, snap()).grants.keys()]).toEqual([])
    for (const p of snap().projects) expect(canView(u, b(p.id))).toBe(false)
  })

  it('the same address in another case is a duplicate', async () => {
    await registerAccount(null, { name: 'A', email: 'dup@hau.edu.ph' })
    await expect(registerAccount(null, { name: 'B', email: ' DUP@hau.edu.ph' })).rejects.toThrow(/already/)
  })
})

describe('S0.3 activation and Global Roles', () => {
  it('only the System Administrator activates or grants roles', async () => {
    await expect(setAccountStatus(as('f_alpha'), null, 'f_papa', 'Active')).rejects.toThrow()
    await expect(setGlobalRoles(as('f_delta'), null, 'f_papa', [G.FACULTY, G.DEAN])).rejects.toThrow()
    await setAccountStatus(as('a_sierra'), null, 'f_papa', 'Active')
    expect(user('f_papa').status).toBe('Active')
  })

  it('Dean granted → the adviser-approval queue appears; removed → it disappears', async () => {
    const quinn = await newActiveAccount('quinn@hau.edu.ph')
    const store = applyStage(buildSeed(), 'p_g4', 'ADVISER_APPROVAL', { roles: { [P.INSTRUCTOR_1]: 'f_bravo', [P.ADVISER]: 'f_charlie' } })
    store.users[quinn.id] = user(quinn.id)
    await load(store)
    expect(canView(user(quinn.id), b('p_g4'))).toBe(false)

    await setGlobalRoles(as('a_sierra'), null, quinn.id, [G.FACULTY, G.DEAN])
    expect(audit('GLOBAL_ROLES_CHANGED').at(-1)).toMatchObject({
      actorId: 'a_sierra', hat: G.ADMIN, before: { globalRoles: [G.FACULTY] }, after: { globalRoles: [G.FACULTY, G.DEAN] },
    })
    const row = worklist(snap(), user(quinn.id)).find(r => r.project.id === 'p_g4')
    expect(row?.gates.map(g => g.gate.action)).toEqual(['APPROVE_ADVISER'])
    expect(canDo(user(quinn.id), 'APPROVE_ADVISER', b('p_g4')).ok).toBe(true)

    await setGlobalRoles(as('a_sierra'), null, quinn.id, [G.FACULTY])
    expect(worklist(snap(), user(quinn.id))).toEqual([])
    expect(canDo(user(quinn.id), 'APPROVE_ADVISER', b('p_g4')).ok).toBe(false)
  })

  it('a new Program Chair/Coordinator sees nothing until a program scope is set', async () => {
    const quinn = await newActiveAccount('quinn@hau.edu.ph')
    const store = applyStage(buildSeed(), 'p_g4', 'ADVISER_ASSIGNMENT', { roles: { [P.INSTRUCTOR_1]: 'f_bravo' } })
    store.users[quinn.id] = user(quinn.id)
    await load(store)
    await setGlobalRoles(as('a_sierra'), null, quinn.id, [G.FACULTY, G.COORDINATOR])
    expect(canDo(user(quinn.id), 'assignAdviser', b('p_g4')).ok).toBe(false)

    await expect(setProgramScope(as('a_sierra'), null, 'f_bravo', [WD])).rejects.toThrow(/only to a Program Chair/)
    await expect(setProgramScope(as('a_sierra'), null, quinn.id, ['Not a program'])).rejects.toThrow(/Unknown program/)
    await expect(setProgramScope(as('f_alpha'), null, quinn.id, [WD])).rejects.toThrow()
    await setProgramScope(as('a_sierra'), null, quinn.id, [WD])
    expect(canDo(user(quinn.id), 'assignAdviser', b('p_g4')).ok).toBe(true)
    expect(audit('PROGRAM_SCOPE_CHANGED').at(-1)).toMatchObject({ before: { programScope: [] }, after: { programScope: [WD] } })
  })

  it('URO granted → the clearance queue opens at URO Verification', async () => {
    const quinn = await newActiveAccount('quinn@hau.edu.ph')
    const store = scenarioStore('T11')
    store.users[quinn.id] = user(quinn.id)
    await load(store)
    await setGlobalRoles(as('a_sierra'), null, quinn.id, [G.FACULTY, G.URO])
    expect(canDo(user(quinn.id), 'URO_VERIFY', b('p_g3')).ok).toBe(true)
  })

  it('a suspended account loses every grant at once', async () => {
    await setAccountStatus(as('a_sierra'), null, 'f_alpha', 'Suspended')
    expect(canView(user('f_alpha'), b('p_g1'))).toBe(false)
    expect(worklist(snap(), user('f_alpha'))).toEqual([])
  })
})

describe('permission overrides (flag PERMISSION_OVERRIDES = deny-only)', () => {
  it('revoking weeklylog.sign on G1 blocks the Adviser there, is audited, and lifting restores it', async () => {
    await load(scenarioStore('T1'))
    const log = b('p_g1').weeklyLogs.find(l => l.status === 'Submitted')
    expect(canDo(user('f_alpha'), 'signWeeklyLog', b('p_g1'), { log }).ok).toBe(true)

    const o = await revokeCapability(as('a_sierra'), null, { userId: 'f_alpha', capability: 'weeklylog.sign', projectId: 'p_g1', reason: 'On leave' })
    const denied = canDo(user('f_alpha'), 'signWeeklyLog', b('p_g1'), { log })
    expect(denied.ok).toBe(false)
    expect(denied.reason).toMatch(/System Administrator override.*On leave/)
    await expect(decideWeeklyLog(as('f_alpha'), null, 'p_g1', log.id, { approve: true })).rejects.toThrow(/override/)
    expect(audit('PERMISSION_OVERRIDE_APPLIED').at(-1)).toMatchObject({
      actorId: 'a_sierra', hat: G.ADMIN, projectId: 'p_g1',
      before: { userId: 'f_alpha', capability: 'weeklylog.sign', effect: 'as the policies decide' },
      after: { userId: 'f_alpha', capability: 'weeklylog.sign', effect: 'revoked' },
      meta: { reason: 'On leave' },
    })
    // The rest of the Adviser hat is untouched.
    expect(canDo(user('f_alpha'), 'readDocuments', b('p_g1')).ok).toBe(true)

    await liftOverride(as('a_sierra'), null, o.id)
    expect(canDo(user('f_alpha'), 'signWeeklyLog', b('p_g1'), { log }).ok).toBe(true)
    expect(audit('PERMISSION_OVERRIDE_LIFTED').at(-1)).toMatchObject({ before: { effect: 'revoked' }, after: { effect: 'as the policies decide' } })
    await expect(liftOverride(as('a_sierra'), null, o.id)).rejects.toThrow(/already/)
  })

  it('an everywhere override on project.view hides every project it covers; a project override stays on its project', async () => {
    await revokeCapability(as('a_sierra'), null, { userId: 'f_charlie', capability: 'document.read', projectId: 'p_g2', reason: 'Conflict of interest' })
    expect(canView(user('f_charlie'), b('p_g2'))).toBe(true)
    expect(viewBundle(user('f_charlie'), b('p_g2')).documents).toEqual([])

    await revokeCapability(as('a_sierra'), null, { userId: 'f_charlie', capability: 'project.view', reason: 'Account under review' })
    for (const p of snap().projects) expect(canView(user('f_charlie'), b(p.id))).toBe(false)
    expect(worklist(snap(), user('f_charlie'))).toEqual([])
    expect(canView(user('f_alpha'), b('p_g2'))).toBe(true)
  })

  it('institution capabilities are revoked everywhere, never per project', async () => {
    expect(can(resolveInstitution(user('f_alpha'), snap()), 'report.generate')).toBe(true)
    await expect(revokeCapability(as('a_sierra'), null, { userId: 'f_alpha', capability: 'report.generate', projectId: 'p_g1', reason: 'x' }))
      .rejects.toThrow(/every project/)
    await revokeCapability(as('a_sierra'), null, { userId: 'f_alpha', capability: 'report.generate', reason: 'Audit in progress' })
    expect(can(resolveInstitution(user('f_alpha'), snap()), 'report.generate')).toBe(false)
  })

  it('refuses self-overrides, non-admins, missing reasons, unknown capabilities and duplicates', async () => {
    const admin = as('a_sierra')
    await expect(revokeCapability(admin, null, { userId: 'a_sierra', capability: 'audit.view', reason: 'x' })).rejects.toThrow(/own account/)
    await expect(revokeCapability(admin, null, { userId: 'f_alpha', capability: 'verdict.record', reason: '  ' })).rejects.toThrow(/reason/)
    await expect(revokeCapability(admin, null, { userId: 'f_alpha', capability: 'grant.everything', reason: 'x' })).rejects.toThrow(/Unknown/)
    await revokeCapability(admin, null, { userId: 'f_alpha', capability: 'verdict.record', reason: 'x' })
    await expect(revokeCapability(admin, null, { userId: 'f_alpha', capability: 'verdict.record', reason: 'y' })).rejects.toThrow(/already revoked/)
    await expect(revokeCapability(as('f_alpha'), null, { userId: 'f_charlie', capability: 'project.view', reason: 'x' })).rejects.toThrow()
  })

  it('overrides only ever remove: there is no way to add a capability', async () => {
    const before = [...resolveInstitution(user('f_bravo'), snap()).grants.keys()].sort()
    await revokeCapability(as('a_sierra'), null, { userId: 'f_bravo', capability: 'verdict.record', reason: 'x' })
    expect([...resolveInstitution(user('f_bravo'), snap()).grants.keys()].sort()).toEqual(before)
    expect(canDo(user('f_bravo'), 'recordVerdict', b('p_g2')).ok).toBe(false) // Bravo never had it on G2
    // A forged 'allow' row is ignored by the guard.
    await db.add('permissionOverrides', { userId: 'f_bravo', capability: 'verdict.record', projectId: 'p_g2', effect: 'allow', reason: 'forged', liftedAt: null })
    expect(canDo(user('f_bravo'), 'recordVerdict', b('p_g2')).ok).toBe(false)
  })

  describe('flag off', () => {
    afterEach(() => { FLAGS.PERMISSION_OVERRIDES = 'deny-only' })
    it('ignores overrides and refuses new ones', async () => {
      await revokeCapability(as('a_sierra'), null, { userId: 'f_alpha', capability: 'verdict.record', reason: 'x' })
      expect(canDo(user('f_alpha'), 'recordVerdict', b('p_g2')).ok).toBe(false)
      FLAGS.PERMISSION_OVERRIDES = 'off'
      expect(canDo(user('f_alpha'), 'recordVerdict', b('p_g2')).ok).toBe(true)
      await expect(revokeCapability(as('a_sierra'), null, { userId: 'f_alpha', capability: 'project.view', reason: 'x' })).rejects.toThrow(/turned off/)
    })
  })
})

describe('global settings — revision countdown', () => {
  it('a change is audited and applies to the next verdict; running countdowns keep their deadline', async () => {
    const g3Before = snap().projects.find(p => p.id === 'p_g3').revisionDeadline
    expect(revisionDaysOf(snap())).toEqual({ Minor: 7, Major: 14 })

    await updateRevisionDays(as('a_sierra'), null, { Minor: 10, Major: 21 })
    expect(revisionDaysOf(snap())).toEqual({ Minor: 10, Major: 21 })
    expect(audit('SETTINGS_CHANGED').at(-1)).toMatchObject({
      actorId: 'a_sierra', hat: G.ADMIN, before: { revisionDays: { Minor: 7, Major: 14 } }, after: { revisionDays: { Minor: 10, Major: 21 } },
    })

    const t0 = Date.now()
    await recordVerdict(as('f_alpha'), null, 'p_g2', { verdict: FLAGS.VERDICT_VALUES.MINOR, remarks: 'Revise chapter 3.' })
    const days = (new Date(snap().projects.find(p => p.id === 'p_g2').revisionDeadline) - t0) / 864e5
    expect(days).toBeGreaterThan(9.99)
    expect(days).toBeLessThan(10.01)
    expect(snap().projects.find(p => p.id === 'p_g3').revisionDeadline).toBe(g3Before)
  })

  it('refuses non-admins and out-of-range values', async () => {
    await expect(updateRevisionDays(as('f_alpha'), null, { Minor: 5, Major: 10 })).rejects.toThrow()
    const admin = as('a_sierra')
    for (const bad of [{ Minor: 0, Major: 14 }, { Minor: 7, Major: 61 }, { Minor: 2.5, Major: 14 }, { Minor: 'x', Major: 14 }]) {
      await expect(updateRevisionDays(admin, null, bad)).rejects.toThrow(/whole number/)
    }
    await expect(updateRevisionDays(admin, null, { Minor: 7, Major: 14 })).rejects.toThrow(/Nothing changed/)
    expect(audit('SETTINGS_CHANGED')).toEqual([])
  })
})

describe('T20 and the rest of "must not" — the System Administrator never acts on the workflow', () => {
  const ADMIN_MAY = new Set(['viewProject'])

  it('at every stage, the guard allows the admin nothing but opening the record', () => {
    for (const s of STAGES) {
      const store = applyStage(buildSeed(), 'p_g2', s.key, {
        roles: { [P.INSTRUCTOR_1]: 'f_bravo', [P.ADVISER]: 'f_charlie', [P.PANEL_CHAIR]: 'f_alpha', [P.PANEL_MEMBER]: ['f_echo'], [P.INSTRUCTOR_2]: 'f_foxtrot' },
      })
      const snapshot = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Object.values(v)]))
      const admin = snapshot.users.find(u => u.id === 'a_sierra')
      const pb = bundle(snapshot, 'p_g2')
      const doc = pb.documents[0] && { ...pb.documents[0], status: DOC_STATUS.SUBMITTED }
      const form = pb.forms[0]
      const log = { status: 'Submitted' }
      for (const action of Object.keys(ACTIONS)) {
        const r = canDo(admin, action, pb, { doc, form, log })
        expect(r.ok, `${s.key} · ${action}`).toBe(ADMIN_MAY.has(action))
      }
      const seen = viewBundle(admin, pb)
      expect(seen.documents, s.key).toEqual([])
      expect(seen.forms, s.key).toEqual([])
      expect(seen.weeklyLogs, s.key).toEqual([])
      expect(seen.annotations, s.key).toEqual([])
      expect(seen.aiSummaries, s.key).toEqual([])
    }
  })

  it('forced service calls are rejected: verdict, gate, signature, assignment, annotation, review', async () => {
    const admin = as('a_sierra')
    await expect(recordVerdict(admin, null, 'p_g2', { verdict: FLAGS.VERDICT_VALUES.MINOR, remarks: 'Revise chapter 3.' })).rejects.toThrow()
    await expect(runGate(admin, null, 'p_g4', { action: 'ENDORSE_ROSTER' })).rejects.toThrow()
    await expect(assignRole(admin, null, 'p_g2', 'f_foxtrot', P.PANEL_MEMBER)).rejects.toThrow()
    const doc = b('p_g1').documents.find(d => d.docType === DOC_TYPES.TOPIC_PROPOSAL)
    await expect(addAnnotation(admin, null, 'p_g1', doc.id, { text: 'x', category: 'General Comment' })).rejects.toThrow()
    await expect(submitReview(admin, null, 'p_g1', doc.id, { decision: 'Approve' })).rejects.toThrow()

    await load(scenarioStore('T10'))
    const sheet = snap().forms.find(f => f.projectId === 'p_g3' && f.formType === 'Approval Sheet')
    await expect(signForm(as('a_sierra'), null, 'p_g3', sheet.id)).rejects.toThrow()
    await expect(runGate(as('a_sierra'), null, 'p_g3', { action: 'ENDORSE_TO_URO' })).rejects.toThrow()
    expect(audit('SIGNATURE_APPLIED').filter(l => l.actorId === 'a_sierra')).toEqual([])
  })

  it('OQ#5: the admin is not given Instructor 1/2 assignment', () => {
    const inst = resolveInstitution(user('a_sierra'), snap())
    expect(can(inst, 'group.create')).toBe(false)
    for (const p of snap().projects) {
      expect(canDo(user('a_sierra'), 'assignInstructor2', b(p.id)).ok).toBe(false)
      expect(canDo(user('a_sierra'), 'manageRoster', b(p.id)).ok).toBe(false)
    }
  })
})
