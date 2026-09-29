// Where an annotation sits on the manuscript (OQ#12 — the data dictionary has
// no position field; mockup default below). The PDF is never written to: a
// position is stored on the annotation and drawn over the page as an overlay.
//
//   position = {
//     kind:  'text' | 'area',   selected text, or a box dragged on the page
//     page:  1-based page number
//     rects: [{ x, y, w, h }],  fractions of the page box (0–1), so they hold
//                               at any zoom and on any screen
//     quote: 'the selected words' ('' for an area)
//   }
//
// A null position is a general comment on the whole version.

export const MAX_RECTS = 40
export const MAX_QUOTE = 400

const unit = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1

/** A clean copy of a position, or throws a message the reviewer can act on. */
export function normalizePosition(position) {
  if (position == null) return null
  const { kind, page, rects, quote } = position
  if (!['text', 'area'].includes(kind)) throw new Error('Unknown annotation type.')
  if (!Number.isInteger(page) || page < 1) throw new Error('The annotation has no page.')
  if (!Array.isArray(rects) || rects.length === 0) throw new Error('Mark a passage or an area on the page first.')
  if (rects.length > MAX_RECTS) throw new Error('Mark a shorter passage — split it into several annotations.')
  const clean = rects.map(r => {
    if (![r?.x, r?.y, r?.w, r?.h].every(unit) || r.x + r.w > 1.0001 || r.y + r.h > 1.0001) {
      throw new Error('The marked area falls outside the page.')
    }
    const round = (n) => Math.round(n * 10000) / 10000
    return { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }
  })
  const text = String(quote ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE)
  if (kind === 'text' && !text) throw new Error('Select the words you want to comment on.')
  return { kind, page, rects: clean, quote: kind === 'text' ? text : '' }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The short "where" line shown with an annotation, e.g. p. 12 · “purposive sampling…”. */
export function anchorOf(position, fallback = 'General') {
  if (!position) return fallback || 'General'
  const where = `p. ${position.page}`
  return position.kind === 'text' ? `${where} · “${clip(position.quote, 60)}”` : `${where} · marked area`
}
