import { useEffect, useRef, useState } from 'react'
import { files } from '../backend/index.js'
import { sampleFileFor } from '../backend/sampleFiles.js'

// Renders a submitted PDF with pdf.js and draws annotations over it. Nothing
// here writes to the file: marks are positioned boxes in a layer above the
// page, in page fractions (domain/annotations.js), so they land in the same
// place at any width or zoom.
//
// Reviewers mark a place in one of two ways — select words in the text layer,
// or switch to "Mark area" and drag a box (figures, tables, scanned pages).
// The mark becomes a draft; the annotation form beside the viewer saves it.

// The legacy build carries the polyfills the modern one expects from very
// recent browsers. Loaded on first use, so the rest of the app never pays for it.
let pdfjs = null
async function loadPdfjs() {
  if (pdfjs) return pdfjs
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  pdfjs = lib
  return lib
}

// The viewer's TextLayerBuilder, not the bare TextLayer: it adds the
// `endOfContent` element and the `selecting` state that keep a mouse drag from
// jumping to the whole page when it crosses the gaps between lines. It reads
// the library from `globalThis.pdfjsLib`.
let viewerLib = null
async function loadTextLayerBuilder() {
  const lib = await loadPdfjs()
  globalThis.pdfjsLib ??= lib
  viewerLib ??= await import('pdfjs-dist/legacy/web/pdf_viewer.mjs')
  return viewerLib.TextLayerBuilder
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2]

/** Where the bytes of this version come from: the file store, else a sample. */
async function sourceOf(doc) {
  if (doc.storagePath) {
    const url = await files.url(doc.storagePath)
    if (url) return { url, sample: false }
  }
  const sample = await sampleFileFor(doc)
  return sample ? { url: sample.url, sample: true, fileName: sample.fileName } : null
}

export default function ManuscriptViewer({ doc, marks, draft, onDraft, canMark, focus, onFocus }) {
  const [state, setState] = useState({ status: 'loading' })
  const [mode, setMode] = useState('text')
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const scroller = useRef(null)

  useEffect(() => {
    let cancelled = false
    let loaded = null
    setState({ status: 'loading' })
    ;(async () => {
      const source = await sourceOf(doc)
      if (!source) return setState({ status: 'missing' })
      const lib = await loadPdfjs()
      loaded = await lib.getDocument({ url: source.url }).promise
      if (cancelled) return loaded.destroy()
      const first = await loaded.getPage(1)
      const base = first.getViewport({ scale: 1 })
      setState({ status: 'ready', pdf: loaded, pages: loaded.numPages, ratio: base.height / base.width, source })
    })().catch(err => { if (!cancelled) setState({ status: 'error', message: err?.message ?? String(err) }) })
    return () => { cancelled = true; loaded?.destroy() }
  }, [doc.id, doc.storagePath])

  // Pages fit the viewer's width; zoom scales from there.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // Measure now as well: ResizeObserver only reports on a rendered frame,
    // which a background tab may not produce.
    setWidth(el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) * 2)
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state.status])

  // Jump to an annotation picked from the list.
  useEffect(() => {
    if (!focus || !scroller.current) return
    const el = scroller.current.querySelector(`[data-mark="${focus}"]`)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }, [focus])

  // Drop the draft when switching tools, so a half-made mark never lingers.
  const pick = (m) => { setMode(m); onDraft?.(null) }

  // A drag often ends outside the page (past the margin, over the notes), so
  // listen on the document; captureSelection keeps only selections that start
  // on a page in this viewer.
  const capture = useRef(null)
  capture.current = captureSelection
  useEffect(() => {
    const onUp = () => capture.current()
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  function captureSelection() {
    if (!canMark || mode !== 'text') return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const pageEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)
      ?.closest('[data-page]')
    if (!pageEl || !scroller.current?.contains(pageEl)) return
    const box = pageEl.getBoundingClientRect()
    // A selection that runs onto the next page is kept to the page it starts on.
    const rects = mergeLines([...range.getClientRects()]
      .map(r => clipTo(r, box))
      .filter(Boolean)
      .map(r => ({ x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height })))
    const quote = sel.toString().replace(/\s+/g, ' ').trim()
    if (!rects.length || !quote) return
    sel.removeAllRanges()
    onDraft({ kind: 'text', page: Number(pageEl.dataset.page), rects, quote })
  }

  if (state.status === 'loading') return <div className="viewer-status">Opening the file…</div>
  if (state.status === 'missing') {
    return <div className="viewer-status">The file for this version is not in this browser’s file store. Annotations still work as general comments.</div>
  }
  if (state.status === 'error') return <div className="viewer-status" role="alert">The file could not be opened: {state.message}</div>

  const pageWidth = Math.max(240, Math.round(width * zoom))
  const zi = ZOOMS.indexOf(zoom)

  return (
    <div className="viewer">
      <div className="viewer-bar">
        {canMark && (
          <div className="seg" role="group" aria-label="Marking tool">
            <button aria-pressed={mode === 'text'} onClick={() => pick('text')}>Select text</button>
            <button aria-pressed={mode === 'area'} onClick={() => pick('area')}>Mark area</button>
          </div>
        )}
        <span className="faint small mono">{state.pages} {state.pages === 1 ? 'page' : 'pages'}</span>
        <span className="viewer-zoom">
          <button aria-label="Zoom out" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])}>−</button>
          <span className="mono small" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])}>+</button>
        </span>
      </div>
      {state.source.sample && (
        <p className="viewer-sample small">
          Sample file. This seeded version was never uploaded, so the matching dummy PDF
          (<span className="mono">{state.source.fileName}</span>) stands in for it.
        </p>
      )}
      {/* Mouse, keyboard (Shift+arrows with caret browsing) and touch selections all end here;
          on touch the selection handles settle just after the finger lifts. */}
      <div className={`viewer-pages${canMark ? ` is-${mode}` : ''}`} ref={scroller}
        onMouseDown={selectFromGap} onKeyUp={captureSelection} onTouchEnd={() => setTimeout(captureSelection, 350)}>
        {width > 0 && Array.from({ length: state.pages }, (_, i) => i + 1).map(n => (
          <PdfPage key={n} pdf={state.pdf} n={n} width={pageWidth} ratio={state.ratio}
            marks={marks.filter(m => m.position?.page === n)}
            draft={draft?.page === n ? draft : null}
            areaMode={canMark && mode === 'area'} onDraft={onDraft} onFocus={onFocus} focus={focus} />
        ))}
      </div>
    </div>
  )
}

