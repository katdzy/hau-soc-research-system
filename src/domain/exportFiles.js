// Table exports (Figma S-18, S-18a, S-18b): the rows a screen shows, as an
// Excel workbook (.xlsx) or a Word document (.docx). Both are Office Open XML
// — a ZIP of XML parts — written here without a library. PDF goes through the
// browser's print dialog (components/Export.jsx). Pure: no DOM, no network.

const enc = new TextEncoder()

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A ZIP archive, stored (no compression): [{ name, text }] → Uint8Array. */
export function zip(entries, date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, text } of entries) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(text)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    locals.push(new Uint8Array(local.buffer), nameBytes, data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, dosTime, true)
    central.setUint16(14, dosDate, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint32(42, offset, true)
    centrals.push(new Uint8Array(central.buffer), nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of parts) { out.set(b, at); at += b.length }
  return out
}

const xml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 forbids (control codes) would make Office refuse the file.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

const column = (i) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const XLSX_TYPES = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * { title, subtitle, header, rows } → .xlsx bytes. The title and subtitle head
 * the sheet (S-18a), then a bold header row and the data; numbers stay numbers.
 */
export function xlsx({ title, subtitle = '', header, rows, sheet = 'Export' }) {
  const lead = [[title], ...(subtitle ? [[subtitle]] : []), []]
  const all = [...lead, header, ...rows]
  const headerRow = lead.length + 1
  const cell = (v, r, c) => {
    const ref = `${column(c)}${r}`
    const style = r === 1 || r === headerRow ? ' s="1"' : ''
    return typeof v === 'number' && Number.isFinite(v)
      ? `<c r="${ref}"${style}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
  }
  const sheetData = all.map((row, i) => `<row r="${i + 1}">${row.map((v, j) => cell(v, i + 1, j)).join('')}</row>`).join('')
  const widths = header.map((_, j) => Math.min(60, Math.max(10, ...[header, ...rows].map(r => String(r[j] ?? '').length + 2))))
  const cols = `<cols>${widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
  return zip([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${XLSX_TYPES}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${XLSX_TYPES}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${XLSX_TYPES}.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetData}</sheetData></worksheet>` },
  ])
}

/** { title, subtitle, header, rows } → .docx bytes: heading, subtitle, a bordered table, landscape (S-18b). */
export function docx({ title, subtitle = '', header, rows }) {
  const run = (text, bold = false) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`
  const para = (text, { bold = false, size } = {}) =>
    `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
  const tc = (v, bold) => `<w:tc><w:p>${run(v, bold)}</w:p></w:tc>`
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
  const table = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map(h => tc(h, true)).join('')}</w:tr>`
    + rows.map(r => `<w:tr>${r.map(v => tc(v)).join('')}</w:tr>`).join('')
    + '</w:tbl>'
  const body = para(title, { bold: true, size: 32 }) + (subtitle ? para(subtitle) : '') + table
    + '<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
  return zip([
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` },
  ])
}

/** A file name for an export: the screen's name and today's date. */
export const exportName = (name, ext, date = new Date()) =>
  `${String(name).replace(/[^\w-]+/g, '_')}_${date.toISOString().slice(0, 10)}.${ext}`
