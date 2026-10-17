// Figma PWA-12: a device notification shows only a general line, so a verdict
// or a return is not readable on a locked phone.
import { describe, it, expect } from 'vitest'
import { lockScreenText, NOTICE_TITLE } from '../deviceNotice.js'

describe('lockScreenText', () => {
  it('never carries the email subject or body', () => {
    const mail = { projectId: 'p1', subject: 'Verdict: Re-defense', body: 'The panel recorded Re-defense for WD-401-5.' }
    const text = lockScreenText(mail)
    expect(text).toEqual({ title: NOTICE_TITLE, body: 'Update on your capstone project' })
    expect(JSON.stringify(text)).not.toMatch(/Re-defense|WD-401/)
  })
  it('says "account" for mail that is not about a project', () => {
    expect(lockScreenText({ projectId: null, subject: 'Your account is active' }).body).toBe('Update on your account')
  })
})
