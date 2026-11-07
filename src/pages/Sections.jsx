import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { createSection, setSectionInstructor, removeSection, sectionHandover, sectionInUse } from '../services/api.js'
import { useAction, ActionError } from '../components/useAction.jsx'
import { Section, Restricted, Empty, Field } from '../components/ui.jsx'
import {
  ACCOUNT_STATUS, COURSES, PROGRAM_INFO, accountType, normalizeSection, sectionProblem, termOf, termProblem,
} from '../domain/constants.js'
import { resolveInstitution, can } from '../domain/caac.js'
import { sectionNow } from '../domain/stages.js'
import { Act, useViewOnly } from '../components/ViewOnly.jsx'

// Sections (revision 2026-11-07, OQ#5): the Program Chair/Coordinator sets up
// the sections of the programs they coordinate and names who teaches each.
// Teaching a Capstone 1 section is what makes someone Instructor 1.

const byBlock = (a, b) => a.block.localeCompare(b.block, undefined, { numeric: true }) || a.course.localeCompare(b.course)

/** Active faculty accounts, the only ones who can teach a section. */
const facultyOf = (snap) => (snap.users ?? [])
  .filter(u => accountType(u.email) === 'Faculty' && u.status === ACCOUNT_STATUS.ACTIVE)
  .sort((a, b) => a.name.localeCompare(b.name))

