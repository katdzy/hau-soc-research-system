// storage.rules against the Storage emulator (see vitest.config.js here).
// Who may put a file where, and who may read it — the same people
// `document.submit` and `document.read` allow in caac.js. The claims below are
// the ones firestore.rules documents (token.globalRoles, token.projects, …).

import { describe, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing'

const PROJECT_ID = 'demo-local'
const EMULATORS = {
  storage: { host: '127.0.0.1', port: 9199 },
  firestore: { host: '127.0.0.1', port: 8080 },
}
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// Test projects, one per stage the cases need. Ids no seed uses.
const P = { dev: 'rules_p_dev', uro: 'rules_p_uro', formation: 'rules_p_formation' }
const PROJECTS = {
  [P.dev]: { currentStage: 'PROPOSAL_DEVELOPMENT', program: 'WD' },
  [P.uro]: { currentStage: 'URO_VERIFICATION', program: 'WD' },
  [P.formation]: { currentStage: 'GROUP_FORMATION', program: 'WD' },
}

const token = (email, { roles = [], projects = {}, verified = true, hidden } = {}) => ({
  email, email_verified: verified, globalRoles: roles, projects, programScope: [], ...(hidden ? { hidden } : {}),
})
const member = { [P.dev]: ['Member'], [P.uro]: ['Member'], [P.formation]: ['Member'] }
const USERS = {
  student: token('kilo@student.hau.edu.ph', { roles: ['Student'], projects: member }),
  unverified: token('lima@student.hau.edu.ph', { roles: ['Student'], projects: member, verified: false }),
  personal: token('kilo@gmail.com', { roles: ['Student'], projects: member }),
  outsider: token('november@student.hau.edu.ph', { roles: ['Student'] }),
  adviser: token('alpha@hau.edu.ph', { roles: ['Faculty'], projects: { [P.dev]: ['Adviser'] } }),
  panel: token('charlie@hau.edu.ph', { roles: ['Faculty'], projects: { [P.dev]: ['Panel Member'] } }),
  admin: token('sierra@hau.edu.ph', { roles: ['Faculty', 'System Administrator'] }),
  // An override revoking project.view everywhere (functions/claims.js `hidden`).
  revoked: token('mike@student.hau.edu.ph', { roles: ['Student'], projects: member, hidden: true }),
}

const PDF = new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n'), ...new Uint8Array(64)])
const SHA = 'a'.repeat(64)
let n = 0
const name = (file = 'Chapters_1-3.pdf') => `${Date.now().toString(36)}${(n++).toString().padStart(6, '0')}x-${file}`
const pathIn = (projectId, file) => `projects/${projectId}/documents/${name(file)}`
const meta = (projectId, docType = 'Proposal Manuscript', extra = {}) => ({
  contentType: 'application/pdf',
  customMetadata: { projectId, docType, uploadedBy: 's_kilo', sha256: SHA, ...extra },
})

let env
const as = (who) => env.authenticatedContext(`uid_${who}`, USERS[who]).storage()
const anon = () => env.unauthenticatedContext().storage()
const put = (storage, path, bytes = PDF, metadata = meta(path.split('/')[1])) =>
  storage.ref(path).put(bytes, metadata).then(s => s)

// Files the read cases open: written with the rules off.
const existing = {}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { ...EMULATORS.storage, rules: read('storage.rules') },
    firestore: EMULATORS.firestore,
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await Promise.all(Object.entries(PROJECTS).map(([id, p]) => db.doc(`projects/${id}`).set(p)))
    existing.dev = pathIn(P.dev)
    await ctx.storage().ref(existing.dev).put(PDF, meta(P.dev))
  })
})

afterAll(async () => {
  if (!env) return
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await Promise.all(Object.keys(PROJECTS).map(id => ctx.firestore().doc(`projects/${id}`).delete()))
      const root = ctx.storage().ref('projects')
      const { prefixes } = await root.listAll()
      for (const project of prefixes.filter(p => p.name.startsWith('rules_'))) {
        const { items } = await project.child('documents').listAll()
        await Promise.all(items.map(i => i.delete()))
      }
    })
  } finally {
    await env.cleanup()
    // Put the open emulator rules back for the app (docker compose loads these).
    const restore = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { ...EMULATORS.storage, rules: read('emulator/storage.open.rules') },
    })
    await restore.cleanup()
  }
})

