// "Untitled" groups go by their section and number (Figma S-22: WD-401-2)
// until Instructor 1 registers the approved topic.

import { describe, it, expect } from 'vitest'
import { isUntitled, groupNumberOf, groupCode, nextGroupNumber, projectName, nameProjects } from '../domain/groupNames.js'

const p = (id, title, extra = {}) => ({ id, title, block: 'WD-401', sectionId: 'sec_wd401', createdAt: `2026-08-0${id.at(-1)}T00:00:00Z`, ...extra })

describe('group names', () => {
  const legacy = p('p1', 'Untitled — Group 3 (WD-401)')
  const bare = p('p2', 'Untitled — WD-401')
  const fresh = p('p3', 'WD-401-5', { groupNumber: 5 })
  const titled = p('p4', 'Library Seat Monitor', { topicRegisteredAt: '2026-09-01' })
  const all = [legacy, bare, fresh, titled]

  it('treats blank, "Untitled …" and code titles as untitled; a topic title is not', () => {
    expect([legacy, bare, fresh, p('p5', '')].every(isUntitled)).toBe(true)
    expect(isUntitled(titled)).toBe(false)
  })

  it('reads the number from groupNumber, a legacy title, a code title, or creation order', () => {
    expect(groupNumberOf(fresh, all)).toBe(5)
    expect(groupNumberOf(legacy, all)).toBe(3)
    expect(groupNumberOf(bare, all)).toBe(2) // second group made in the section
    expect(groupNumberOf(p('p6', 'WD-401-7'), [])).toBe(7)
  })

  it('names untitled groups by code and keeps topic titles', () => {
    expect(projectName(legacy, all)).toBe('WD-401-3')
    expect(projectName(titled, all)).toBe('Library Seat Monitor')
    expect(groupCode(titled, all)).toBe('WD-401-4')
    expect(nameProjects(all).map(x => x.title)).toEqual(['WD-401-3', 'WD-401-2', 'WD-401-5', 'Library Seat Monitor'])
  })

  it('gives a new group the next number after the highest in its section', () => {
    expect(nextGroupNumber([])).toBe(1)
    expect(nextGroupNumber(all)).toBe(6)
  })
})
