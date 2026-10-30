// A minimal file that passes inspectPdf: the PDF header, padded to `size`.
// submitDocument reads the bytes themselves, so tests hand it a real File.

const HEADER = new TextEncoder().encode('%PDF-1.4\n')

export function pdfFile(name = 'upload.pdf', size = 1000, type = 'application/pdf') {
  const bytes = new Uint8Array(Math.max(size, HEADER.length))
  bytes.set(HEADER)
  return new File([bytes], name, { type })
}

/** Any other file: no PDF header. */
export const otherFile = (name, type = '', text = 'not a pdf') => new File([text], name, { type })

/** A form signed outside the system, as its signatory uploads it. */
export const signed = (name = 'signed-form.pdf') => pdfFile(name)