function PdfPage({ pdf, n, width, ratio, marks, draft, areaMode, onDraft, onFocus, focus }) {
  const holder = useRef(null)
  const canvas = useRef(null)
  const text = useRef(null) // the text layer's host; pdf.js puts its own .textLayer in it
  const [visible, setVisible] = useState(false)
  const [height, setHeight] = useState(Math.round(width * ratio))
  const [drag, setDrag] = useState(null)

  // Draw only pages near the viewport, and drop the ones scrolled far away:
  // an 80-page manuscript kept drawn at 2× density would hold ~800 MB of canvas.
  useEffect(() => {
    // Rooted on the viewer's own scroll box: against the window, the margin
    // never applies (the box clips the pages first), so a page only started
    // drawing once it was already on screen.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: holder.current.closest('.viewer-pages'), rootMargin: '1200px 0px',
    })
    io.observe(holder.current)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) {
      if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0 }
      text.current?.replaceChildren()
      return
    }
    let task = null
    let layer = null
    let cancelled = false
    ;(async () => {
      const TextLayerBuilder = await loadTextLayerBuilder()
      const page = await pdf.getPage(n)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      setHeight(Math.round(viewport.height))
      const dpr = window.devicePixelRatio || 1
      const c = canvas.current
      c.width = Math.floor(viewport.width * dpr)
      c.height = Math.floor(viewport.height * dpr)
      task = page.render({ canvasContext: c.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null })
      await task.promise
      if (cancelled) return
      layer = new TextLayerBuilder({
        pdfPage: page,
        onAppend: (div) => {
          div.style.setProperty('--total-scale-factor', String(viewport.scale))
          text.current?.replaceChildren(div)
        },
      })
      await layer.render({ viewport })
    })().catch(err => { if (err?.name !== 'RenderingCancelledException' && !cancelled) console.warn(err) })
    return () => { cancelled = true; task?.cancel(); layer?.cancel() }
  }, [visible, width, pdf, n])

  const at = (e) => {
    const box = holder.current.getBoundingClientRect()
    return { x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) }
  }
  const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

  return (
    <div className="pdf-page" data-page={n} ref={holder} style={{ width, height }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} aria-hidden="true" />
      <div className="text-host" ref={text} />
      <div className="page-marks">
        {marks.map(m => (
          <div key={m.id} data-mark={m.id} className={`mark is-${m.position.kind} is-${m.visibility}${focus === m.id ? ' is-focus' : ''}`}>
            {m.position.rects.map((r, i) => <span key={i} className="mark-rect" style={box(r)} />)}
            <button className="mark-tag" style={{ left: `${m.position.rects[0].x * 100}%`, top: `${m.position.rects[0].y * 100}%` }}
              aria-label={`Annotation ${m.n} on page ${n}`} onClick={() => onFocus(m.id)}>{m.n}</button>
          </div>
        ))}
        {draft && (
          <div className={`mark is-draft is-${draft.kind}`}>
            {draft.rects.map((r, i) => <span key={i} className="mark-rect" style={box(r)} />)}
          </div>
        )}
        {drag && <div className="mark is-draft is-area"><span className="mark-rect" style={box(rectOf(drag.from, drag.to))} /></div>}
      </div>
      {areaMode && (
        <div className="area-capture"
          onPointerDown={e => {
            // Keeps the drag when the pointer leaves the page; scripted events have no live pointer to capture.
            try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no active pointer */ }
            const p = at(e)
            setDrag({ from: p, to: p })
          }}
          onPointerMove={e => drag && setDrag({ ...drag, to: at(e) })}
          onPointerUp={() => {
            if (!drag) return
            const r = rectOf(drag.from, drag.to)
            setDrag(null)
            // Ignore a click; a mark needs some size.
            if (r.w > 0.01 && r.h > 0.01) onDraft({ kind: 'area', page: n, rects: [r], quote: '' })
          }} />
      )}
      <span className="page-no mono">{n}</span>
    </div>
  )
}

