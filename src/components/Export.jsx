// "Export" on any table (Figma S-18): choose Excel, PDF or Word; the file holds
// exactly the rows the screen shows — only records this account can see.

import { useId, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { xlsx, docx, exportName, XLSX_MIME, DOCX_MIME } from '../domain/exportFiles.js'
import { fmtDateTime } from './ui.jsx'

const FORMATS = [
  { key: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { key: 'pdf', label: 'PDF', ext: '.pdf' },
  { key: 'docx', label: 'Word', ext: '.docx' },
]

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function save(bytes, type, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** PDF: the same header and table, printed by the browser (Save as PDF). */
function printTable({ title, subtitle, header, rows }, fileName) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Allow pop-ups for this site to export a PDF.')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileName)}</title><style>
    @page { size: A4 landscape; margin: 14mm; }
    body { font: 10pt/1.35 Georgia, "Times New Roman", serif; color: #000; }
    h1 { font-size: 15pt; margin: 0 0 2pt; } p { margin: 0 0 10pt; color: #333; }
    .org { font: 600 8pt/1.2 Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6pt; }
    table { width: 100%; border-collapse: collapse; font: 9pt/1.3 Arial, sans-serif; }
    th, td { border: .6pt solid #999; padding: 4pt 5pt; text-align: left; vertical-align: top; }
    th { background: #eee; } thead { display: table-header-group; }
    .foot { margin-top: 8pt; font: 8pt Arial, sans-serif; color: #555; }
  </style></head><body>
    <div class="org">Holy Angel University · School of Computing</div>
    <h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
    <table><thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="foot">Contains only records visible to the requesting account.</div>
  </body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

/**
 * `name` names the file; `title` heads it; `header` and `rows` are the table
 * as shown (strings or numbers).
 */
export function ExportMenu({ name, title, header, rows, label = 'Export' }) {
  const { me } = useApp()
  const [format, setFormat] = useState('xlsx')
  const [error, setError] = useState('')
  const id = useId()
  const fmt = FORMATS.find(f => f.key === format)
  const fileName = exportName(name, fmt.key)
  const subtitle = `Exported ${fmtDateTime(new Date().toISOString())} by ${me?.name ?? '—'}`

  const run = () => {
    setError('')
    const table = { title, subtitle, header, rows }
    try {
      if (format === 'xlsx') save(xlsx(table), XLSX_MIME, fileName)
      else if (format === 'docx') save(docx(table), DOCX_MIME, fileName)
      else printTable(table, fileName)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <details className="export-menu">
      <summary className="btn small">{label}</summary>
      <div className="export-pop" role="group" aria-labelledby={`${id}-h`}>
        <div className="label" id={`${id}-h`}>Export list</div>
        <fieldset className="choice export-formats">
          <legend className="sr-only">Format</legend>
          {FORMATS.map(f => (
            <label key={f.key} className="inline small">
              <input type="radio" name={`${id}-format`} checked={format === f.key} onChange={() => setFormat(f.key)} />
              {f.label} <span className="faint mono">{f.ext}</span>
            </label>
          ))}
        </fieldset>
        <p className="small m-0">{rows.length} row{rows.length === 1 ? '' : 's'} · {header.join(', ')}</p>
        <p className="mono small faint m-0 mt-half">{format === 'pdf' ? 'Opens the print dialog — choose “Save as PDF”.' : fileName}</p>
        <p className="faint small m-0 mt-half">Only records you can see are exported.</p>
        <button className="primary small mt-1" onClick={run}>Export</button>
        {error && <p className="small error-text mt-half" role="alert">{error}</p>}
      </div>
    </details>
  )
}
