// scripts/live-spawn/core.mjs checkChanges: the test panel on a live project
// changes dummy data only — with one exception, handing a seed section (the
// old §6 WD-401, taught by Prof. Bravo, who has no login) to a spawned faculty
// member. Runs against an in-memory stand-in for the Admin SDK's Firestore.
import { it, expect } from 'vitest'
import { checkChanges } from '../../scripts/live-spawn/core.mjs'

function fakeDb(data) {
  const doc = (collection, id) => ({
    _path: [collection, id],
    async get() {
      const row = data[collection]?.[id]
      return { exists: Boolean(row), data: () => row && structuredClone(row) }
    },
  })
  return {
    collection: (name) => ({ doc: (id) => doc(name, id) }),
    getAll: (...refs) => Promise.all(refs.map(r => r.get())),
  }
}

const SEED_SECTION = { id: 'sec_wd401', course: 'Capstone 1', block: 'WD-401', program: 'WD', yearLevel: '4th Year', term: 'T', instructorId: 'f_bravo' }
const store = () => ({
  users: {
    f_bravo: { id: 'f_bravo', name: 'Prof. Bravo', email: 'bravo@hau.edu.ph', demo: true },
    f_real: { id: 'f_real', name: 'Prof. Real', email: 'real@hau.edu.ph' },
    t_f_01: { id: 't_f_01', name: 'Prof. Test', email: 'test.prof@hau.edu.ph', demo: true, spawned: { kind: 'faculty' } },
  },
  sections: {
    sec_wd401: SEED_SECTION,
    sec_real: { ...SEED_SECTION, id: 'sec_real', block: 'WD-402', instructorId: 'f_real' },
  },
})
const swap = (row, instructorId) => ({ collection: 'sections', id: row.id, kind: 'update', row: { ...row, instructorId } })

it('live spawn: a seed section can be handed to a spawned faculty member, and only its instructor is written', async () => {
  const changes = [swap(SEED_SECTION, 't_f_01')]
  await checkChanges(fakeDb(store()), changes)
  expect(changes[0].patch).toEqual({ instructorId: 't_f_01' })

  // …and back to nobody, which is what removing that faculty member does.
  const s = store(); s.sections.sec_wd401 = { ...SEED_SECTION, instructorId: 't_f_01' }
  const back = [swap(s.sections.sec_wd401, null)]
  await checkChanges(fakeDb(s), back)
  expect(back[0].patch).toEqual({ instructorId: null })
})

it('live spawn: the swap is refused for real accounts, real sections and any other change', async () => {
  const db = fakeDb(store())
  await expect(checkChanges(db, [swap(SEED_SECTION, 'f_real')])).rejects.toThrow(/spawned faculty/)
  await expect(checkChanges(db, [swap(SEED_SECTION, 'f_bravo')])).rejects.toThrow(/not dummy data/) // no change
  await expect(checkChanges(db, [swap(store().sections.sec_real, 't_f_01')])).rejects.toThrow(/real account/)
  await expect(checkChanges(db, [{ ...swap(SEED_SECTION, 't_f_01'), row: { ...SEED_SECTION, instructorId: 't_f_01', block: 'WD-499' } }]))
    .rejects.toThrow(/not dummy data/)
  // A patch the caller sends is ignored: the check decides what gets written.
  const forged = [{ collection: 'sections', id: 'sec_wd401', kind: 'update', row: SEED_SECTION, patch: { block: 'X' } }]
  await expect(checkChanges(db, forged)).rejects.toThrow(/not dummy data/)
  expect(forged[0].patch).toBeUndefined()
})
