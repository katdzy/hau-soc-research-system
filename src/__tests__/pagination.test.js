// Paging helpers behind the User accounts list (components/ui.jsx).
import { describe, it, expect } from 'vitest'
import { pageList, paginate } from '../components/ui.jsx'

describe('pageList', () => {
  it('shows every page up to seven', () => {
    expect(pageList(1, 1)).toEqual([1])
    expect(pageList(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('keeps first, last and the pages around the current one', () => {
    expect(pageList(1, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(pageList(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12])
    expect(pageList(12, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
  })
})

describe('paginate', () => {
  const list = Array.from({ length: 23 }, (_, i) => i)
  it('slices one page', () => {
    expect(paginate(list, 3, 10)).toEqual({ pages: 3, page: 3, rows: [20, 21, 22] })
  })
  it('clamps a page past the end when the list shrinks', () => {
    expect(paginate(list.slice(0, 5), 3, 10)).toEqual({ pages: 1, page: 1, rows: [0, 1, 2, 3, 4] })
  })
  it('gives one empty page for an empty list', () => {
    expect(paginate([], 1, 10)).toEqual({ pages: 1, page: 1, rows: [] })
  })
})
