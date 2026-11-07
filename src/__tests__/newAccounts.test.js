// Checklist item 4 (S-26): the System Administrator's "New faculty accounts"
// list — recent, active faculty only, flagged when they hold no office role.

import { describe, it, expect } from 'vitest'
import { newFacultyAccounts } from '../pages/Admin.jsx'
import { FLAGS } from '../domain/flags.js'

const NOW = Date.parse('2026-11-07T08:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()
const user = (id, email, extra = {}) => ({ id, name: id, email, status: 'Active', emailVerified: true, globalRoles: ['Faculty'], ...extra })

describe('newFacultyAccounts', () => {
  const users = [
    user('fresh', 'test.fresh@hau.edu.ph', { createdAt: daysAgo(1) }),
    user('dean', 'test.dean@hau.edu.ph', { createdAt: daysAgo(2), globalRoles: ['Faculty', 'Dean'] }),
    user('old', 'test.old@hau.edu.ph', { createdAt: daysAgo(FLAGS.NEW_ACCOUNT_DAYS + 1) }),
    user('unverified', 'test.unv@hau.edu.ph', { createdAt: daysAgo(1), status: 'Inactive', emailVerified: false, globalRoles: [] }),
    user('suspended', 'test.sus@hau.edu.ph', { createdAt: daysAgo(1), status: 'Suspended' }),
    user('student', 'test.stu@student.hau.edu.ph', { createdAt: daysAgo(1), globalRoles: ['Student'] }),
  ]
  const list = newFacultyAccounts(users, NOW)

  it('lists active faculty registered within the window, newest first', () => {
    expect(list.map(f => f.user.id)).toEqual(['fresh', 'dean'])
  })
  it('flags only those holding nothing beyond the base Faculty tag', () => {
    expect(Object.fromEntries(list.map(f => [f.user.id, f.needsRole]))).toEqual({ fresh: true, dean: false })
  })
})
