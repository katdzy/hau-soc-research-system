// Figma 06: phones and tablets held upright are view only. A touch screen
// narrower than 1024px counts; a narrow desktop window and tablet landscape do not.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isViewOnly } from '../components/ViewOnly.jsx'

// A browser whose screen answers media queries like the device described.
const device = ({ width, touch }) => {
  vi.stubGlobal('window', {
    matchMedia: (query) => ({
      matches: query.includes('max-width: 1023px') && query.includes('pointer: coarse') && width <= 1023 && touch,
      addEventListener() {}, removeEventListener() {},
    }),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('isViewOnly', () => {
  it('a phone and an upright tablet are view only', () => {
    device({ width: 390, touch: true })
    expect(isViewOnly()).toBe(true)
    device({ width: 834, touch: true })
    expect(isViewOnly()).toBe(true)
  })
  it('a tablet in landscape and a desktop keep every action', () => {
    device({ width: 1194, touch: true })
    expect(isViewOnly()).toBe(false)
    device({ width: 1440, touch: false })
    expect(isViewOnly()).toBe(false)
  })
  it('a narrow desktop window is not a phone', () => {
    device({ width: 700, touch: false })
    expect(isViewOnly()).toBe(false)
  })
  it('without a browser (tests, server) nothing is view only', () => {
    vi.stubGlobal('window', undefined)
    expect(isViewOnly()).toBe(false)
  })
})
