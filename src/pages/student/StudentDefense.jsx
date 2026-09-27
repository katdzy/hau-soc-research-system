import { useApp } from '../../state/AppContext.jsx'
import { myGroup, nextDeadline } from '../../services/views.js'
import { PageHead, DeadlineTile, Empty } from '../../components/blocks.jsx'
import { Section, Badge, verdictTone, fmtDateTime } from '../../components/ui.jsx'
import { formOf } from '../../domain/forms.js'
import { FORMS } from '../../domain/constants.js'

export default function StudentDefense() {
  const { snap, me } = useApp()
  const b = myGroup(snap, me)
  if (!b) return <div className="page"><PageHead title="Defense" /><Empty>You are not in a project group yet.</Empty></div>

  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const defenses = [...b.defenses].reverse()
  const revision = formOf(b, FORMS.F2004.code)

  return (
    <div className="page">
      <PageHead title="Defense" lede="Schedules, the panel’s verdict and your revision countdown. The verdict is recorded by the Panel Chair only." />
      <div className="two-col wide-left">
        <div>
          {defenses.length === 0 && <Empty>No defense has been scheduled yet. You are emailed when it is.</Empty>}
          {defenses.map(d => (
            <Section key={d.id} title={`${d.type} defense`} aside={<Badge tone={verdictTone(d.verdict)}>{d.verdict ?? 'Scheduled'}</Badge>}>
              <dl className="kv">
                <dt>Date and time</dt><dd>{fmtDateTime(d.scheduledAt)}</dd>
                <dt>Venue or link</dt><dd>{d.venue}</dd>
                {d.instructions && <><dt>Instructions</dt><dd className="small">{d.instructions}</dd></>}
                {d.verdict && <><dt>Recorded by</dt><dd>{nameOf(d.recordedBy)} · {fmtDateTime(d.recordedAt)}</dd></>}
                {d.remarks && <><dt>Required revisions</dt><dd className="small">{d.remarks}</dd></>}
                {d.revisionStatus && <><dt>Revisions</dt><dd>{d.revisionStatus}</dd></>}
              </dl>
            </Section>
          ))}
        </div>
        <aside className="side">
          <DeadlineTile deadline={nextDeadline(b)} />
          {revision && (
            <section className="panel">
              <div className="label">{FORMS.F2004.code} · {FORMS.F2004.name}</div>
              <ol className="plain-list small" style={{ marginTop: 8 }}>
                {[...revision.signatories].sort((x, y) => x.order - y.order).map((s, i) => (
                  <li key={i}>{s.role}: {s.signedAt ? <span className="ok-text">signed</span> : <span className="faint">pending</span>}</li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
