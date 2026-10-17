import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { STAGES, stageIndex, stageLabel, macroStageOf } from '../domain/stages.js'
import { PROGRAM_INFO } from '../domain/constants.js'
import { worklist, actionableCount } from '../services/worklist.js'
import { SCENARIOS, scenarioStore } from './scenarios.js'
import { OFFICES, castOf, hatsOf, isPersonaProject, projectLabel, splitPersonas } from './personas.js'
import ResetControls from './ResetControls.jsx'
import './dev.css'

/**
 * Dev-only demo panel on the sign-in screen (R9): pick who to play, grouped by
 * the context they act in — a project's cast at its current stage, an office,
 * or a §7 scenario. Picking someone on a project signs in straight into that
 * project, on the tab where their next step is. Skips email verification and
 * activation on purpose.
 */

const VIEWS = [
  { key: 'projects', label: 'By project' },
  { key: 'roles', label: 'By role' },
  { key: 'scenarios', label: '§7 scenarios' },
]

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window: not remembered */ }
  },
}
const VIEW_KEY = 'hausoc.demo.view'
const RECENT_KEY = 'hausoc.demo.recent'

const codeOf = (program) => PROGRAM_INFO.find(p => p.name === program)?.code ?? program

const pathTo = (projectId, tab) =>
  projectId ? `/projects/${projectId}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}` : '/'

