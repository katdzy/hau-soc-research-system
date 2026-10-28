// The custom claims the rules read (functions/claims.js), against caac.js —
// the claims must say exactly who each account is on each project.

import { describe, it, expect } from 'vitest'
import { buildClaims, sameClaims, MAX_CLAIMS_BYTES } from '../../functions/claims.js'
import { buildSeed } from '../backend/seed.js'
import { scenarioStore } from '../dev/scenarios.js'
import { bundle } from '../services/core.js'
import { resolveContext, isActiveAccount } from '../domain/caac.js'

// The store keys each collection by id; bundle() and the claims take arrays, as db.snapshot() gives.
const asArrays = (store) => Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Object.values(v ?? {})]))

const rowsFor = (store, user) => ({
  user,
  members: store.projectMembers.filter(m => m.userId === user.id),
  assignments: store.projectAssignments.filter(a => a.userId === user.id),
  overrides: (store.permissionOverrides ?? []).filter(o => o.userId === user.id),
})

const active = { id: 'u1', status: 'Active', emailVerified: true, globalRoles: ['Faculty'], programScope: ['WD'] }

describe('buildClaims', () => {
  it('matches resolveContext for every seeded account on every project', () => {
    for (const store of [buildSeed(), scenarioStore('T16'), scenarioStore('T19')].map(asArrays)) {
      for (const user of store.users) {
        const { claims, dropped } = buildClaims(rowsFor(store, user))
        expect(dropped).toEqual([])
        expect(claims.userId).toBe(user.id)
        for (const project of store.projects) {
          const ctx = resolveContext(user, bundle(store, project.id))
          const expected = isActiveAccount(user) ? [...(ctx.isMember ? ['Member'] : []), ...ctx.projectRoles] : []
          expect((claims.projects[project.id] ?? []).slice().sort(), `${user.id} on ${project.id}`)
            .toEqual(expected.slice().sort())
        }
        expect(claims.globalRoles).toEqual(isActiveAccount(user) ? (user.globalRoles ?? []) : [])
      }
    }
  })

  it('gives an inactive or unverified account nothing but its id', () => {
    const assignments = [{ userId: 'u1', projectId: 'p1', roleType: 'Adviser', status: 'Accepted' }]
    for (const user of [{ ...active, status: 'Inactive' }, { ...active, emailVerified: false }]) {
      expect(buildClaims({ user, assignments }).claims).toEqual({ userId: 'u1', globalRoles: [], programScope: [], projects: {} })
    }
  })

  it('skips Declined assignments and merges a member’s roles on one project', () => {
    const { claims } = buildClaims({
      user: active,
      members: [{ userId: 'u1', projectId: 'p1' }],
      assignments: [
        { userId: 'u1', projectId: 'p2', roleType: 'Adviser', status: 'Accepted' },
        { userId: 'u1', projectId: 'p2', roleType: 'Panel Member', status: 'Accepted' },
        { userId: 'u1', projectId: 'p3', roleType: 'Panel Chair', status: 'Declined' },
        { userId: 'someone-else', projectId: 'p4', roleType: 'Adviser', status: 'Accepted' },
      ],
    })
    expect(claims.projects).toEqual({ p1: ['Member'], p2: ['Adviser', 'Panel Member'] })
    expect(claims.programScope).toEqual(['WD'])
  })

  it('honours deny overrides on project.view / document.read, and only active ones', () => {
    const assignments = ['p1', 'p2'].map(projectId => ({ userId: 'u1', projectId, roleType: 'Adviser', status: 'Accepted' }))
    const deny = (o) => ({ userId: 'u1', effect: 'deny', liftedAt: null, ...o })
    const on = (overrides) => buildClaims({ user: active, assignments, overrides }).claims

    expect(on([deny({ capability: 'document.read', projectId: 'p1' })]).projects).toEqual({ p2: ['Adviser'] })
    expect(on([deny({ capability: 'review.decide', projectId: 'p1' })]).projects).toHaveProperty('p1')
    expect(on([deny({ capability: 'project.view', projectId: 'p1', liftedAt: '2026-10-01' })]).projects).toHaveProperty('p1')

    const everywhere = on([deny({ capability: 'project.view', projectId: null })])
    expect(everywhere).toMatchObject({ hidden: true, projects: {} })
    expect(on([]).hidden).toBeUndefined()
  })

  it(`stays under ${MAX_CLAIMS_BYTES} bytes, leaving archived projects out first`, () => {
    const ids = Array.from({ length: 40 }, (_, i) => `project${String(i).padStart(13, '0')}`)
    const assignments = ids.map(projectId => ({ userId: 'u1', projectId, roleType: 'Panel Member', status: 'Accepted' }))
    const stages = Object.fromEntries(ids.map((id, i) => [id, i < 30 ? 'ARCHIVED' : 'FINAL_DEFENSE']))
    const { claims, dropped } = buildClaims({ user: active, assignments, stages })
    expect(new TextEncoder().encode(JSON.stringify(claims)).length).toBeLessThanOrEqual(MAX_CLAIMS_BYTES)
    expect(dropped.length).toBeGreaterThan(0)
    expect(dropped.every(id => stages[id] === 'ARCHIVED')).toBe(true)
    for (const id of ids.slice(30)) expect(claims.projects).toHaveProperty(id)
  })
})

describe('sameClaims', () => {
  it('ignores key order, not content', () => {
    expect(sameClaims({ a: 1, projects: { x: ['M'], y: ['A'] } }, { projects: { y: ['A'], x: ['M'] }, a: 1 })).toBe(true)
    expect(sameClaims({ projects: { x: ['M'] } }, { projects: { x: ['A'] } })).toBe(false)
    expect(sameClaims(undefined, {})).toBe(true)
  })
})
