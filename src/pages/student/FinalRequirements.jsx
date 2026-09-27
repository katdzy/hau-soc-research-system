import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { myGroup, latestOf } from '../../services/views.js'
import { PageHead, Chip, Empty } from '../../components/blocks.jsx'
import { Section, Badge, docTone, fmtDate } from '../../components/ui.jsx'
import { stageIndex } from '../../domain/stages.js'
import { formOf } from '../../domain/forms.js'
import { DOC_TYPES, FORMS } from '../../domain/constants.js'

// Post-defense clearance from the group's side: the two certificates, the
// final manuscript, and where the Approval Sheet is in its signing order.

const REQUIRED = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE, DOC_TYPES.FINAL_MANUSCRIPT]

export default function FinalRequirements() {
  const { snap, me } = useApp()
  const b = myGroup(snap, me)
  if (!b) return <div className="page"><PageHead title="Final requirements" /><Empty>You are not in a project group yet.</Empty></div>

  const lede = 'English editing, the plagiarism and AI check, then the Approval Sheet: Adviser → Panel → Program Chair/Coordinator → URO → Dean and Associate Dean.'
  if (stageIndex(b.project.currentStage) < stageIndex('CLEARANCE')) {
    return (
      <div className="page">
        <PageHead title="Final requirements" lede={lede} />
        <Empty title="Opens after your final defense revisions">
          Once Instructor 2 closes your final revisions you upload the Editor’s Certificate and the
          Plagiarism Clearance Certificate here, and the Approval Sheet starts circulating.
        </Empty>
      </div>
    )
  }

  const sheet = formOf(b, FORMS.APPROVAL.code)
  const canUpload = b.project.currentStage === 'CLEARANCE'

  return (
    <div className="page">
      <PageHead title="Final requirements" lede={lede} />
      <div className="two-col">
        <Section title="Documents">
          <table>
            <tbody>
              {REQUIRED.map(t => {
                const d = latestOf(b, t)
                return (
                  <tr key={t}>
                    <td>{t}</td>
                    <td>{d ? <Badge tone={docTone(d.status)}>v{d.versionNumber} · {fmtDate(d.submittedAt)}</Badge> : <span className="faint small">Not uploaded</span>}</td>
                    <td className="tight">{canUpload && <Link className="small" to="/submit">{d ? 'Upload a new version' : 'Upload'}</Link>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Approval Sheet">
          {!sheet && <p className="small muted">Not issued yet.</p>}
          {sheet && (
            <ol className="sign-order">
              {[...sheet.signatories].sort((x, y) => x.order - y.order).map((s, i) => (
                <li key={i} className={s.signedAt ? 'is-done' : undefined}>
                  <span>{s.role}</span>
                  <Chip tone={s.signedAt ? 'ok' : undefined}>{s.signedAt ? `Signed ${fmtDate(s.signedAt)}` : 'Pending'}</Chip>
                </li>
              ))}
            </ol>
          )}
          {b.project.archiveResult && <p className="ok-text">Cleared and archived — {b.project.archiveResult}.</p>}
        </Section>
      </div>
    </div>
  )
}
