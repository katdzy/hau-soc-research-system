import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext.jsx'
import {
  setGlobalRoles, createSection, setSectionInstructor, setInstructor2, INSTRUCTOR_2_STAGES,
  adminAssignRole, adminUnassignRole, assignmentConflict,
} from '../../services/actions.js'
import { useAction, ActionError } from '../../components/useAction.jsx'
import { Section, Restricted, Field } from '../../components/ui.jsx'
import {
  GLOBAL_ROLES as G, PROJECT_ROLES, ACCOUNT_STATUS, PROGRAMS, capstoneYear, blockExample,
} from '../../domain/constants.js'
import {
  CAPABILITIES, PROJECT_POLICIES, INSTITUTION_POLICIES, caacTag, resolveInstitution, can,
} from '../../domain/caac.js'
import { stageLabel, stageIndex } from '../../domain/stages.js'
import { facultyOf, matching, roleIndex, plural, Person, GlobalTags, ProjectTags } from './shared.jsx'

const OFFICE_ROLES = Object.values(G).filter(r => r !== G.STUDENT)
const SINGLE_HOLDER = [PROJECT_ROLES.ADVISER, PROJECT_ROLES.PANEL_CHAIR]
const VIEWS = [
  { key: 'tags', label: 'Tag assignments' },
  { key: 'instructors', label: 'Instructors' },
  { key: 'policies', label: 'Access policies' },
]

const FOLD_AT = 4

/** The groups or blocks behind one role, folded after a few. */
function Holdings({ items, busy }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <span className="faint small">None</span>
  const shown = all ? items : items.slice(0, FOLD_AT)
  return (
    <>
      {shown.map(it => (
        <span key={it.key} className="holding" title={it.title}>
          {it.text}{it.sub && <span className="holding-sub">{it.sub}</span>}
          {it.onRemove && (
            <button type="button" className="holding-x" disabled={busy}
              aria-label={it.removeLabel} onClick={it.onRemove}>×</button>
          )}
        </span>
      ))}
      {items.length > FOLD_AT && (
        <button type="button" className="link small" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `+${items.length - FOLD_AT} more`}
        </button>
      )}
    </>
  )
}

