import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { can } from '../../domain/caac.js'
import { submitWeeklyLog, decideWeeklyLog } from '../../services/api.js'
import { useAction, ActionError } from '../useAction.jsx'
import { Section, Empty, Badge, Field, fmtDate, fmtSize, downloadCsv } from '../ui.jsx'
import { FORMS } from '../../domain/constants.js'
import { Act } from '../ViewOnly.jsx'
import { BlankFormLink, StoredFileLink, SignedCopyField, signedCopyReady } from '../FormFiles.jsx'

// FM-AAC-SOC-2003 (Figma S-06, F-01, S-09, M-12/M-13, F-02): the group fills in
// the form with the Adviser and signs it outside the system, then uploads it;
// the Adviser marks the upload as reviewed or returns it with remarks.

const LOG_TONE = { Approved: 'ok', Submitted: 'warn', Returned: 'stop' }
export const LOG_LABEL = { Approved: 'Reviewed by adviser', Submitted: 'Submitted — waiting for adviser', Returned: 'Returned' }

export default function LogsPanel({ b, ctx }) {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [copy, setCopy] = useState(null)
  const [note, setNote] = useState('')
  const [remarks, setRemarks] = useState({})
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? id
  const reviewed = b.weeklyLogs.filter(l => l.status === 'Approved').length
  const logs = [...b.weeklyLogs].reverse()

  // The list of uploads — a supporting document for the separate URO
  // co-authorship process, which itself is out of scope.
  const exportLogs = () => downloadCsv(
    `${FORMS.F2003.code}-${b.project.id}.csv`,
    ['Week', 'Uploaded', 'Uploaded by', 'File', 'Status', 'Reviewed by', 'Reviewed on', 'Adviser remarks'],
    b.weeklyLogs.map(l => [
      l.weekNo, fmtDate(l.submittedAt), nameOf(l.submittedBy), l.fileName ?? '(entry before uploads)',
      LOG_LABEL[l.status] ?? l.status, l.signedBy ? nameOf(l.signedBy) : '', l.signedAt ? fmtDate(l.signedAt) : '', l.adviserRemarks,
    ]),
  )

  return (
    <>
      <Section
        title={`Weekly logs — ${FORMS.F2003.code}`}
        aside={
          <span className="inline">
            <span className="faint small">{reviewed} reviewed of {b.weeklyLogs.length}</span>
            <BlankFormLink code={FORMS.F2003.code} className="btn small">Download blank form</BlankFormLink>
            {can(ctx, 'weeklylog.export') && b.weeklyLogs.length > 0 &&
              <button className="small" onClick={exportLogs}>Export list</button>}
          </span>
        }
      >
        <p className="small muted m-0">
          {can(ctx, 'weeklylog.submit')
            ? <>Forms are never filled in or signed inside the system. Download the blank {FORMS.F2003.code}, complete it with
                your adviser, sign it, and upload it. Your adviser marks it as reviewed or returns it.</>
            : can(ctx, 'weeklylog.sign')
              ? 'Review the forms the group uploads, then mark each as reviewed or return it with remarks.'
              : `The group’s uploaded ${FORMS.F2003.code} forms and the Adviser’s reviews. Read-only.`}
        </p>
        {b.weeklyLogs.length === 0 && <Empty>No logs uploaded yet. Logs start in Capstone 2.</Empty>}
        {logs.map(l => (
          <div className="entry" key={l.id}>
            <div className="entry-head">
              <strong className="text-sm">Week {l.weekNo}</strong>
              <Badge tone={LOG_TONE[l.status]}>{LOG_LABEL[l.status] ?? l.status}</Badge>
            </div>
            <div className="faint small">
              Uploaded {fmtDate(l.submittedAt)} by {nameOf(l.submittedBy)}
            </div>
            {l.storagePath
              ? <div className="copy-row">
                  <span className="mono small">{l.fileName}</span>
                  {l.fileSize && <span className="faint small">{fmtSize(l.fileSize)}</span>}
                  <span className="inline">
                    <StoredFileLink storagePath={l.storagePath} fileName={l.fileName} />
                    <StoredFileLink storagePath={l.storagePath} fileName={l.fileName} download />
                  </span>
                </div>
              : <p className="small m-0 mt-1"><span className="faint">Entry recorded before uploads: </span>{l.activities}</p>}
            {l.storagePath && l.activities && <p className="small muted m-0 mt-half">Note: {l.activities}</p>}

            {l.status !== 'Submitted' && (l.signedAt || l.adviserRemarks) && (
              <div className="small muted mt-1">
                {l.signedAt ? `Reviewed by ${nameOf(l.signedBy)} on ${fmtDate(l.signedAt)}` : 'Returned by the Adviser'}
                {l.adviserRemarks && <> — “{l.adviserRemarks}”</>}
              </div>
            )}

            {l.status === 'Submitted' && can(ctx, 'weeklylog.sign') && <Act>
              <div className="subform">
                <p className="small muted m-0">Open the upload, check it matches your consultation and carries every signature, then decide.</p>
                <Field label="Remarks (required to return)">
                  <input value={remarks[l.id] ?? ''} onChange={e => setRemarks(r => ({ ...r, [l.id]: e.target.value }))}
                    placeholder="e.g. a missing signature" />
                </Field>
                <div className="actions">
                  <button className="primary" disabled={busy}
                    onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: true, remarks: remarks[l.id] }))}>
                    Mark as reviewed
                  </button>
                  <button disabled={busy || !remarks[l.id]?.trim()}
                    onClick={() => run(() => decideWeeklyLog(me, snap, b.project.id, l.id, { approve: false, remarks: remarks[l.id] }))}>
                    Return to preparer
                  </button>
                </div>
              </div>
            </Act>}
          </div>
        ))}
        <ActionError error={error} />
      </Section>

      {can(ctx, 'weeklylog.submit') && <Act>
        <Section title="Upload a filled weekly log">
          <SignedCopyField formType={FORMS.F2003.code} group={b.project.title} value={copy} onChange={setCopy} nameOf={nameOf}
            intro="Write the date and the work updates, then every member and the adviser signs." />
          <Field label="Note to the adviser (optional)">
            <input value={note} onChange={e => setNote(e.target.value)} />
          </Field>
          <button className="primary" disabled={busy || !signedCopyReady(copy)}
            onClick={() => run(async () => {
              await submitWeeklyLog(me, snap, b.project.id, { file: copy.file, note })
              setCopy(null); setNote('')
            })}>
            {busy ? 'Uploading…' : 'Submit to adviser'}
          </button>
          <p className="faint small mt-1">The system doesn’t fill in or sign forms. It stores the file you upload and tells your adviser.</p>
        </Section>
      </Act>}
    </>
  )
}
