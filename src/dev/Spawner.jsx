import { useEffect, useRef, useState } from 'react'
import { isLiveBackend } from '../backend/index.js'
import { PROGRAM_INFO, COURSES, GLOBAL_ROLES as G, normalizeSection, sectionProblem, parseSection } from '../domain/constants.js'
import {
  spawnStudentsInBlock, sectionByBlock, spawnSection, dropSection, spawnStudent, dropStudent, spawnGroup, dropGroup, spawnFaculty, dropFaculty,
  spawnOffice, dropOffice, setInstructor, starterStore, sectionsOf, studentsIn, groupsIn, plainFaculty, officeHolders,
} from './spawn.js'

const SHORT = { WD: 'Web Development', NW: 'Network Administration', CS: 'Computer Science', EMC: 'Multimedia Computing', CYB: 'Cybersecurity' }
const OFFICES = [
  [G.DEAN, 'Dean'], [G.ASSOCIATE_DEAN, 'Associate Dean'], [G.URO, 'Research Office (URO)'], [G.ADMIN, 'System Administrator'],
]

/**
 * The spawner tab: − / + for sections per program and course, students and
 * groups per section, faculty, and each office. Shift-click does five.
 * `edit(fn, times)` applies a store transform from spawn.js and writes it.
 */
export default function Spawner({ store, edit, busy, me = null }) {
  const users = store.users
  const sections = Object.values(store.sections)
    .sort((a, b) => a.block.localeCompare(b.block, undefined, { numeric: true }) || a.course.localeCompare(b.course))
  const faculty = plainFaculty(users)
  const teaching = faculty.filter(u => sections.some(s => s.instructorId === u.id)).length
  const empty = Object.keys(users).length === 0
  // Class lists, one program at a time once there are several.
  const [program, setProgram] = useState('')
  const programsHere = PROGRAM_INFO.map(p => p.code).filter(code => sections.some(s => parseSection(s.block)?.code === code))
  const listed = program ? sections.filter(s => parseSection(s.block)?.code === program) : sections

  return (
    <div className="tp-spawn">
      {!empty && <JumpBar />}
      {empty && (
        <div className="tp-callout">
          <p><strong>The store is empty.</strong> Start from a small school, or build it up yourself below.</p>
          <button type="button" className="tp-btn is-primary" disabled={busy} onClick={() => edit(s => ({ store: starterStore(s), note: 'Starter set added.' }))}>
            Add starter set
          </button>
          <p className="tp-hint">A Capstone 1 section per program with eight students and its instructor, four more faculty,
            a Program Chair per program, and a Dean, Associate Dean, URO and System Administrator. No groups.</p>
        </div>
      )}

      <SpawnInto store={store} sections={sections} edit={edit} busy={busy} me={me} />

      <section className="tp-block" aria-labelledby="tp-sec-h">
        <header>
          <h3 id="tp-sec-h">Sections</h3>
          <p>A new section brings its own instructor, who becomes Instructor 1 of the groups formed in it.</p>
        </header>
        {/* ARIA table roles on divs: a real <table> picks up the app's row hover and cell padding. */}
        <div className="tp-matrix" role="table" aria-labelledby="tp-sec-h">
          <div className="tp-matrix-row is-head" role="row">
            <span role="columnheader">Program</span>
            <span role="columnheader">{COURSES.C1}</span>
            <span role="columnheader">{COURSES.C2}</span>
          </div>
          {PROGRAM_INFO.map(({ code }) => (
            <div key={code} className="tp-matrix-row" role="row">
              <span role="rowheader" className="tp-program"><span className="tp-code">{code}</span><span className="tp-sub">{SHORT[code]}</span></span>
              {[COURSES.C1, COURSES.C2].map(course => (
                <span key={course} role="cell">
                  <Stepper label={`${code} ${course} section`} value={sectionsOf(store, code, course).length} busy={busy}
                    onDec={(n) => edit(s => dropSection(s, code, course), n)}
                    onInc={(n) => edit(s => spawnSection(s, code, course), n)} />
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="tp-hint tp-after">Groups are formed in Capstone 1 sections. A Capstone 2 section is a class list
          only — a group reaches Capstone 2 by moving through the stages (or Stage → Jump), not by section.</p>
      </section>

      <section className="tp-block" aria-labelledby="tp-class-h">
        <header>
          <h3 id="tp-class-h">Class lists</h3>
          <p>Students join a section with no group. <strong>Groups</strong> forms one from them at Group Formation,
            the way Instructor 1 would — or form groups in the app itself.</p>
        </header>
        {programsHere.length > 1 && (
          <div className="tp-chips" role="group" aria-label="Show the sections of">
            {['', ...programsHere].map(code => (
              <button key={code || 'all'} type="button" className="tp-chip" aria-pressed={program === code}
                onClick={() => setProgram(code)}>
                {code || 'All'}
                <span className="tp-chip-n">{code ? sections.filter(s => parseSection(s.block)?.code === code).length : sections.length}</span>
              </button>
            ))}
          </div>
        )}
        {sections.length === 0 ? <p className="tp-none">Add a section first.</p> : (
          <ul className="tp-sections">
            {listed.map(sec => {
              const students = studentsIn(store, sec)
              const grouped = students.filter(u => Object.values(store.projectMembers).some(m => m.userId === u.id)).length
              return (
                <li key={sec.id}>
                  <div className="tp-sec-head">
                    <span className="tp-code">{sec.block}</span>
                    <span className="tp-sub">{sec.course}</span>
                    <select className="tp-select" aria-label={`Instructor of ${sec.block}`} value={sec.instructorId ?? ''} disabled={busy}
                      onChange={e => edit(s => setInstructor(s, sec.id, e.target.value))}>
                      <option value="">No instructor</option>
                      {instructorChoices(faculty, sec).map(u => <option key={u.id} value={u.id}>{u.name}{isLiveBackend && !u.spawned ? ' (no login)' : ''}</option>)}
                    </select>
                  </div>
                  <div className="tp-sec-row">
                    <span className="tp-row-label">Students <span className="tp-sub">{grouped} in groups</span></span>
                    <Stepper label={`student in ${sec.block}`} value={students.length} busy={busy}
                      onDec={(n) => edit(s => dropStudent(s, sec.id), n)}
                      onInc={(n) => edit(s => spawnStudent(s, sec.id), n)} />
                  </div>
                  {sec.course === COURSES.C1 && (
                    <div className="tp-sec-row">
                      <span className="tp-row-label">Groups</span>
                      <Stepper label={`group in ${sec.block}`} value={groupsIn(store, sec).length} busy={busy}
                        onDec={(n) => edit(s => dropGroup(s, sec.id), n)}
                        onInc={(n) => edit(s => spawnGroup(s, sec.id), n)} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="tp-block" aria-labelledby="tp-fac-h">
        <header>
          <h3 id="tp-fac-h">Faculty</h3>
          <p>No Global Role beyond Faculty: every permission comes from the groups they are assigned to — advisers,
            panelists, Instructor 2.</p>
        </header>
        <div className="tp-line">
          <span className="tp-row-label">Faculty <span className="tp-sub">{teaching} teach a section</span></span>
          <Stepper label="faculty member" value={faculty.length} busy={busy}
            onDec={(n) => edit(dropFaculty, n)} onInc={(n) => edit(spawnFaculty, n)} />
        </div>
      </section>

      <section className="tp-block" aria-labelledby="tp-off-h">
        <header>
          <h3 id="tp-off-h">Offices</h3>
          <p>School-wide roles. A Program Chair covers one program.</p>
        </header>
        <div className="tp-line is-stack">
          <span className="tp-row-label">Program Chair / Coordinator</span>
          <div className="tp-chairs">
            {PROGRAM_INFO.map(({ code, name }) => (
              <div key={code} className="tp-chair">
                <span className="tp-code">{code}</span>
                <Stepper label={`${code} Program Chair`} value={officeHolders(users, G.COORDINATOR, name).length} busy={busy}
                  onDec={(n) => edit(s => dropOffice(s, G.COORDINATOR, name), n)}
                  onInc={(n) => edit(s => spawnOffice(s, G.COORDINATOR, name), n)} />
              </div>
            ))}
          </div>
        </div>
        {OFFICES.map(([role, label]) => (
          <div key={role} className="tp-line">
            <span className="tp-row-label">{label}</span>
            <Stepper label={label} value={officeHolders(users, role).length} busy={busy}
              onDec={(n) => edit(s => dropOffice(s, role), n)} onInc={(n) => edit(s => spawnOffice(s, role), n)} />
          </div>
        ))}
      </section>

      {!empty && (
        <p className="tp-hint tp-foot-hint">
          Shift-click a − or + to do five. − takes back the newest one and clears what it held (memberships,
          assignments); a section with groups keeps them until you remove the groups.
        </p>
      )}
    </div>
  )
}

// On a live project a section can only be handed to a spawned faculty member
// (scripts/live-spawn/core.mjs) — the old seed faculty have no login. The
// current instructor stays listed so the select shows who it is.
const instructorChoices = (faculty, sec) => (isLiveBackend
  ? faculty.filter(u => u.spawned || u.id === sec.instructorId)
  : faculty)

// The Spawn tab is long: a bar that stays at the top and jumps to each part.
const PARTS = [['tp-into-h', 'Students'], ['tp-sec-h', 'Sections'], ['tp-class-h', 'Class lists'], ['tp-fac-h', 'Faculty'], ['tp-off-h', 'Offices']]

function JumpBar() {
  const go = (id) => {
    const target = document.getElementById(id)?.closest('section')
    if (!target) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    target.querySelector('input, select, button')?.focus({ preventScroll: true })
  }
  return (
    <nav className="tp-jump" aria-label="Parts of Spawn">
      {PARTS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{label}</button>)}
    </nav>
  )
}

const MAX_AT_ONCE = 40
const COURSE_LIST = [COURSES.C1, COURSES.C2]

/** The courses `block` can name (CS-301 is Capstone 1 only), the one it already has a section in first. */
function coursesFor(store, block) {
  const fit = COURSE_LIST.filter(c => !sectionProblem(block, null, c))
  return [...fit.filter(c => sectionByBlock(store, block, c)), ...fit.filter(c => !sectionByBlock(store, block, c))]
}

/**
 * Students into a section you name — one on record, or a new one (WD-405, …)
 * made with its own instructor. Starts on the signed-in student's section.
 */
function SpawnInto({ store, sections, edit, busy, me }) {
  const start = () => {
    const own = me && (me.globalRoles ?? []).includes(G.STUDENT) ? normalizeSection(me.block) : ''
    return own || sections.find(s => s.course === COURSES.C1)?.block || sections[0]?.block || ''
  }
  const [block, setBlock] = useState(start)
  const [course, setCourse] = useState(() => coursesFor(store, start())[0] ?? COURSES.C1)
  const [count, setCount] = useState(1)
  // On a live project the store may still be loading when the tab opens: fill the section in once it arrives.
  const fallback = start()
  const touched = useRef(false)
  useEffect(() => {
    if (touched.current || block || !fallback) return
    setBlock(fallback)
    setCourse(coursesFor(store, fallback)[0] ?? COURSES.C1)
  }, [fallback]) // eslint-disable-line react-hooks/exhaustive-deps

  const name = normalizeSection(block)
  const problem = name ? sectionProblem(name, null, course) : 'Type a section, e.g. WD-405.'
  const sec = problem ? null : sectionByBlock(store, name, course)
  const students = sec ? studentsIn(store, sec) : []
  const grouped = students.filter(u => Object.values(store.projectMembers).some(m => m.userId === u.id)).length
  const teacher = sec?.instructorId ? store.users[sec.instructorId]?.name : null
  const n = Math.min(MAX_AT_ONCE, Math.max(1, Math.floor(Number(count)) || 1))

  function pickBlock(value) {
    touched.current = true
    setBlock(value)
    const fit = coursesFor(store, normalizeSection(value))
    if (fit.length) setCourse(fit[0])
  }

  return (
    <section className="tp-block" aria-labelledby="tp-into-h">
      <header>
        <h3 id="tp-into-h">Add students to a section</h3>
        <p>Pick a section on record or type a new one, e.g. WD-405. A new section comes with its own instructor.</p>
      </header>
      <form className="tp-into" onSubmit={e => { e.preventDefault(); if (!problem) edit(s => spawnStudentsInBlock(s, name, course, n)) }}>
        <label className="tp-field is-block">
          <span className="tp-label">Section</span>
          <input list="tp-into-blocks" value={block} placeholder="WD-405" autoComplete="off" spellCheck={false}
            onChange={e => pickBlock(e.target.value)} aria-describedby="tp-into-note" />
          <datalist id="tp-into-blocks">
            {[...new Set(sections.map(s => s.block))].map(b => <option key={b} value={b} />)}
          </datalist>
        </label>
        <label className="tp-field">
          <span className="tp-label">Course</span>
          <select value={course} onChange={e => setCourse(e.target.value)}>
            {COURSE_LIST.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="tp-field is-count">
          <span className="tp-label">Students</span>
          <input type="number" min="1" max={MAX_AT_ONCE} value={count} onChange={e => setCount(e.target.value)} />
        </label>
        <button type="submit" className="tp-btn is-primary" disabled={busy || Boolean(problem)}>
          Add {n === 1 ? 'student' : `${n} students`}
        </button>
      </form>
      <p id="tp-into-note" className={`tp-hint tp-after${problem && name ? ' is-error' : ''}`}>
        {problem
          ? problem
          : sec
            ? `${sec.block} · ${course} · ${students.length} student${students.length === 1 ? '' : 's'}, ${grouped} in groups · ${teacher ? `taught by ${teacher}` : 'no instructor'}`
            : `${name} is not on record yet — adding students makes it as a ${course} section with a new instructor.`}
      </p>
    </section>
  )
}

/** − count +. Shift-click does five at once. */
function Stepper({ label, value, onDec, onInc, busy }) {
  const times = (e) => (e.shiftKey ? 5 : 1)
  return (
    <span className="tp-stepper">
      <button type="button" aria-label={`Remove one ${label}`} disabled={busy || value === 0} onClick={e => onDec(times(e))}>−</button>
      <output aria-label={`Count: ${label}`}>{value}</output>
      <button type="button" aria-label={`Add one ${label}`} disabled={busy} onClick={e => onInc(times(e))}>+</button>
    </span>
  )
}