/** CAAC configuration: who holds which tag, instructor assignments, and the policies tags feed. */
export default function Caac() {
  const { snap, me } = useApp()
  const { run, error, busy } = useAction()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newBlock, setNewBlock] = useState(() => ({
    block: '', program: PROGRAMS[0], term: (snap.sections ?? []).at(-1)?.term ?? '', instructorId: '',
  }))

  if (!can(resolveInstitution(me, snap), 'admin.caac')) {
    return <Restricted>CAAC configuration belongs to the System Administrator.</Restricted>
  }

  const view = VIEWS.some(v => v.key === params.get('view')) ? params.get('view') : 'tags'
  const setView = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'tags') next.delete('view'); else next.set('view', key)
    setParams(next, { replace: true })
  }

  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? 'Unknown user'
  const faculty = facultyOf(users)
  const shownFaculty = faculty.filter(matching(query))

  const { sections, assignments, assignmentsOn, blocksOf, holdingsOf } = roleIndex(snap)
  const instructors = faculty.filter(u => u.status === ACCOUNT_STATUS.ACTIVE)
  const capstone2 = projects.filter(p => INSTRUCTOR_2_STAGES.includes(p.currentStage))
  const instructor2Of = (projectId) =>
    assignments.find(a => a.projectId === projectId && a.roleType === PROJECT_ROLES.INSTRUCTOR_2)?.userId ?? ''
  const needsInstructor2 = (p) =>
    !instructor2Of(p.id) && stageIndex(p.currentStage) >= stageIndex('FINAL_DEFENSE_ENDORSEMENT')
  const neededCount = capstone2.filter(needsInstructor2).length

  const policiesByRole = [...PROJECT_POLICIES, ...INSTITUTION_POLICIES].reduce((acc, pol) => {
    (acc[pol.role] ??= []).push(pol)
    return acc
  }, {})

  const instructorOptions = (currentId) => (
    <>
      {currentId && !instructors.some(u => u.id === currentId) && (
        <option value={currentId}>{nameOf(currentId)} (inactive)</option>
      )}
      {instructors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
    </>
  )

  const groupLabel = (p) => `${p.groupName} · ${p.block}`
  const openProjects = projects.filter(p => p.currentStage !== 'ARCHIVED')

  /** Each Project-Based Role for one faculty member: what they hold, and what can be added. */
  const roleRows = (u) => {
    const byRole = holdingsOf(u.id)
    const blocks = blocksOf(u.id)
    const heldGroup = (role, onRemove) => ({ a, p }) => ({
      key: a.id, text: p.groupName, sub: p.block, title: `${p.title} · ${stageLabel(p.currentStage)}`,
      onRemove: onRemove?.(a, p), removeLabel: `Remove ${u.name} as ${role} of ${groupLabel(p)}`,
    })

    const I1 = PROJECT_ROLES.INSTRUCTOR_1
    const I2 = PROJECT_ROLES.INSTRUCTOR_2
    return [
      {
        role: I1,
        // Blocks carry the role; groups kept from a block since handed over are listed after.
        items: [
          ...blocks.map(s => ({
            key: s.id, text: s.block, sub: plural(projects.filter(p => p.sectionId === s.id).length, 'group'),
            title: `${s.program} · ${s.term} — hand the block to someone else under Instructors`,
          })),
          ...byRole[I1].filter(({ p }) => !blocks.some(s => s.id === p.sectionId)).map(heldGroup(I1)),
        ],
        addLabel: 'Take over a block…',
        options: sections.filter(s => s.instructorId !== u.id)
          .map(s => ({ value: s.id, label: `${s.block} — now ${nameOf(s.instructorId)}` })),
        onAdd: (id) => setSectionInstructor(me, snap, id, u.id),
      },
      {
        role: I2,
        items: byRole[I2].map(heldGroup(I2, (a, p) =>
          INSTRUCTOR_2_STAGES.includes(p.currentStage) ? () => run(() => setInstructor2(me, snap, p.id, null)) : undefined)),
        addLabel: 'Add a group…',
        options: capstone2.filter(p => instructor2Of(p.id) !== u.id).map(p => {
          const holder = instructor2Of(p.id)
          return { value: p.id, label: groupLabel(p) + (holder ? ` (replaces ${nameOf(holder)})` : '') }
        }),
        onAdd: (id) => setInstructor2(me, snap, id, u.id),
      },
      ...[PROJECT_ROLES.ADVISER, PROJECT_ROLES.PANEL_CHAIR, PROJECT_ROLES.PANEL_MEMBER].map(role => ({
        role,
        items: byRole[role].map(heldGroup(role, (a) => () => run(() => adminUnassignRole(me, snap, a)))),
        addLabel: 'Add a group…',
        options: openProjects.filter(p => {
          const on = assignmentsOn(p.id)
          if (SINGLE_HOLDER.includes(role) && on.some(a => a.roleType === role)) return false
          return !assignmentConflict({ assignments: on }, u.id, role)
        }).map(p => ({ value: p.id, label: groupLabel(p) })),
        onAdd: (id) => adminAssignRole(me, snap, id, u.id, role),
      })),
    ]
  }

  const addBlock = (e) => {
    e.preventDefault()
    run(async () => {
      await createSection(me, snap, newBlock)
      setNewBlock(b => ({ ...b, block: '', instructorId: '' }))
      setAdding(false)
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Administration</div>
        <h1>CAAC configuration</h1>
        <p className="lede">
          The Global and Project-Based Role tags each faculty member holds, who teaches which block, and
          the policies that turn tags into access.
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="CAAC configuration">
        {VIEWS.map(v => (
          <button key={v.key} type="button" role="tab" id={`caac-tab-${v.key}`}
            aria-selected={view === v.key} aria-controls={`caac-panel-${v.key}`}
            onClick={() => { setView(v.key); setEditing(null) }}>
            {v.label}
            {v.key === 'instructors' && neededCount > 0 && (
              <span className="tab-alert" aria-label={`${neededCount} project${neededCount > 1 ? 's' : ''} need an Instructor 2`}>
                {neededCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`caac-panel-${view}`} aria-labelledby={`caac-tab-${view}`}>
        {view === 'tags' && (
          <>
            <div className="admin-toolbar">
              <p className="section-note small muted">
                Global roles apply everywhere; project roles apply only on the blocks and groups listed against them.
              </p>
              <input type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search faculty" aria-label="Search faculty" />
            </div>

            <div className="table-scroll"><table className="accounts">
              <thead>
                <tr><th>Faculty</th><th>Global roles</th><th>Project roles</th><th className="tight"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {shownFaculty.length === 0 && (
                  <tr><td colSpan={4} className="empty-cell">No faculty account matches “{query}”.</td></tr>
                )}
                {shownFaculty.map(u => {
                  const roles = u.globalRoles ?? []
                  const open = editing === u.id
                  const isMe = u.id === me.id
                  return (
                    <Fragment key={u.id}>
                      <tr className={open ? 'is-editing' : undefined}>
                        <td><Person user={u} flagStatus /></td>
                        <td><GlobalTags user={u} /></td>
                        <td><ProjectTags blocks={blocksOf(u.id)} byRole={holdingsOf(u.id)} /></td>
                        <td className="tight">
                          <button type="button" className="quiet small" aria-expanded={open}
                            aria-controls={`edit-${u.id}`} aria-label={`${open ? 'Close' : 'Edit'} tags for ${u.name}`}
                            onClick={() => setEditing(open ? null : u.id)}>
                            {open ? 'Close' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="row-editor" id={`edit-${u.id}`}>
                          <td colSpan={4}>
                            <fieldset className="tag-editor">
                              <legend className="label">Global roles</legend>
                              <div className="checks">
                                {OFFICE_ROLES.map(r => {
                                  const on = roles.includes(r)
                                  const locked = isMe && r === G.ADMIN
                                  return (
                                    <label key={r} className="check" title={locked ? 'You cannot remove your own System Administrator role.' : undefined}>
                                      <input type="checkbox" checked={on} disabled={busy || locked}
                                        onChange={() => run(() => setGlobalRoles(me, snap, u.id,
                                          on ? roles.filter(x => x !== r) : [...roles, r]))} />
                                      {r}
                                    </label>
                                  )
                                })}
                              </div>
                            </fieldset>

                            <fieldset className="tag-editor">
                              <legend className="label">Project roles</legend>
                              <ul className="role-rows">
                                {roleRows(u).map(row => (
                                  <li key={row.role}>
                                    <span className="role">{row.role}</span>
                                    <div className="role-holdings">
                                      <Holdings items={row.items} busy={busy} />
                                      <select className="select-quiet" value="" disabled={busy || !row.options.length}
                                        aria-label={`Add ${u.name} as ${row.role}`}
                                        onChange={e => { const id = e.target.value; if (id) run(() => row.onAdd(id)) }}>
                                        <option value="">{row.options.length ? row.addLabel : 'Nothing to add'}</option>
                                        {row.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </fieldset>
                            <p className="editor-note">
                              Changes save as you make them. Adviser and panel seats set here skip the Coordinator’s
                              stage window but keep the conflict rules — an Adviser never sits on the same panel.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table></div>
            <ActionError error={error} />
          </>
        )}

        {view === 'instructors' && (
          <>
            <Section title="Instructor 1 · Capstone 1 blocks">
              <p className="section-note small muted">
                The block’s instructor creates its groups and is Instructor 1 on each. Reassigning moves the
                groups still in Capstone 1.
              </p>
              <div className="table-scroll"><table>
                <thead>
                  <tr><th className="tight">Block</th><th>Program</th><th>Term</th><th className="tight num">Groups</th><th>Instructor 1</th></tr>
                </thead>
                <tbody>
                  {sections.length === 0 && (
                    <tr><td colSpan={5} className="empty-cell">No Capstone 1 block yet.</td></tr>
                  )}
                  {sections.map(s => (
                    <tr key={s.id}>
                      <td className="tight mono strong">{s.block}</td>
                      <td className="small muted">{s.program}</td>
                      <td className="small muted">{s.term}</td>
                      <td className="tight num">{projects.filter(p => p.sectionId === s.id).length}</td>
                      <td>
                        <select className="select-quiet" value={s.instructorId} disabled={busy}
                          aria-label={`Instructor 1 for ${s.block}`}
                          onChange={e => run(() => setSectionInstructor(me, snap, s.id, e.target.value))}>
                          {instructorOptions(s.instructorId)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>

              {adding ? (
                <form className="add-block" onSubmit={addBlock}>
                  <div className="row">
                    <Field label="Block">
                      <input value={newBlock.block} autoFocus
                        placeholder={blockExample(newBlock.program, capstoneYear(newBlock.program, 'Capstone 1'))}
                        onChange={e => setNewBlock(b => ({ ...b, block: e.target.value }))} />
                    </Field>
                    <Field label="Program">
                      <select value={newBlock.program} onChange={e => setNewBlock(b => ({ ...b, program: e.target.value }))}>
                        {PROGRAMS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Term">
                      <input value={newBlock.term} onChange={e => setNewBlock(b => ({ ...b, term: e.target.value }))} />
                    </Field>
                    <Field label="Instructor 1">
                      <select value={newBlock.instructorId} onChange={e => setNewBlock(b => ({ ...b, instructorId: e.target.value }))}>
                        <option value="">Select faculty…</option>
                        {instructorOptions('')}
                      </select>
                    </Field>
                  </div>
                  <div className="actions">
                    <button type="submit" className="primary" disabled={busy || !newBlock.block.trim() || !newBlock.instructorId}>Add block</button>
                    <button type="button" className="quiet" onClick={() => setAdding(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="small add-trigger" onClick={() => setAdding(true)}>Add a block</button>
              )}
            </Section>

            <Section title="Instructor 2 · Capstone 2 projects">
              <p className="section-note small muted">
                Needed before the Coordinator can endorse a group for final defense — Instructor 2 publishes its schedule.
              </p>
              <div className="table-scroll"><table>
                <thead>
                  <tr><th>Project</th><th>Stage</th><th>Instructor 2</th></tr>
                </thead>
                <tbody>
                  {capstone2.length === 0 && (
                    <tr><td colSpan={3} className="empty-cell">No project has reached Proposal Revision yet.</td></tr>
                  )}
                  {capstone2.map(p => {
                    const current = instructor2Of(p.id)
                    const needed = needsInstructor2(p)
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="person">
                            <strong>{p.groupName} <span className="mono faint">{p.block}</span></strong>
                            <span className="small muted">{p.title}</span>
                          </div>
                        </td>
                        <td className="small">{stageLabel(p.currentStage)}</td>
                        <td>
                          <select className={`select-quiet${needed ? ' tone-stop' : ''}`} value={current} disabled={busy}
                            aria-label={`Instructor 2 for ${p.groupName}, ${p.block}`}
                            onChange={e => run(() => setInstructor2(me, snap, p.id, e.target.value || null))}>
                            <option value="">{needed ? 'Needed — not assigned' : 'Not assigned'}</option>
                            {instructorOptions(current)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </Section>
            <ActionError error={error} />
          </>
        )}

        {view === 'policies' && (
          <>
            <p className="section-note small muted">
              A tag grants nothing on its own. Each policy pairs it with a capability and the context that must
              hold — relationship, stage, program scope or a conflict check.
            </p>
            {Object.entries(policiesByRole).map(([role, pols]) => (
              <details className="policy-group" key={role}>
                <summary>
                  <span className="tag">{caacTag(role)}</span>
                  <span className="faint small">{pols[0].dimension} · {pols.length} polic{pols.length === 1 ? 'y' : 'ies'}</span>
                </summary>
                <table>
                  <thead><tr><th>Capability</th><th>Only when</th></tr></thead>
                  <tbody>
                    {pols.map((p, i) => (
                      <tr key={i}>
                        <td>
                          <div className="mono">{p.cap}</div>
                          <div className="faint small">{CAPABILITIES[p.cap]}</div>
                        </td>
                        <td className="small muted">{p.when.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
