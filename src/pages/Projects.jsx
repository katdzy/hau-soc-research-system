import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { worklist } from '../services/worklist.js'
import { createProject } from '../services/api.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Badge, Empty, Field, fmtDate } from '../components/ui.jsx'
import { STAGES, sectionNow } from '../domain/stages.js'
import { PROGRAMS, programCode, COURSES } from '../domain/constants.js'
import { can, resolveInstitution } from '../domain/caac.js'
import { Act } from '../components/ViewOnly.jsx'
import { nextGroupNumber } from '../domain/groupNames.js'

export default function Projects() {
  const { snap, me } = useApp()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { run, error, busy } = useAction()
  const [stageFilter, setStageFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')

  const inst = resolveInstitution(me, snap)
  const canCreate = can(inst, 'group.create')
  const blocks = inst.sections.filter(s => s.course === COURSES.C1)
  const [form, setForm] = useState({ title: '', sectionId: blocks[0]?.id ?? '', researchArea: '' })
  const creating = params.get('new') === '1'

  const rows = worklist(snap, me).filter(r =>
    (!stageFilter || r.project.currentStage === stageFilter) &&
    (!programFilter || r.project.program === programFilter))

  return (
    <div className="page">
      <header className="page-head">
        <h1>Projects</h1>
        <p className="lede">
          Visibility is resolved per project and per stage: your group membership, the
          project roles you hold on it, and whether its current stage involves your office.
        </p>
      </header>

      {canCreate && <Act>
        <Section title="Create a project group">
          {!creating ? (
            <div className="actions m-0">
              <button className="primary" onClick={() => setParams({ new: '1' })}>New project group</button>
              <span className="small muted">For students left without a group; students can also draft their own.</span>
            </div>
          ) : (
            <div className="create-group">
              <p className="small muted m-0 mb-2">
                For students left without a group. You become the group’s Instructor 1, then add its students from
                the section roster on the group page. Groups your students draft themselves arrive for your approval
                under <Link to="/rosters">Groups &amp; rosters</Link>.
              </p>
              <div className="row">
                <Field label="Section">
                  <select value={form.sectionId} onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))}>
                    {blocks.map(s => <option key={s.id} value={s.id}>{s.block} · {s.course} · {s.term}</option>)}
                  </select>
                </Field>
                <Field label="Working title (optional)" hint="Leave it blank: the group goes by its section and number until its topic is registered.">
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={`${blocks.find(b => b.id === form.sectionId)?.block ?? 'WD-401'}-${nextGroupNumber((snap.projects ?? []).filter(p => p.sectionId === form.sectionId))}`} />
                </Field>
              </div>
              <div className="actions">
                <button className="primary" disabled={busy || !form.sectionId}
                  onClick={() => run(async () => { const p = await createProject(me, snap, form); setParams({}); if (p?.id) navigate(`/projects/${p.id}`) })}>
                  Create group
                </button>
                <button className="quiet" onClick={() => setParams({})}>Cancel</button>
              </div>
              <ActionError error={error} />
            </div>
          )}
        </Section>
      </Act>}

      <Section
        title={`${rows.length} project${rows.length === 1 ? '' : 's'}`}
        aside={
          <span className="inline">
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} aria-label="Stage" className="w-auto">
              <option value="">All stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={programFilter} onChange={e => setProgramFilter(e.target.value)} aria-label="Program" className="w-auto">
              <option value="">All programs</option>
              {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </span>
        }
      >
        {rows.length === 0 && <Empty>No projects match.</Empty>}
        {rows.length > 0 && (
          <div className="table-scroll"><table className="cards">
            <thead>
              <tr><th>Project</th><th>Stage</th><th>Access through</th><th className="tight">Updated</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.project.id}>
                  <td>
                    <Link className="row-link" to={`/projects/${r.project.id}`}>{r.project.title}</Link>
                    <div className="faint small" title={r.project.program}>{programCode(r.project.program)} · {sectionNow(r.project).section}</div>
                  </td>
                  <td className="card-status"><Badge tone={r.project.currentStage === 'ARCHIVED' ? 'ok' : 'neutral'}>{r.stage?.label}</Badge></td>
                  <td className="small muted" data-label="Access through" title={r.access.reason}>{r.access.via}</td>
                  <td className="tight small faint" data-label="Updated">{fmtDate(r.bundle.history.at(-1)?.at ?? r.project.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}
