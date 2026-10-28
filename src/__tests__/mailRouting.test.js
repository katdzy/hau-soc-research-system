// Seeded accounts are never emailed at their own addresses (functions/mailRouting.js).

import { describe, it, expect, beforeAll } from 'vitest'
import { routeMail, redirectedMail } from '../../functions/mailRouting.js'
import { buildSeed } from '../backend/seed.js'
import { db } from '../backend/index.js'
import { registerAccount } from '../services/actions.js'
import { setSessionUserId } from '../state/session.js'

const DEMO = new Set(['kilo@student.hau.edu.ph', 'bravo@hau.edu.ph'])

describe('routeMail', () => {
  it('sends real addresses as written and holds every demo address', () => {
    expect(routeMail(['real@student.hau.edu.ph', 'kilo@student.hau.edu.ph'], DEMO, '')).toEqual({
      direct: ['real@student.hau.edu.ph'], redirectedFor: [], skipped: ['kilo@student.hau.edu.ph'],
    })
  })

  it('with MAIL_REDIRECT_TO, demo mail goes to that inbox instead', () => {
    expect(routeMail([' Kilo@Student.HAU.edu.ph ', 'bravo@hau.edu.ph', 'kilo@student.hau.edu.ph'], DEMO, 'Team@Example.com')).toEqual({
      direct: [], redirectedFor: ['kilo@student.hau.edu.ph', 'bravo@hau.edu.ph'], skipped: [],
    })
  })

  it('the redirected email says whom it was for', () => {
    const mail = redirectedMail({ subject: 'Defense scheduled', body: 'Room 305', to: ['kilo@student.hau.edu.ph'] }, ['kilo@student.hau.edu.ph'], 'team@example.com')
    expect(mail.to).toEqual(['team@example.com'])
    expect(mail.subject).toBe('[Demo → kilo@student.hau.edu.ph] Defense scheduled')
    expect(mail.body).toMatch(/instead of the demo account\(s\) kilo@student\.hau\.edu\.ph[\s\S]*Room 305/)
  })
})

describe('demo accounts', () => {
  beforeAll(async () => {
    if (db.name !== 'local') throw new Error(`Refusing to run: backend is "${db.name}", not local.`)
    await db.replaceAll(buildSeed())
    setSessionUserId(null)
  })

  it('every seeded account — personas and NPCs — is marked demo', () => {
    const users = Object.values(buildSeed().users)
    expect(users.length).toBeGreaterThan(80)
    expect(users.filter(u => u.demo !== true).map(u => u.id)).toEqual([])
  })

  it('an account someone registers is not', async () => {
    const user = await registerAccount(null, { email: 'new.person@student.hau.edu.ph', name: 'New Person', idNumber: '2022-9999', block: 'WD-401' })
    expect(user.demo).toBeUndefined()
  })
})