describe('upload — a group member, a new path, a PDF the stage accepts', () => {
  it('lets a verified member upload a manuscript at Proposal Development', async () => {
    await assertSucceeds(put(as('student'), pathIn(P.dev)))
  })

  it('never lets a file be replaced or deleted — not even by its group', async () => {
    const path = pathIn(P.dev)
    await assertSucceeds(put(as('student'), path))
    await assertFails(put(as('student'), path))
    await assertFails(as('student').ref(path).delete())
    await assertFails(as('student').ref(path).updateMetadata({ customMetadata: { sha256: 'b'.repeat(64) } }))
  })

  it('refuses anyone who is not a verified, institutional member of the project', async () => {
    await assertFails(put(anon(), pathIn(P.dev)))
    await assertFails(put(as('unverified'), pathIn(P.dev)))
    await assertFails(put(as('personal'), pathIn(P.dev)))
    await assertFails(put(as('outsider'), pathIn(P.dev)))
    await assertFails(put(as('adviser'), pathIn(P.dev)))
    await assertFails(put(as('admin'), pathIn(P.dev)))
  })

  it('refuses anything but a non-empty PDF up to 25 MB', async () => {
    const path = () => pathIn(P.dev)
    await assertFails(put(as('student'), path(), PDF, { ...meta(P.dev), contentType: 'application/msword' }))
    await assertFails(put(as('student'), path(), new Uint8Array(0)))
    await assertFails(put(as('student'), path(), new Uint8Array(25 * 1024 * 1024 + 1)))
  })

  it('refuses a path filePath() would not make', async () => {
    await assertFails(put(as('student'), `projects/${P.dev}/documents/thesis.pdf`))
    await assertFails(put(as('student'), pathIn(P.dev, 'Chapters.docx')))
    await assertFails(put(as('student'), `projects/${P.dev}/elsewhere/${name()}`))
    await assertFails(put(as('student'), `uploads/${name()}`))
  })

  it('requires the metadata submitDocument writes, for this project', async () => {
    const ok = meta(P.dev).customMetadata
    const without = (key) => { const { [key]: _, ...rest } = ok; return { contentType: 'application/pdf', customMetadata: rest } }
    await assertFails(put(as('student'), pathIn(P.dev), PDF, meta(P.uro)))
    await assertFails(put(as('student'), pathIn(P.dev), PDF, without('sha256')))
    await assertFails(put(as('student'), pathIn(P.dev), PDF, without('uploadedBy')))
    await assertFails(put(as('student'), pathIn(P.dev), PDF, meta(P.dev, undefined, { sha256: 'not-a-hash' })))
    await assertFails(put(as('student'), pathIn(P.dev), PDF, meta(P.dev, undefined, { note: 'extra' })))
  })

  it('accepts only the types the project’s stage takes', async () => {
    await assertFails(put(as('student'), pathIn(P.dev), PDF, meta(P.dev, 'Final Manuscript')))
    await assertFails(put(as('student'), pathIn(P.dev), PDF, meta(P.dev, 'Presentation Video (link)')))
    await assertFails(put(as('student'), pathIn(P.formation), PDF, meta(P.formation, 'Proposal Manuscript')))
    // S9.4 — at URO verification, only the returned certificates come back.
    await assertSucceeds(put(as('student'), pathIn(P.uro), PDF, meta(P.uro, "Editor's Certificate")))
    await assertFails(put(as('student'), pathIn(P.uro), PDF, meta(P.uro, 'Final Manuscript')))
  })
})

describe('read — as document.read allows', () => {
  it('opens for the group and, past adviser approval, for the Adviser', async () => {
    await assertSucceeds(as('student').ref(existing.dev).getMetadata())
    await assertSucceeds(as('adviser').ref(existing.dev).getMetadata())
  })

  it('stays closed to the System Administrator (T20), a panel not yet in play, outsiders and anyone signed out', async () => {
    await assertFails(as('admin').ref(existing.dev).getMetadata())
    await assertFails(as('panel').ref(existing.dev).getMetadata())
    await assertFails(as('outsider').ref(existing.dev).getMetadata())
    await assertFails(anon().ref(existing.dev).getMetadata())
  })

  it('stays closed while an override hides every project (claims `hidden`)', async () => {
    await assertFails(as('revoked').ref(existing.dev).getMetadata())
  })
})
