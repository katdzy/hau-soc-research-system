// JavaScript for Automation (osascript -l JavaScript) — macOS PDFKit helpers
// for generate.mjs, so no PDF library is needed.
//   osascript -l JavaScript pdfkit.js text  <pdf>              → page texts, separated by \f
//   osascript -l JavaScript pdfkit.js merge <out> <in1> <in2>… → one PDF
ObjC.import('PDFKit')

function open(path) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(path))
  if (!doc || doc.isNil()) throw new Error(`Cannot open ${path}`)
  return doc
}

function run(argv) {
  const [cmd, ...rest] = argv
  if (cmd === 'text') {
    const doc = open(rest[0])
    const pages = []
    for (let i = 0; i < doc.pageCount; i++) pages.push(ObjC.unwrap(doc.pageAtIndex(i).string) || '')
    return pages.join('\f')
  }
  if (cmd === 'merge') {
    const [out, first, ...others] = rest
    const doc = open(first)
    for (const path of others) {
      const other = open(path)
      for (let i = 0; i < other.pageCount; i++) doc.insertPageAtIndex(other.pageAtIndex(i).copy, doc.pageCount)
    }
    if (!doc.writeToFile(out)) throw new Error(`Cannot write ${out}`)
    return `${doc.pageCount}`
  }
  throw new Error(`Unknown command ${cmd}`)
}