const clamp = (v) => Math.min(1, Math.max(0, v))
const pct = (v) => `${v * 100}%`
const box = (r) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) })

function clipTo(r, page) {
  const left = Math.max(r.left, page.left)
  const top = Math.max(r.top, page.top)
  const right = Math.min(r.right, page.right)
  const bottom = Math.min(r.bottom, page.bottom)
  if (right - left < 1 || bottom - top < 1) return null
  return { left, top, width: right - left, height: bottom - top }
}

/** One box per line: the text layer yields a rect per span, often overlapping. */
function mergeLines(rects) {
  const lines = []
  for (const r of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(l => Math.abs(l.y + l.h / 2 - (r.y + r.h / 2)) < Math.min(l.h, r.h) / 2)
    if (!line) { lines.push({ ...r }); continue }
    const x2 = Math.max(line.x + line.w, r.x + r.w)
    const y2 = Math.max(line.y + line.h, r.y + r.h)
    line.x = Math.min(line.x, r.x); line.y = Math.min(line.y, r.y)
    line.w = x2 - line.x; line.h = y2 - line.y
  }
  return lines.map(l => ({ x: clamp(l.x), y: clamp(l.y), w: Math.min(l.w, 1 - clamp(l.x)), h: Math.min(l.h, 1 - clamp(l.y)) }))
}

// A drag that starts on a word is the browser's own selection. One that starts
// in blank space — the margin, the gap between columns or lines — lands on the
// text layer itself; pdf.js then spreads its non-selectable `endOfContent`
// across the page and the drag selects nothing. So for those, anchor the
// selection at the nearest word and extend it with the pointer ourselves.
function selectFromGap(e) {
  if (e.button !== 0 || e.shiftKey || e.detail > 1) return
  const layer = e.target.closest?.('.textLayer')
  if (!layer || textSpan(e.target)) return
  // Rotated text (a diagonal watermark) has a box as big as the page; leave it out.
  const words = [...layer.querySelectorAll('span')].filter(el => textSpan(el) && !el.style.getPropertyValue('--rotate'))
  if (!words.length) return
  e.preventDefault()
  const sel = window.getSelection()
  const anchor = nearestCaret(words, e.clientX, e.clientY)
  sel.setBaseAndExtent(anchor.node, anchor.offset, anchor.node, anchor.offset)
  const move = (m) => {
    const focus = caretAt(words, m.clientX, m.clientY)
    sel.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
  }
  const up = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

/** A text-layer span holding words (not a markedContent wrapper, not a blank). */
function textSpan(el) {
  return el?.tagName === 'SPAN' && el.firstChild?.nodeType === 3 && el.textContent.trim() !== ''
}

/** Caret under the pointer when it is over a word, else the nearest word's edge. */
function caretAt(words, x, y) {
  const pos = document.caretPositionFromPoint?.(x, y)
  const range = pos ? null : document.caretRangeFromPoint?.(x, y) // Safari before 18.4
  const node = pos ? pos.offsetNode : range?.startContainer
  const offset = pos ? pos.offset : range?.startOffset
  if (node?.nodeType === 3 && words.includes(node.parentElement)) return { node, offset }
  return nearestCaret(words, x, y)
}

/** The start or end of the closest word: on the pointer's line if there is one, else the nearest line. */
function nearestCaret(words, x, y) {
  let best = null
  for (const el of words) {
    const r = el.getBoundingClientRect()
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    // Vertical distance first: a word on the same line beats a closer one above or below.
    const score = dy * 1e4 + dx
    if (!best || score < best.score) best = { score, el, after: x > r.left + r.width / 2 }
  }
  const node = best.el.firstChild
  return { node, offset: best.after ? node.length : 0 }
}
