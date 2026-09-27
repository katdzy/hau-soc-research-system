import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import { visibleProjects, currentVersion, latestOf, daysUntil } from '../../services/views.js'
import { submitEvaluation, recordVerdict, defenseTypeAt } from '../../services/actions.js'
import { can } from '../../domain/caac.js'
import { stageLabel, pendingEvaluators } from '../../domain/stages.js'
import { formOf } from '../../domain/forms.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { PageHead, Chip, ProjectPicker, useProjectPick, StatTile, Empty } from '../../components/blocks.jsx'
import { Field, Badge, docTone, fmtDate, fmtDateTime } from '../../components/ui.jsx'
import {
  PANEL_ROLES, PANEL_RECOMMENDATIONS, VERDICTS, REVISION_WINDOW_DAYS, FORMS, DOC_TYPES, AI_MILESTONES,
} from '../../domain/constants.js'

// Panel Member and Panel Chair contexts (wireframes S-10, S-11).

const openDefenseOf = (b) => b.defenses.find(d => !d.verdict) ?? null
const myEvaluation = (b, me) => {
  const d = openDefenseOf(b)
  return d ? b.evaluations.find(e => e.defenseId === d.id && e.panelistId === me.id) : null
}

export function PanelDashboard() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me)
  const upcoming = rows.filter(r => openDefenseOf(r.b))
  const evalDue = rows.filter(r => can(r.ctx, 'evaluation.submit') && !myEvaluation(r.b, me)).length
  const signDue = rows.filter(r => r.b.forms.some(f => f.signatories.some(s => s.userId === me.id && !s.signedAt && !s.viaGate))).length

  return (
    <div className="page">
      <PageHead title="Dashboard" lede={`${me.actingAs} on ${rows.length} group${rows.length === 1 ? '' : 's'}.`} />
      <div className="stat-row">
        <StatTile label="Upcoming defenses" value={upcoming.length} />
        <StatTile label="Evaluations to submit" value={evalDue} note={<Link to="/evaluation">Evaluation form</Link>} />
        <StatTile label="Revision forms to sign" value={signDue} note={<Link to="/revisions">Revision confirmation</Link>} />
      </div>
      <AssignedTable rows={rows} />
    </div>
  )
}

