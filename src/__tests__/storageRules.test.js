// storage.rules keeps its own copy of which PDF types each stage accepts
// (pdfTypesAt). Rules cannot import caac.js, so this test holds the two in step.
// The rules' behaviour itself is tested against the emulator: npm run test:rules.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { STAGES } from '../domain/stages.js'
import { allowedDocTypes } from '../domain/caac.js'
import { DOC_TYPES, LINK_TYPES, MAX_PDF_MB } from '../domain/constants.js'

const rules = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8')

function rulesMap() {
  const body = rules.match(/function pdfTypesAt\(stage\) \{\s*return \{([\s\S]*?)\}\.get\(stage, \[\]\);/)?.[1]
  if (!body) throw new Error('pdfTypesAt() not found in storage.rules')
  const list = (s) => [...s.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2])
  return Object.fromEntries([...body.matchAll(/'([A-Z_]+)':\s*\[([^\]]*)\]/g)].map(([, stage, types]) => [stage, list(types)]))
}

describe('storage.rules', () => {
  it('accepts the same PDF types per stage as caac.js', () => {
    // At URO_VERIFICATION caac.js lists only what was returned; the rules allow both certificates.
    const uro = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE]
    const expected = Object.fromEntries(STAGES.map(s => s.key)
      .map(id => [id, id === 'URO_VERIFICATION' ? uro : allowedDocTypes(id).filter(t => !LINK_TYPES.includes(t))])
      .filter(([, types]) => types.length))
    expect(rulesMap()).toEqual(expected)
  })

  it(`caps a file at MAX_PDF_MB (${MAX_PDF_MB} MB)`, () => {
    expect(rules).toContain(`request.resource.size <= ${MAX_PDF_MB} * 1024 * 1024`)
  })
})
