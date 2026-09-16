import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist } from '../services/worklist.js'
import { createProject } from '../services/actions.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Badge, Empty, Field, fmtDate } from '../components/ui.jsx'
import { STAGES, stageByKey } from '../domain/stages.js'
import { PROGRAMS, GLOBAL_ROLES } from '../domain/constants.js'

export default function Projects() {
  const { snap, me } = useApp()
  const [params, setParams] = useSearchParams()
  const { run, error, busy } = useAction()
  const [stageFilter, setStageFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [form, setForm] = useState({ title: '', program: PROGRAMS[0], researchArea: '', term: 'AY 2026–2027, 1st Semester' })

  const creating = params.get('new') === '1'
  const canCreate = me.globalRole === GLOBAL_ROLES.INSTRUCTOR_1

  const rows = worklist(snap, me).filter(r =>
    (!stageFilter || r.project.currentStage === stageFilter) &&
    (!programFilter || r.project.program === programFilter))

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Projects</div>
        <h1>Projects visible to you</h1>
        <p className="lede">
          Visibility is resolved per project: your group memberships and project assignments,
          plus whichever institutional gate your global role owns.
        </p>
      </header>

      {canCreate && (
        <Section title="Create a project group">
          {!creating ? (
            <button onClick={() => setParams({ new: '1' })}>New project group</button>
          ) : (
            <div className="panel">
              <div className="row">
                <Field label="Working title"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Untitled — Group 7 (BSIT-WD)" /></Field>
                <Field label="Programme">
                  <select value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))}>
                    {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div className="row">
                <Field label="Research area"><input value={form.researchArea} onChange={e => setForm(f => ({ ...f, researchArea: e.target.value }))} /></Field>
                <Field label="Academic term"><input value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))} /></Field>
              </div>
              <div className="actions">
                <button className="primary" disabled={busy || !form.title}
                  onClick={() => run(async () => { await createProject(me, form); setParams({}) })}>
                  Create group
                </button>
                <button className="quiet" onClick={() => setParams({})}>Cancel</button>
              </div>
              <p className="faint small" style={{ marginTop: 10 }}>
                You are recorded as Instructor 1 on the new group. Students are added by you — they cannot self-register.
              </p>
              <ActionError error={error} />
            </div>
          )}
        </Section>
      )}

      <Section
        title={`${rows.length} project${rows.length === 1 ? '' : 's'}`}
        aside={
          <span className="inline">
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">All stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={programFilter} onChange={e => setProgramFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">All programmes</option>
              {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </span>
        }
      >
        {rows.length === 0 && <Empty>No projects match.</Empty>}
        {rows.length > 0 && (
          <table>
            <thead>
              <tr><th>Project</th><th>Stage</th><th>Your role</th><th>Access</th><th className="tight">Updated</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.project.id}>
                  <td>
                    <Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link>
                    <div className="faint small">{r.project.program}</div>
                  </td>
                  <td><Badge tone={r.project.currentStage === 'ARCHIVED' ? 'ok' : 'neutral'}>{stageByKey(r.project.currentStage)?.label}</Badge></td>
                  <td className="small muted">{r.ctx.projectRoles.join(', ') || '—'}</td>
                  <td className="small">
                    {r.access.level === 'work'
                      ? <Badge tone="accent">workspace</Badge>
                      : <Badge tone="warn">observe</Badge>}
                  </td>
                  <td className="tight small faint">{fmtDate(r.bundle.history.at(-1)?.at ?? r.project.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
