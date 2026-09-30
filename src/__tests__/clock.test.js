// NEW-47 — timestamps the prototype writes never repeat, so "after the verdict"
// and "newest version" checks hold when two writes share a millisecond.

import { describe, it, expect } from 'vitest'
import { nowIso } from '../backend/clock.js'

describe('nowIso', () => {
  it('is strictly increasing, even for calls within one millisecond', () => {
    const stamps = Array.from({ length: 2000 }, () => nowIso())
    for (let i = 1; i < stamps.length; i++) expect(stamps[i] > stamps[i - 1], `${i}`).toBe(true)
  })

  it('stays with real time', () => {
    expect(Math.abs(new Date(nowIso()).getTime() - Date.now())).toBeLessThan(5000)
  })
})
