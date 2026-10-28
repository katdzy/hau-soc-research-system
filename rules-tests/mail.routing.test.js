// planEmail (functions/mailRouting.js) against the Firestore emulator: the
// lookup deliverOutbox relies on to never email a seeded account as written.
// Its own users (mailtest.*) are removed afterwards; nothing else is touched.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { planEmail } from '../functions/mailRouting.js'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.GCLOUD_PROJECT ??= 'demo-local'

const fromFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = fromFunctions('firebase-admin/app')
const { getFirestore } = fromFunctions('firebase-admin/firestore')

// More demo accounts than one `in` query takes (30), and one real account.
const DEMO = Array.from({ length: 35 }, (_, i) => `mailtest.demo${i}@student.hau.edu.ph`)
const REAL = 'mailtest.real@hau.edu.ph'
const ids = [...DEMO.map((_, i) => `mailtest_demo_${i}`), 'mailtest_real']

let app, db
beforeAll(async () => {
  app = initializeApp({ projectId: 'demo-local' }, 'mail-routing-test')
  db = getFirestore(app)
  const batch = db.batch()
  DEMO.forEach((email, i) => batch.set(db.doc(`users/mailtest_demo_${i}`), { email, demo: true, status: 'Active' }))
  batch.set(db.doc('users/mailtest_real'), { email: REAL, status: 'Active' })
  await batch.commit()
})

afterAll(async () => {
  const batch = db.batch()
  ids.forEach(id => batch.delete(db.doc(`users/${id}`)))
  await batch.commit()
  await deleteApp(app)
})

const mail = { subject: 'Defense scheduled', body: 'Room 305', to: [...DEMO, REAL, 'someone.new@student.hau.edu.ph'] }

describe('planEmail', () => {
  it('without a redirect inbox, no demo account is emailed', async () => {
    const { route, messages } = await planEmail(db, mail, '')
    expect(route.skipped.slice().sort()).toEqual(DEMO.slice().sort())
    expect(messages).toEqual([{ ...mail, to: [REAL, 'someone.new@student.hau.edu.ph'] }])
  })

  it('with one, the demo accounts’ copy goes there — once, naming all of them', async () => {
    const { route, messages } = await planEmail(db, mail, 'team@example.com')
    expect(route.redirectedFor).toHaveLength(35)
    expect(messages).toHaveLength(2)
    expect(messages[1].to).toEqual(['team@example.com'])
    expect(messages[1].subject).toMatch(/^\[Demo → mailtest\.demo0@student\.hau\.edu\.ph, .*\] Defense scheduled$/)
    expect(messages.flatMap(m => m.to).some(a => DEMO.includes(a))).toBe(false)
  })

  it('mail only for demo accounts, with no inbox set, sends nothing', async () => {
    const { messages } = await planEmail(db, { ...mail, to: DEMO.slice(0, 3) }, '')
    expect(messages).toEqual([])
  })
})
