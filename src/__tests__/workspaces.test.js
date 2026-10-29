// The "Acting as" contexts (Figma F02) each §6 persona gets from the seed, and
// the choice of which one opens first.
import { it, expect } from 'vitest'
import { buildSeed } from '../backend/seed.js'
import { contextsOf, pickContext, rowsIn, CONTEXTS } from '../domain/workspaces.js'
import { worklist } from '../services/worklist.js'

const snapOf = (store) => Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Object.values(v)]))
const snap = snapOf(buildSeed())
const user = (id) => snap.users.find(u => u.id === id)
const keys = (id) => contextsOf(user(id), snap).map(c => c.key)

it('workspaces: each persona holds the contexts their roles give them', () => {
  expect(keys('f_alpha')).toEqual(['coordinator', 'adviser', 'panel-chair'])
  expect(keys('f_bravo')).toEqual(expect.arrayContaining(['instructor-1', 'panel-member']))
  expect(keys('f_delta')).toEqual(['dean', 'adviser'])
  expect(keys('f_echo')).toEqual(expect.arrayContaining(['associate-dean', 'panel-member']))
  expect(keys('o_uniform')).toEqual(['uro'])
  expect(keys('a_sierra')).toEqual(['admin'])
  expect(keys('s_november')).toEqual(['student'])
  // Ungrouped student (T14) and a faculty account with nothing assigned.
  expect(keys('s_whiskey')).toEqual([])
  expect(keys('f_papa')).toEqual([])
})

it('workspaces: the saved context wins, then the role behind the first thing owed', () => {
  const held = contextsOf(user('f_alpha'), snap)
  expect(pickContext(held, 'adviser').key).toBe('adviser')
  expect(pickContext(held, 'dean', 'Panel Chair').key).toBe('panel-chair')
  expect(pickContext(held, null).key).toBe('coordinator')
  expect(pickContext([], 'adviser')).toBeNull()
})

it('workspaces: a project-role context lists only the projects that role is held on', () => {
  const me = user('f_alpha')
  const rows = worklist(snap, me)
  const adviser = contextsOf(me, snap).find(c => c.key === 'adviser')
  const mine = rowsIn(adviser, rows).map(r => r.project.id)
  expect(mine.length).toBeGreaterThan(0)
  for (const id of mine) {
    expect(snap.projectAssignments.some(a => a.projectId === id && a.userId === me.id && a.roleType === 'Adviser')).toBe(true)
  }
})

it('workspaces: every rail route is a real page', async () => {
  const app = await import('node:fs').then(fs => fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'))
  for (const c of CONTEXTS) for (const n of c.nav) {
    expect(app.includes(`path="${n.to.slice(1)}"`), `${c.key} → ${n.to}`).toBe(true)
  }
})