/** The term most sections are in, else the one today falls in. */
function usualTerm(sections) {
  const counts = new Map()
  for (const s of sections) counts.set(s.term, (counts.get(s.term) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? termOf()
}

export default function Sections() {
  const { snap, me } = useApp()
  const inst = resolveInstitution(me, snap)
  if (!can(inst, 'section.manage')) {
    const coordinator = inst.dormant.some(d => d.cap === 'section.manage')
    return (
      <Restricted>
        {coordinator
          ? 'You coordinate no program yet. Ask the System Administrator to add your programs; their sections then appear here.'
          : 'Sections are set up by the Program Chair/Coordinator of each program.'}
      </Restricted>
    )
  }
  const programs = PROGRAM_INFO.filter(p => (me.programScope ?? []).includes(p.name))
  const sections = (snap.sections ?? []).filter(s => (me.programScope ?? []).includes(s.program))

  return (
    <div className="page">
      <header className="page-head">
        <h1>Sections</h1>
        <p className="lede">
          Set up the sections of the programs you coordinate and name who teaches each. The instructor of a
          Capstone 1 section is Instructor 1 for its groups: they approve the groups its students draft, or
          create them. Students choose their section when they register.
        </p>
      </header>
      <AddSection programs={programs} term={usualTerm(sections)} />
      {programs.map(p => (
        <ProgramSections key={p.code} program={p} sections={sections.filter(s => s.program === p.name).sort(byBlock)} />
      ))}
    </div>
  )
}

function AddSection({ programs, term: usual }) {
  const { snap, me } = useApp()
  const { run, error, busy, setError } = useAction()
  const [block, setBlock] = useState('')
  const [course, setCourse] = useState(COURSES.C1)
  const [term, setTerm] = useState(usual)
  const [instructorId, setInstructorId] = useState('')
  const faculty = facultyOf(snap)
  const example = programs[0] ? `${programs[0].code}-${programs[0].capstone[course].year}01` : 'WD-401'
  const name = normalizeSection(block)
  const problem = name && sectionProblem(name, null, course)
  const termIssue = term.trim() && termProblem(term)

  async function submit() {
    await createSection(me, snap, { block: name, course, term: term.trim(), instructorId: instructorId || null })
    setBlock(''); setInstructorId('')
  }

  return (
    <Act><Section title="Add a section">
      <div className="row">
        <Field label="Section" hint={problem || `Program code, year level and number, e.g. ${example}.`}>
          <input value={block} onChange={e => { setBlock(e.target.value); setError('') }} placeholder={example}
            aria-invalid={Boolean(problem)} autoCapitalize="characters" spellCheck={false} />
        </Field>
        <Field label="Course">
          <select value={course} onChange={e => setCourse(e.target.value)}>
            {Object.values(COURSES).map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="row">
        <Field label="Term" hint={termIssue || undefined}>
          <input value={term} onChange={e => setTerm(e.target.value)} aria-invalid={Boolean(termIssue)} />
        </Field>
        <Field label="Instructor" hint={course === COURSES.C2 ? 'On record only — Instructor 2 is still assigned on each project.' : 'Becomes Instructor 1 for the section’s groups.'}>
          <select value={instructorId} onChange={e => setInstructorId(e.target.value)}>
            <option value="">Assign later</option>
            {faculty.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="actions">
        <button className="primary" disabled={busy || !name || Boolean(problem) || !term.trim() || Boolean(termIssue)} onClick={() => run(submit)}>
          Add section
        </button>
      </div>
      <ActionError error={error} />
    </Section></Act>
  )
}

function ProgramSections({ program, sections }) {
  const { snap } = useApp()
  const { run, error, busy } = useAction()
  const students = (sec) => (snap.users ?? []).filter(u => accountType(u.email) === 'Student' && u.block === sec.block).length
  const groups = (sec) => (snap.projects ?? []).filter(p => {
    const now = sectionNow(p)
    return p.sectionId === sec.id || (sec.course === COURSES.C2 && now.course === COURSES.C2 && now.section === sec.block && p.program === sec.program)
  }).length

  return (
    <Section title={<>{program.code} <span className="faint small">{program.name}</span></>}>
      {sections.length === 0 ? <Empty>No {program.code} section yet. Add one above.</Empty> : (
        <div className="table-scroll"><table className="cards">
          <thead>
            <tr><th>Section</th><th>Instructor</th><th className="tight">Students</th><th className="tight">Groups</th><th className="tight"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {sections.map(sec => (
              <tr key={sec.id}>
                <td className="card-title">
                  <div><strong>{sec.block}</strong> <span className="small muted">· {sec.course}</span></div>
                  <div className="faint small">{sec.term}</div>
                </td>
                <td data-label="Instructor"><InstructorControl sec={sec} busy={busy} run={run} /></td>
                <td className="tight small" data-label="Students">{students(sec)}</td>
                <td className="tight small" data-label="Groups">{groups(sec)}</td>
                <td className="tight"><RemoveControl sec={sec} busy={busy} run={run} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <ActionError error={error} />
    </Section>
  )
}

/**
 * Who teaches the section. Choosing someone else asks first when it takes the
 * section from someone or moves groups with it; giving an untaught section
 * with no groups its first instructor needs no confirmation.
 */
function InstructorControl({ sec, busy, run }) {
  const { snap, me } = useApp()
  const viewOnly = useViewOnly()
  const [pending, setPending] = useState(null) // { userId } while confirming
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? 'Unknown account'
  const current = sec.instructorId ?? ''
  const role = sec.course === COURSES.C1 ? 'Instructor 1' : null

  if (viewOnly) return <span className="small">{current ? nameOf(current) : <span className="faint">No instructor</span>}</span>

  const apply = (userId) => run(() => setSectionInstructor(me, snap, sec.id, userId || null))
  function choose(userId) {
    if (userId === current) return
    const moves = sectionHandover(snap, sec, userId || null)
    if (!current && !moves.length) { apply(userId); return }
    setPending({ userId, moves })
  }

  const faculty = facultyOf(snap)
  const listed = current && !faculty.some(u => u.id === current) ? [users.find(u => u.id === current), ...faculty].filter(Boolean) : faculty

  if (pending) {
    const who = pending.userId ? nameOf(pending.userId) : null
    const n = pending.moves.length
    return (
      <div className="status-confirm" role="group" aria-label={`Change the instructor of ${sec.block}`}>
        <p className="small m-0">
          {who ? `${who} will teach ${sec.block}` : `${sec.block} will have no instructor`}
          {current ? ` instead of ${nameOf(current)}` : ''}.
          {n > 0 && ` ${n === 1 ? 'Its group' : `Its ${n} groups`} in Capstone 1 move${n === 1 ? 's' : ''} to ${who} as ${role}.`}
          {!who && current && role && ' Its groups keep their Instructor 1 until you name someone.'}
        </p>
        <div className="actions">
          <button className="small primary" disabled={busy} onClick={() => { setPending(null); apply(pending.userId) }}>Confirm</button>
          <button className="small quiet" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <select value={current} disabled={busy} onChange={e => choose(e.target.value)} className="select-quiet"
      aria-label={`Instructor of ${sec.block} (${sec.course})`}>
      <option value="">No instructor</option>
      {listed.map(u => <option key={u.id} value={u.id}>{u.name}{u.status !== ACCOUNT_STATUS.ACTIVE ? ` (${u.status.toLowerCase()})` : ''}</option>)}
    </select>
  )
}

/** Remove a section nobody uses yet — e.g. one added by mistake. */
function RemoveControl({ sec, busy, run }) {
  const { snap, me } = useApp()
  const [asking, setAsking] = useState(false)
  const inUse = sectionInUse(snap, sec)
  if (inUse) return null
  if (!asking) {
    return <Act><button className="quiet small danger" disabled={busy} aria-label={`Remove ${sec.block} (${sec.course})`} onClick={() => setAsking(true)}>Remove…</button></Act>
  }
  return (
    <div className="status-confirm" role="group" aria-label={`Remove ${sec.block}`}>
      <p className="small m-0">Remove {sec.block} ({sec.course})? Students will no longer see it at registration.</p>
      <div className="actions">
        <button className="small danger" disabled={busy} onClick={() => { setAsking(false); run(() => removeSection(me, snap, sec.id)) }}>Remove</button>
        <button className="small quiet" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
      </div>
    </div>
  )
}