export default function DemoPanel() {
  const { snap, signIn, replaceStore } = useApp()
  const navigate = useNavigate()
  const [view, setViewState] = useState(() => store.get(VIEW_KEY, 'projects'))
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(() => store.get(RECENT_KEY, []))
  const users = snap.users ?? []
  const projects = snap.projects ?? []

  const setView = (v) => { setViewState(v); store.set(VIEW_KEY, v) }

  /** Sign in as `user`, landing where they act: a project tab, or the worklist. */
  function play(user, { projectId = null, tab = null } = {}) {
    const next = [{ userId: user.id, projectId, tab }, ...recent.filter(r => r.userId !== user.id || r.projectId !== projectId)].slice(0, 6)
    store.set(RECENT_KEY, next)
    navigate(pathTo(projectId, tab))
    signIn(user.id)
  }

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return []
    return splitPersonas(users).personas.concat(splitPersonas(users).npcs).filter(u => {
      const hay = [u.name, u.email, u.block, ...(u.globalRoles ?? []), ...hatsOf(u, snap).map(h => `${h.label} ${h.role}`)]
      return hay.some(s => String(s ?? '').toLowerCase().includes(q))
    })
  }, [q, users, snap])

  const recentRows = recent
    .map(r => ({ ...r, user: users.find(u => u.id === r.userId), project: projects.find(p => p.id === r.projectId) }))
    .filter(r => r.user && (!r.projectId || r.project))

  return (
    <section className="demo" aria-labelledby="demo-h">
      <header className="demo-head">
        <div>
          <h2 id="demo-h">Play a role <span className="dev-flag">dev only</span></h2>
          <p className="small muted demo-lede">
            Sign in as any §6 persona in the context they act in. Skips email verification and activation.
          </p>
        </div>
        <ResetControls compact />
      </header>

      {recentRows.length > 0 && (
        <div className="demo-recent">
          <span className="label">Recently played</span>
          <ul>
            {recentRows.map(r => (
              <li key={`${r.userId}:${r.projectId}`}>
                <button type="button" className="chip" onClick={() => play(r.user, r)}>
                  {r.user.name}
                  {r.project && <span className="chip-ctx">{projectLabel(r.project)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="demo-bar">
        <div className="tabs" role="tablist" aria-label="Group personas by">
          {VIEWS.map(v => (
            <button key={v.key} role="tab" aria-selected={!q && view === v.key} onClick={() => { setQuery(''); setView(v.key) }}>
              {v.label}
            </button>
          ))}
        </div>
        <input
          type="search" className="demo-search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Find a person, group or role" aria-label="Find a persona"
          onKeyDown={e => { if (e.key === 'Enter' && matches[0]) play(matches[0]) }}
        />
      </div>

      {q ? <Matches users={matches} snap={snap} query={query} onPlay={play} />
        : view === 'roles' ? <ByRole snap={snap} onPlay={play} />
          : view === 'scenarios' ? <Scenarios snap={snap} replaceStore={replaceStore} navigate={navigate} signIn={signIn} />
            : <ByProject snap={snap} onPlay={play} />}
    </section>
  )
}

/* --- By project: each group's cast at its current stage ------------------- */

function ByProject({ snap, onPlay }) {
  const casts = useMemo(() => (snap.projects ?? []).map(p => castOf(snap, p)), [snap])
  const mine = casts.filter(c => isPersonaProject(c.project)).sort((a, b) => a.project.id.localeCompare(b.project.id))
  const npc = casts.filter(c => !isPersonaProject(c.project))
    .sort((a, b) => a.project.program.localeCompare(b.project.program) || a.project.id.localeCompare(b.project.id))
  return (
    <div className="casts">
      {mine.map(c => <Cast key={c.project.id} cast={c} onPlay={onPlay} />)}
      {npc.length > 0 && (
        <details className="demo-more">
          <summary>Other groups <span className="faint">— {npc.length} NPC groups across NW, EMC, CYB and CS</span></summary>
          {npc.map(c => <Cast key={c.project.id} cast={c} onPlay={onPlay} compact />)}
        </details>
      )}
    </div>
  )
}

function Cast({ cast, onPlay, compact = false }) {
  const { project: p, students, faculty, offices, next } = cast
  const at = stageIndex(p.currentStage)
  const macro = macroStageOf(p.currentStage)
  const label = stageLabel(p.currentStage)
  const code = codeOf(p.program)
  const play = (e) => onPlay(e.user, { projectId: p.id, tab: e.turn?.next?.tab })
  // Students with a move collapse into one "the group" link (it plays the first of them).
  const dueStudents = next.filter(e => students.includes(e))
  const movers = [
    ...next.filter(e => !students.includes(e)),
    ...(dueStudents.length ? [{ ...dueStudents[0], group: `${dueStudents.length} of ${students.length}` }] : []),
  ]
  return (
    <article className={`cast${compact ? ' is-compact' : ''}`} aria-labelledby={`cast-${p.id}`}>
      <header className="cast-head">
        <span className="cast-id" aria-hidden="true">{projectLabel(p)}</span>
        <div className="cast-title">
          <h3 id={`cast-${p.id}`}><span className="sr-only">{projectLabel(p)}: </span>{p.title}</h3>
          <p className="small muted">
            {p.block || code}{' · '}
            <strong className="cast-stage">{macro}</strong>{macro !== label && ` — ${label}`}
          </p>
        </div>
        <div className="stage-track" title={`Stage ${at + 1} of ${STAGES.length}: ${label}`}>
          <span className="mono faint">{String(at + 1).padStart(2, '0')}/{STAGES.length}</span>
          <span className="track" aria-hidden="true"><span style={{ width: `${((at + 1) / STAGES.length) * 100}%` }} /></span>
        </div>
      </header>

      <p className="cast-next small">
        {movers.length
          ? <>Next move: {movers.map((e, i) => (
            <span key={e.user.id}>
              {i > 0 && ', '}
              <button type="button" className="linkish" onClick={() => play(e)}>{e.group ? 'the group' : e.user.name}</button>
              {e.group ? <span className="faint"> ({e.group})</span> : e.roles[0] && <span className="faint"> ({e.roles[0]})</span>}
            </span>
          ))}</>
          : <span className="faint">No one can move this project right now.</span>}
      </p>

      <div className="cast-cols">
        <CastCol title="Faculty on the project" entries={faculty} empty="No faculty assigned yet." onPlay={play} />
        {offices.length > 0 && <CastCol title="Offices acting now" entries={offices} onPlay={play} />}
        <CastCol title={`Group · ${students.length}`} entries={students} empty="No members." onPlay={play} hideRole />
      </div>
    </article>
  )
}

function CastCol({ title, entries, empty, onPlay, hideRole = false }) {
  return (
    <div className="cast-col">
      <div className="label">{title}</div>
      {entries.length === 0 ? <p className="small faint">{empty}</p> : (
        <ul className="who-list">
          {entries.map(e => (
            <li key={e.user.id}>
              <Who user={e.user} roles={hideRole ? [] : e.roles} turn={e.turn} onClick={() => onPlay(e)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One person to play: name, their hats here, and whether it is their move. */
function Who({ user, roles = [], turn = null, note = null, onClick }) {
  const due = turn?.ready > 0
  return (
    <button type="button" className={`who${due ? ' is-due' : ''}${user.status !== 'Active' ? ' is-inactive' : ''}`} onClick={onClick}>
      <span className="who-line">
        <span className="who-name">{user.name}</span>
        {roles.map(r => <span key={r} className="who-hat">{r}</span>)}
      </span>
      {due ? (
        <span className="who-turn">
          {turn.next?.label}{turn.ready > 1 && !turn.total && <span className="faint"> +{turn.ready - 1} more</span>}
        </span>
      ) : turn?.waiting ? (
        <span className="who-wait">Waiting — {turn.waiting.why}</span>
      ) : note ? <span className="who-wait">{note}</span> : null}
      <span className="who-go" aria-hidden="true">→</span>
    </button>
  )
}

/* --- By role: offices, faculty, students ---------------------------------- */

function ByRole({ snap, onPlay }) {
  const users = snap.users ?? []
  const { personas, npcs } = splitPersonas(users)
  const dueOf = useMemo(() => {
    const cache = new Map()
    return (u) => {
      if (!cache.has(u.id)) cache.set(u.id, actionableCount(worklist(snap, u)))
      return cache.get(u.id)
    }
  }, [snap])
  const summary = (u) => {
    const n = dueOf(u)
    return { ready: n, total: true, next: n ? { label: `${n} project${n > 1 ? 's' : ''} with something to do` } : null }
  }
  const has = (u, role) => (u.globalRoles ?? []).includes(role)
  const office = (u) => OFFICES.some(r => has(u, r))

  const faculty = personas.filter(u => !office(u) && !has(u, 'Student'))
  const students = personas.filter(u => has(u, 'Student'))
  const sections = [...new Set(students.map(u => u.block || 'No section'))].sort()
  const hatLine = (u) => hatsOf(u, snap).filter(h => h.role !== 'Member').map(h => `${h.label} ${h.role}`)
  const groupOf = (u) => hatsOf(u, snap).find(h => h.role === 'Member')?.label

  return (
    <div className="roles">
      <RoleBlock title="Offices" hint="Global Roles — they act across projects through their queues.">
        {OFFICES.map(role => {
          const holders = personas.filter(u => has(u, role))
          const npcHolders = npcs.filter(u => has(u, role))
          if (!holders.length && !npcHolders.length) return null
          return (
            <div key={role} className="role-row">
              <div className="role-name">{role}</div>
              <ul className="who-list">
                {holders.map(u => (
                  <li key={u.id}><Who user={u} roles={hatLine(u)} turn={summary(u)} note="Nothing to act on right now" onClick={() => onPlay(u)} /></li>
                ))}
                {npcHolders.map(u => (
                  <li key={u.id}>
                    <Who user={u} roles={u.programScope?.map(codeOf)} turn={summary(u)} onClick={() => onPlay(u)} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </RoleBlock>

      <RoleBlock title="Faculty" hint="No office — every permission comes from a project assignment.">
        <ul className="who-list role-grid">
          {faculty.map(u => (
            <li key={u.id}>
              <Who user={u} roles={hatLine(u)} turn={summary(u)} onClick={() => onPlay(u)}
                note={u.status !== 'Active' ? `${u.status} — waits for the System Administrator; resolves to no grants` : !hatLine(u).length ? 'No project assignments' : null} />
            </li>
          ))}
        </ul>
      </RoleBlock>

      <RoleBlock title="Students" hint="Grouped by section.">
        {sections.map(sec => (
          <div key={sec} className="role-row">
            <div className="role-name mono">{sec}</div>
            <ul className="who-list role-grid">
              {students.filter(u => (u.block || 'No section') === sec).map(u => (
                <li key={u.id}>
                  <Who user={u} roles={groupOf(u) ? [groupOf(u)] : []} turn={summary(u)} onClick={() => onPlay(u)}
                    note={groupOf(u) ? null : 'No group — the T14 empty state'} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </RoleBlock>

      <details className="demo-more">
        <summary>NPC accounts <span className="faint">— {npcs.length} filler students and faculty; find one by name above</span></summary>
        <ul className="who-list role-grid">
          {npcs.filter(u => !office(u)).map(u => (
            <li key={u.id}><Who user={u} roles={hatsOf(u, snap).map(h => `${h.label} ${h.role === 'Member' ? '' : h.role}`.trim())} onClick={() => onPlay(u)} /></li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function RoleBlock({ title, hint, children }) {
  return (
    <section className="role-block">
      <div className="role-block-head">
        <h3>{title}</h3>
        <span className="small faint">{hint}</span>
      </div>
      {children}
    </section>
  )
}

/* --- Search results -------------------------------------------------------- */

function Matches({ users, snap, query, onPlay }) {
  if (!users.length) return <p className="small muted demo-empty">No one matches “{query}”.</p>
  return (
    <div>
      <p className="small faint demo-hint">{users.length} match{users.length > 1 ? 'es' : ''} · Enter plays the first</p>
      <ul className="who-list role-grid">
        {users.map(u => (
          <li key={u.id}>
            <Who user={u}
              roles={[...(u.globalRoles ?? []).filter(r => r !== 'Faculty' && r !== 'Student'), ...hatsOf(u, snap).map(h => `${h.label} ${h.role === 'Member' ? '' : h.role}`.trim())]}
              onClick={() => onPlay(u)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --- §7 scenarios, filed under the project they test ---------------------- */

const lookTab = (look) =>
  /Weekly logs/.test(look) ? 'logs' : /Documents/.test(look) ? 'documents'
    : /Defense/.test(look) ? 'defense' : null

function Scenarios({ snap, replaceStore, navigate, signIn }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const running = useRef(false)
  const users = snap.users ?? []
  const nameOf = (id) => users.find(u => u.id === id)?.name ?? id
  const titleOf = (id) => (snap.projects ?? []).find(p => p.id === id)?.title ?? ''

  async function load(sc) {
    if (running.current) return
    running.current = true
    setBusy(sc.id); setError('')
    try {
      await replaceStore(scenarioStore(sc.id))
      const path = /^Dev tools/.test(sc.look) ? '/dev'
        : !sc.on || /^Worklist/.test(sc.look) ? '/' : pathTo(sc.on, lookTab(sc.look))
      navigate(path)
      signIn(sc.loginAs)
    } catch (e) {
      setError(e.message ?? String(e))
    } finally {
      running.current = false
      setBusy(null)
    }
  }

  const groups = [...new Set(SCENARIOS.map(s => s.on))]
  return (
    <div className="scenarios">
      <p className="small muted demo-hint">
        Loading a scenario replaces the demo data with a fresh seed plus that setup, then signs in as its persona
        where the scenario says to look. Save a checkpoint first if you want to come back.
      </p>
      {error && <p className="small error-text" role="alert">{error}</p>}
      {groups.map(on => (
        <section key={on ?? 'none'} className="sc-group">
          <div className="role-block-head">
            <h3>{on ? on.slice(2).toUpperCase() : 'Accounts and audit'}</h3>
            <span className="small faint">{on ? titleOf(on) : 'No single project'}</span>
          </div>
          <ol className="sc-list">
            {SCENARIOS.filter(s => s.on === on).map(sc => (
              <li key={sc.id} className="sc">
                <span className="sc-id">{sc.id}</span>
                <div className="sc-body">
                  <div className="sc-who"><strong>{nameOf(sc.loginAs)}</strong> <span className="faint">· {sc.look}</span></div>
                  <p className="small muted">{sc.expect}</p>
                </div>
                <button type="button" className="small" disabled={busy !== null} onClick={() => load(sc)}>
                  {busy === sc.id ? 'Loading…' : 'Load'}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
