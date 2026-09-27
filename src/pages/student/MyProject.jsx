import { useApp } from '../../state/AppContext.jsx'
import { myGroup, progressTrail } from '../../services/views.js'
import { PageHead, ProgressTrail, Empty } from '../../components/blocks.jsx'
import { Section, Badge, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import { stageByKey, stageLabel } from '../../domain/stages.js'

export default function MyProject() {
  const { snap, me } = useApp()
  const b = myGroup(snap, me)
  if (!b) return <div className="page"><PageHead title="My project" /><Empty>You are not in a project group yet.</Empty></div>

  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id
  const stage = stageByKey(b.project.currentStage)

  return (
    <div className="page">
      <PageHead eyebrow={b.project.groupName} title={b.project.title} lede={stage?.blurb} />

      <section className="panel" style={{ marginBottom: 40 }}>
        <ProgressTrail trail={progressTrail(b, snap)} />
      </section>

      <div className="two-col">
        <div>
          <Section title="Project record">
            <dl className="kv">
              <dt>Stage</dt><dd>{stageLabel(b.project.currentStage)}</dd>
              {b.project.previousTitles?.length > 0 && <><dt>Previous titles</dt><dd className="small muted">{b.project.previousTitles.join(' · ')}</dd></>}
              <dt>Program</dt><dd>{b.project.program}</dd>
              <dt>Block</dt><dd>{b.project.block}</dd>
              <dt>Research area</dt><dd>{b.project.researchArea}</dd>
              <dt>Academic term</dt><dd>{b.project.term}</dd>
              <dt>Registered</dt><dd>{fmtDate(b.project.createdAt)}</dd>
            </dl>
          </Section>

          <Section title="Group members">
            <table>
              <thead><tr><th>Student</th><th>Student number</th><th>Year and block</th></tr></thead>
              <tbody>
                {b.members.map(m => {
                  const u = users.find(x => x.id === m.userId)
                  return (
                    <tr key={m.id}>
                      <td>{u?.name}{u?.id === me.id && <span className="faint small"> (you)</span>}</td>
                      <td className="mono muted">{u?.idNumber || '—'}</td>
                      <td className="small muted">{u?.yearLevel} · {u?.block}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>

          <Section title="Faculty">
            {b.assignments.length === 0 && <p className="small muted">No faculty assigned yet.</p>}
            <table>
              <tbody>
                {b.assignments.map(a => (
                  <tr key={a.id}><td><Badge tone="accent">{a.roleType}</Badge></td><td>{nameOf(a.userId)}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>

        <Section title="Workflow history">
          {[...b.history].reverse().map(h => (
            <div className="entry" key={h.id}>
              <div className="entry-head">
                <strong className="small">{h.fromStage ? `${stageLabel(h.fromStage)} → ` : ''}{stageLabel(h.toStage)}</strong>
                <span className="faint small">{fmtDateTime(h.at)}</span>
              </div>
              <div className="small muted">{nameOf(h.actorId)}</div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  )
}
