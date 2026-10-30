import { BLANK_FORMS, BlankFormLink } from '../components/FormFiles.jsx'

// F-10 — the blank templates the system stores, for downloading or printing.
// Forms are filled in and signed outside the system and uploaded back where
// the workflow asks for them (E-00/E-01).

export default function BlankForms() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Blank form library</h1>
        <p className="lede">
          Traced from Appendix C (FM-AAC-SOC-2003, 2004, 2005) and the Approval Sheet. The system stores these
          blank templates only for downloading or printing. Forms are filled in and signed outside the system — all
          e-signatures on the PDF or all wet signatures on paper, one way per form — and uploaded back.
        </p>
      </header>
      <ul className="blank-forms">
        {BLANK_FORMS.map(f => (
          <li key={f.code}>
            <strong>{f.code}{f.code !== f.name && <span className="muted"> · {f.name}</span>}</strong>
            <p className="small muted">{f.use}</p>
            <span className="inline">
              <BlankFormLink code={f.code} className="btn small">Download PDF</BlankFormLink>
              {f.url && <a className="btn small" href={f.url} target="_blank" rel="noopener">Open to print</a>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
