// One way to count steps on every screen (group card, project timeline,
// progress trail): step n of the course's steps; Archived is the end, not a step.
import { describe, it, expect } from 'vitest'
import { courseStep, stepText, STAGES } from '../domain/stages.js'
import { COURSES } from '../domain/constants.js'

describe('courseStep / stepText', () => {
  it('counts Capstone 1 as 9 steps and Capstone 2 as 8', () => {
    expect(courseStep('GROUP_FORMATION')).toMatchObject({ course: COURSES.C1, n: 1, of: 9 })
    expect(courseStep('ADVISER_ASSIGNMENT')).toMatchObject({ n: 2, of: 9 })
    expect(courseStep('PROPOSAL_REVISION')).toMatchObject({ n: 9, of: 9 })
    expect(courseStep('IMPLEMENTATION')).toMatchObject({ course: COURSES.C2, n: 1, of: 8 })
    expect(courseStep('FINAL_APPROVAL')).toMatchObject({ n: 8, of: 8 })
  })

  it('reads "Step n of m", and "Completed" once archived', () => {
    expect(stepText('ADVISER_ASSIGNMENT')).toBe('Step 2 of 9')
    expect(stepText('ARCHIVED')).toBe('Completed')
  })

  it('places every stage but Archived', () => {
    for (const s of STAGES.filter(x => x.key !== 'ARCHIVED')) expect(courseStep(s.key).n).toBeGreaterThan(0)
  })
})