function AssignedTable({ rows }) {
  const { me } = useApp()
  if (rows.length === 0) return <Empty>You are not on any panel at a stage that involves the panel.</Empty>
  return (
    <div className="panel flush">
      <div className="table-scroll"><table>
        <thead><tr><th>Group / Project</th><th>Stage</th><th>Defense</th><th>Your evaluation</th><th className="tight" /></tr></thead>
        <tbody>
          {rows.map(({ b, ctx }) => {
            const d = openDefenseOf(b)
            const ev = myEvaluation(b, me)
            return (
              <tr key={b.project.id}>
                <td><strong>{b.project.groupName}</strong><div className="small muted clamp-2">{b.project.title}</div></td>
                <td className="small">{stageLabel(b.project.currentStage)}</td>
                <td className="small">{d ? `${d.type} · ${fmtDateTime(d.scheduledAt)}` : <span className="faint">—</span>}</td>
                <td>{ev ? <Chip tone="ok">Submitted</Chip> : can(ctx, 'evaluation.submit') ? <Chip tone="warn">Due</Chip> : <span className="faint small">—</span>}</td>
                <td className="tight"><Link className="btn small" to={`/summaries?p=${b.project.id}`}>Defense pack</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </div>
  )
}

export function AssignedPanels() {
  const { snap, me } = useApp()
  return (
    <div className="page">
      <PageHead title="Assigned panels" lede="Panel access opens at Panel Assignment. You see the current version of each document only." />
      <AssignedTable rows={visibleProjects(snap, me)} />
    </div>
  )
}

export function Manuscripts() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me).map(r => ({ ...r, v: currentVersion(r.b) })).filter(r => r.v)
  return (
    <div className="page">
      <PageHead title="Manuscripts" lede="The version under evaluation for each of your panels. Your annotations stay private until the verdict is recorded." />
      {rows.length === 0 ? <Empty>No manuscripts to evaluate.</Empty> : (
        <div className="panel flush">
          <table>
            <thead><tr><th>Group</th><th>Version</th><th>Status</th><th className="tight" /></tr></thead>
            <tbody>
              {rows.map(({ b, ctx, v }) => (
                <tr key={b.project.id}>
                  <td><strong>{b.project.groupName}</strong><div className="small muted clamp-2">{b.project.title}</div></td>
                  <td className="small">{v.docType} v{v.versionNumber}{v.scope ? ` · ${v.scope}` : ''}</td>
                  <td><Badge tone={docTone(v.status)}>{v.status}</Badge></td>
                  <td className="tight"><Link className="btn small" to={`/review/${v.id}`}>{can(ctx, 'document.annotate') ? 'Annotate' : 'Read'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Wireframe S-10 — the defense pack with the AI summary. */
export function DefensePack() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me)
  const [current, pick] = useProjectPick(rows)
  if (!current) return <div className="page"><PageHead title="AI summaries" /><Empty>No panels at a stage that involves you.</Empty></div>

  const { b } = current
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const d = openDefenseOf(b) ?? b.defenses.at(-1)
  const summary = [...b.aiSummaries].sort((x, y) => new Date(y.generatedAt) - new Date(x.generatedAt))[0]
  const manuscript = summary ? b.documents.find(x => x.id === summary.documentId) : currentVersion(b)
  const video = latestOf(b, DOC_TYPES.PRESENTATION_VIDEO)
  const names = (role) => b.assignments.filter(a => a.roleType === role).map(a => nameOf(a.userId)).join(', ') || '—'
  const sections = summary ? [
    ['Research problem', summary.structured.problemStatement],
    ['Objectives', summary.structured.objectives],
    ['Methodology and research design', summary.structured.methodology],
    ['Scope and delimitations', summary.structured.scope],
    ['Stated contribution', summary.structured.contributions],
  ] : []

  return (
    <div className="page page-wide">
      <PageHead
        title={`${d?.type ?? 'Defense'} defense pack — ${b.project.groupName}${manuscript ? `, v${manuscript.versionNumber}` : ''}`}
        lede="Prepared for the scheduled defense. Your annotations stay private to you until the verdict is recorded."
      >
        <ProjectPicker rows={rows} current={current} onPick={pick} />
      </PageHead>
      <div className="two-col wide-left">
        <div>
          {summary ? (
            <section className="panel flush">
              <div className="ai-banner">
                <div>
                  <div className="label">AI-generated summary</div>
                  <p className="small" style={{ margin: '4px 0 0' }}>{summary.label}</p>
                </div>
                <Chip>Generated from v{summary.documentVersion}</Chip>
              </div>
              <div className="padded">
                {sections.map(([h, t]) => (
                  <div key={h} className="ai-section"><h3>{h}</h3><p className="small">{t}</p></div>
                ))}
              </div>
            </section>
          ) : (
            <Empty title="No AI summary yet">It is generated automatically from the complete manuscript when the defense is scheduled.</Empty>
          )}
          {summary && (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="panel-head"><h2>AI transparency and handling</h2></div>
              <dl className="kv">
                <dt>Source version</dt><dd>v{summary.documentVersion} — {manuscript ? `submitted ${fmtDate(manuscript.submittedAt)}` : ''} (complete manuscript)</dd>
                <dt>Generated</dt><dd>{fmtDateTime(summary.generatedAt)} · once per defense milestone, never per revision</dd>
                <dt>Human review</dt><dd>Required. The AI never approves, grades or issues a verdict.</dd>
                <dt>Data handling</dt><dd>Google Gemini Flash API on a paid tier — the manuscript is not used for model training or human review; each transmission is logged to the audit trail.</dd>
              </dl>
            </section>
          )}
        </div>
        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Defense details</h2></div>
            <dl className="kv kv-stack">
              <dt>Type</dt><dd>{d ? `${d.type} defense` : '—'}</dd>
              <dt>Date and time</dt><dd>{d ? fmtDateTime(d.scheduledAt) : 'Not scheduled'}</dd>
              <dt>Venue</dt><dd>{d?.venue ?? '—'}</dd>
              <dt>Panel Chair</dt><dd>{names(PANEL_ROLES[0])}</dd>
              <dt>Panel Members</dt><dd>{names(PANEL_ROLES[1])}</dd>
              <dt>Adviser</dt><dd>{names('Adviser')}</dd>
            </dl>
          </section>
          {manuscript && <Link className="btn primary block" to={`/review/${manuscript.id}`}>Open manuscript (v{manuscript.versionNumber})</Link>}
          <Link className="btn block" to={`/evaluation?p=${b.project.id}`}>Open evaluation form</Link>
          {video?.link
            ? <a className="btn block" href={video.link} target="_blank" rel="noreferrer noopener">Open presentation video link</a>
            : <span className="btn block is-disabled" aria-disabled="true">No presentation video link yet</span>}
          <section className="note"><strong>Your annotations are private.</strong> Visible only to you until the defense concludes — they inform the questions you raise.</section>
          <section className="note"><strong>The verdict is the Chair’s alone.</strong> Panel Members submit evaluations and confirm revisions; only the Panel Chair records the official verdict.</section>
        </aside>
      </div>
    </div>
  )
}

export function EvaluationForm() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me).filter(r => openDefenseOf(r.b))
  const [current, pick] = useProjectPick(rows)
  const [form, setForm] = useState({ recommendation: '', strengths: '', revisions: '' })
  const { run, error, busy } = useAction()
  if (!current) return <div className="page"><PageHead title="Evaluation form" /><Empty>No defense is open for evaluation.</Empty></div>

  const { b, ctx } = current
  const d = openDefenseOf(b)
  const mine = myEvaluation(b, me)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page">
      <PageHead title={`Evaluation form — ${b.project.groupName}`}
        lede={`${d.type} defense · ${fmtDateTime(d.scheduledAt)}. Your recommendation goes to the Panel Chair. It is not a grade.`}>
        <ProjectPicker rows={rows} current={current} onPick={pick} />
      </PageHead>
      {mine ? (
        <section className="panel">
          <div className="panel-head"><h2>Submitted {fmtDate(mine.submittedAt)}</h2><Chip tone="ok">{mine.content.recommendation}</Chip></div>
          {mine.content.strengths && <><div className="label">Strengths</div><p className="small">{mine.content.strengths}</p></>}
          {mine.content.revisions && <><div className="label">Required revisions</div><p className="small">{mine.content.revisions}</p></>}
        </section>
      ) : !can(ctx, 'evaluation.submit') ? (
        <Empty>Evaluations open on the day of the defense stage.</Empty>
      ) : (
        <section className="panel">
          <fieldset className="choice">
            <legend className="label">Your recommendation to the Chair</legend>
            {PANEL_RECOMMENDATIONS.map(r => (
              <label key={r} className="choice-card">
                <input type="radio" name="rec" checked={form.recommendation === r} onChange={() => setForm(f => ({ ...f, recommendation: r }))} />
                <span><strong>{r}</strong></span>
              </label>
            ))}
          </fieldset>
          <Field label="Strengths"><textarea value={form.strengths} onChange={set('strengths')} /></Field>
          <Field label="Required revisions"><textarea value={form.revisions} onChange={set('revisions')} /></Field>
          <button className="primary" disabled={busy || !form.recommendation}
            onClick={() => run(() => submitEvaluation(me, snap, b.project.id, form))}>Submit evaluation</button>
          <ActionError error={error} />
        </section>
      )}
    </div>
  )
}

const VERDICT_HELP = {
  [VERDICTS.MINOR]: `Complete within ${REVISION_WINDOW_DAYS.Minor} days · verified by the Adviser, then the Panel Members`,
  [VERDICTS.MAJOR]: `Complete within ${REVISION_WINDOW_DAYS.Major} days · verified by the Adviser, then the Panel Members`,
  [VERDICTS.REDEFENSE]: 'Prescribed revisions must be completed before the rescheduled defense',
}

/** Wireframe S-11 — Panel Chair only. */
export function VerdictRecording() {
  const { snap, me } = useApp()
  const rows = visibleProjects(snap, me).filter(r => openDefenseOf(r.b))
  const [current, pick] = useProjectPick(rows)
  const [verdict, setVerdict] = useState(VERDICTS.MINOR)
  const [days, setDays] = useState('')
  const [remarks, setRemarks] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { run, error, busy } = useAction()
  if (!current) return <div className="page"><PageHead title="Record official verdict" /><Empty>No defense is open for a verdict.</Empty></div>

  const { b, ctx } = current
  const nameOf = (id) => (snap.users ?? []).find(u => u.id === id)?.name ?? '—'
  const d = openDefenseOf(b)
  const type = defenseTypeAt(b.project.currentStage) ?? d.type
  const evaluated = latestOf(b, AI_MILESTONES[type]?.docType)
  const pending = pendingEvaluators(b, type)
  const panel = b.assignments.filter(a => PANEL_ROLES.includes(a.roleType))
  const rec = formOf(b, FORMS.F2005.code)
  const revisionClass = verdict === VERDICTS.MAJOR ? 'Major' : verdict === VERDICTS.MINOR ? 'Minor' : null
  const period = Number(days) || (revisionClass ? REVISION_WINDOW_DAYS[revisionClass] : 0)
  const deadline = revisionClass ? new Date(Date.now() + period * 864e5).toISOString() : null
  const blocked = !can(ctx, 'verdict.record') || pending.length > 0

  return (
    <div className="page page-wide">
      <PageHead title={`Record official verdict — ${b.project.groupName}`}
        lede={`${type} defense · ${fmtDate(d.scheduledAt)} · recorded on ${FORMS.F2004.code} · version under evaluation: v${evaluated?.versionNumber ?? '—'}`}>
        <ProjectPicker rows={rows} current={current} onPick={pick} />
      </PageHead>

      <section className="note" style={{ marginBottom: 24 }}>
        <strong>Only the Panel Chair can record the official verdict.</strong> Panel Members submit evaluations and confirm
        revisions; the Adviser recommends for defense. This action is written to the append-only audit trail.
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h2>Panel evaluations</h2>
          <span className="faint small">The verdict can be recorded once every panelist has submitted an evaluation form.</span>
        </div>
        <ul className="evaluators">
          {panel.map(a => {
            const ev = b.evaluations.find(e => e.defenseId === d.id && e.panelistId === a.userId)
            return (
              <li key={a.id}>
                <strong className="small">{nameOf(a.userId)}</strong>
                <span className="faint small">{a.roleType}{a.userId === me.id ? ' (you)' : ''}</span>
                <Chip tone={ev ? 'ok' : 'warn'}>{ev ? `Submitted · ${ev.content.recommendation}` : 'Not yet submitted'}</Chip>
              </li>
            )
          })}
          {type === 'Final' && (
            <li>
              <strong className="small">{nameOf(b.assignments.find(a => a.roleType === 'Adviser')?.userId)}</strong>
              <span className="faint small">Adviser — recommended for defense</span>
              <Chip tone={rec ? 'ok' : undefined}>{rec ? `${FORMS.F2005.code} signed` : 'Not recommended'}</Chip>
            </li>
          )}
        </ul>
      </section>

      <div className="two-col wide-left">
        <section className="panel">
          <div className="panel-head"><h2>Official verdict</h2></div>
          <fieldset className="choice">
            <legend className="sr-only">Verdict</legend>
            {Object.values(VERDICTS).map(v => (
              <label key={v} className="choice-card">
                <input type="radio" name="verdict" checked={verdict === v} onChange={() => { setVerdict(v); setDays('') }} />
                <span><strong>{v.replace('Passed with ', '')}</strong><span className="small muted">{VERDICT_HELP[v]}</span></span>
              </label>
            ))}
          </fieldset>
          {revisionClass && (
            <div className="row">
              <Field label="Revision period">
                <select value={days || REVISION_WINDOW_DAYS[revisionClass]} onChange={e => setDays(e.target.value)}>
                  {[7, 10, 14, 21].map(n => <option key={n} value={n}>{n} calendar days</option>)}
                </select>
              </Field>
              <Field label="Revision deadline"><input value={fmtDate(deadline)} readOnly /></Field>
              <Field label="Revisions verified by"><input value="Adviser, then Panel" readOnly /></Field>
            </div>
          )}
          <Field label="Deliberation remarks / required revisions"><textarea value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>What recording does</h2></div>
            <ul className="plain-list small">
              <li>Starts the revision countdown{deadline ? ` — ${daysUntil(deadline)} days before the deadline` : ''}</li>
              <li>Locks v{evaluated?.versionNumber ?? '—'} as the evaluated version</li>
              <li>Emails the group, the Adviser and the Program Coordinator</li>
              <li>Releases the panel’s private notes to the group</li>
              <li>Opens {FORMS.F2004.code} for the Adviser, then the Panel Members</li>
              <li>Writes an immutable audit entry naming you, your role and the time</li>
            </ul>
          </section>
          <section className="panel">
            <label className="inline small">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              I confirm the panel has deliberated and this is the official verdict
            </label>
            <button className="primary block" style={{ marginTop: 16 }} disabled={busy || blocked || !confirmed}
              onClick={() => run(() => recordVerdict(me, snap, b.project.id, { verdict, remarks, revisionDays: period, confirmed }))}>
              Record verdict
            </button>
            {pending.length > 0 && <p className="blocker">Waiting for {pending.map(a => nameOf(a.userId)).join(', ')}.</p>}
            <p className="faint small" style={{ margin: '8px 0 0' }}>This action cannot be undone.</p>
            <ActionError error={error} />
          </section>
        </aside>
      </div>
    </div>
  )
}
