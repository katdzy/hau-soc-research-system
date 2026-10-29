import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { STAGES, stageIndex, stageLabel, macroStageOf } from '../domain/stages.js'
import { PROGRAM_INFO } from '../domain/constants.js'
import { worklist } from '../services/worklist.js'
import { contextsOf, contextByKey, rowsIn, hatsOf as contextHats } from '../domain/workspaces.js'
import { owedBy } from '../pages/dashboards/parts.jsx'
import { SCENARIOS, scenarioStore } from './scenarios.js'
import { castOf, hatsOf, isPersonaProject, projectLabel, splitPersonas } from './personas.js'
import ResetControls from './ResetControls.jsx'
import './dev.css'

/**
 * Dev-only demo panel on the sign-in screen (R9). Built for teammates who do
 * not know the test plan: pick a role, and one click signs in as a test
 * account for it, on that role's dashboard. The same people can be found by
 * group (each group's cast at its stage) or through a §7 scenario. Skips email
 * verification and activation on purpose.
 */

const VIEWS = [
  { key: 'roles', label: 'Roles' },
  { key: 'groups', label: 'Groups' },
  { key: 'scenarios', label: 'Test scenarios' },
]

// The eleven "Acting as" roles, in three plain-language families.
const FAMILIES = [
  { title: 'Students', hint: 'A group member. Sees only their own group.', keys: ['student'] },
  {
    title: 'Faculty on a group', hint: 'Every permission comes from the role held on that group.',
    keys: ['instructor-1', 'adviser', 'panel-chair', 'panel-member', 'instructor-2'],
  },
  {
    title: 'Offices', hint: 'School-wide roles. A group opens to them only while one of its steps is theirs.',
    keys: ['coordinator', 'associate-dean', 'dean', 'uro', 'admin'],
  },
]

const ABOUT = {
  student: 'Uploads the group’s documents, weekly logs and signed forms; sees deadlines, schedules and verdicts.',
  'instructor-1': 'Runs a Capstone 1 section: creates the groups, checks drafts after the adviser, moves groups on to Capstone 2.',
  adviser: 'Reviews and returns drafts, signs weekly logs, verifies revisions and recommends the group for final defense.',
  'panel-chair': 'Leads the defense panel and records the official verdict.',
  'panel-member': 'Reads the latest manuscript before the defense and keeps private notes.',
  'instructor-2': 'Runs Capstone 2: confirms milestones and readiness, and publishes the final defense schedule.',
  coordinator: 'Program Chair. Assigns advisers, panels and Instructor 2, and endorses groups for final defense.',
  'associate-dean': 'Approves adviser assignments and gives the final approval, with the Dean.',
  dean: 'Approves adviser assignments and gives the final institutional signature.',
  uro: 'University Research Office. Verifies the certificates and the final manuscript before final approval.',
  admin: 'Activates accounts and manages roles and overrides. Never opens a group’s documents.',
}

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
  const [view, setViewState] = useState(() => {
    const saved = store.get(VIEW_KEY, 'roles')
    return VIEWS.some(v => v.key === saved) ? saved : 'roles'
  })
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(() => store.get(RECENT_KEY, []))
  const users = snap.users ?? []
  const projects = snap.projects ?? []

  const setView = (v) => { setViewState(v); store.set(VIEW_KEY, v) }

  /**
   * Sign in as `user`, landing where they act: a project tab, or the
   * dashboard of the role (`context`) they were picked for.
   */
  function play(user, { projectId = null, tab = null, context = null } = {}) {
    const entry = { userId: user.id, projectId, tab, context }
    const next = [entry, ...recent.filter(r => r.userId !== user.id || r.projectId !== projectId || r.context !== context)].slice(0, 6)
    store.set(RECENT_KEY, next)
    setRecent(next)
    if (context) {
      try { localStorage.setItem(`hausoc.context.${user.id}`, context) } catch { /* private window */ }
    }
    navigate(pathTo(projectId, tab))
    signIn(user.id)
  }

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return []
    const { personas, npcs } = splitPersonas(users)
    return personas.concat(npcs).filter(u => {
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
          <h2 id="demo-h">Test as any role <span className="dev-flag">dev only</span></h2>
          <p className="demo-lede">
            Pick a role and click a name: you are signed in as that test account, no password, on that
            role’s dashboard. To come back here, use <strong>Switch persona</strong> in the sidebar or sign out.
          </p>
        </div>
        <ResetControls compact />
      </header>

      <details className="demo-guide">
        <summary>How the test data works</summary>
        <dl>
          <dt>G1–G4</dt>
          <dd>The four main test groups from the test plan (§6), each at a different point:
            G1 choosing a topic, G2 at its proposal defense, G3 in Capstone 2, G4 just formed.</dd>
          <dt>NW1 … CS3</dt>
          <dd>Extra groups for the other programs, so queues, rosters and reports are not empty. Nothing depends on them.</dd>
          <dt>Names</dt>
          <dd>Test personas are call signs (Prof. Alpha, Kilo Student). Extra faculty are Greek letters (Prof. Kappa);
            extra students are named after their group (NW1 Student 2). No address here is ever emailed.</dd>
          <dt>Reset to seed</dt>
          <dd>Puts every group back where it started. Save a checkpoint first if you want to return to where you are.</dd>
        </dl>
      </details>

      {recentRows.length > 0 && (
        <div className="demo-recent">
          <span className="label">Recently played</span>
          <ul>
            {recentRows.map(r => (
              <li key={`${r.userId}:${r.projectId}:${r.context}`}>
                <button type="button" className="chip" onClick={() => play(r.user, r)}>
                  {r.user.name}
                  {(r.project || r.context) && (
                    <span className="chip-ctx">{r.project ? projectLabel(r.project) : contextByKey(r.context)?.heading}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="demo-bar">
        <div className="tabs" role="tablist" aria-label="Find test accounts by">
          {VIEWS.map(v => (
            <button key={v.key} role="tab" aria-selected={!q && view === v.key} onClick={() => { setQuery(''); setView(v.key) }}>
              {v.label}
            </button>
          ))}
        </div>
        <input
          type="search" className="demo-search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search a name, group or role" aria-label="Search test accounts"
          onKeyDown={e => { if (e.key === 'Enter' && matches[0]) play(matches[0]) }}
        />
      </div>

      {q ? <Matches users={matches} snap={snap} query={query} onPlay={play} />
        : view === 'groups' ? <ByGroup snap={snap} onPlay={play} />
          : view === 'scenarios' ? <Scenarios snap={snap} replaceStore={replaceStore} navigate={navigate} signIn={signIn} />
            : <ByRole snap={snap} onPlay={play} />}
    </section>
  )
}

/* --- Roles: the eleven "Acting as" roles and who to play for each ------------ */

function ByRole({ snap, onPlay }) {
  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const { personas, npcs } = splitPersonas(users)

  // Who holds which role, and — for the §6 personas — what each owes in it.
  const held = useMemo(() => new Map(users.map(u => [u.id, contextsOf(u, snap)])), [users, snap])
  const owes = useMemo(() => {
    const out = new Map()
    for (const u of personas) {
      const rows = worklist(snap, u)
      for (const c of held.get(u.id)) out.set(`${u.id}:${c.key}`, owedBy(rowsIn(c, rows), contextHats(c)).filter(i => i.ready).length)
    }
    return out
  }, [personas, held, snap])

  const noRole = personas.filter(u => !(u.globalRoles ?? []).includes('Student') && !held.get(u.id).length)
  const label = (id) => projectLabel(projects.find(p => p.id === id))
  const where = (u, c) => {
    if (c.member) {
      const p = projects.find(x => x.id === c.projectIds[0])
      return p ? `${projectLabel(p)} · ${stageLabel(p.currentStage)}` : ''
    }
    if (c.key === 'coordinator') return (u.programScope ?? []).map(codeOf).join(', ')
    if (c.global) return ''
    return c.projectIds.map(label).join(', ') || c.scope
  }

  return (
    <div className="families">
      {FAMILIES.map(f => (
        <section key={f.title} className="family" aria-labelledby={`fam-${f.title}`}>
          <header className="family-head">
            <h3 id={`fam-${f.title}`}>{f.title}</h3>
            <p>{f.hint}</p>
          </header>
          {f.keys.map(key => {
            const c = contextByKey(key)
            const of = (list) => list.map(u => [u, held.get(u.id).find(x => x.key === key)]).filter(([, x]) => x)
            const mine = of(personas)
            const extra = of(npcs)
            // A student with no group yet has no role to act as: the T14 empty state.
            const ungrouped = key === 'student'
              ? personas.filter(u => (u.globalRoles ?? []).includes('Student') && !held.get(u.id).length) : []
            return (
              <div key={key} className="role-card">
                <div className="role-about">
                  <h4>{c.heading === 'Program Chair' ? 'Program Chair / Coordinator' : c.heading}</h4>
                  <p>{ABOUT[key]}</p>
                </div>
                <div className="role-people">
                  <ul className="play-list">
                    {mine.map(([u, ctx]) => (
                      <li key={u.id}>
                        <Play user={u} where={where(u, ctx)} due={owes.get(`${u.id}:${key}`)}
                          onClick={() => onPlay(u, { context: key })} />
                      </li>
                    ))}
                    {ungrouped.map(u => (
                      <li key={u.id}>
                        <Play user={u} where={`${u.block} · no group yet`} onClick={() => onPlay(u)} />
                      </li>
                    ))}
                    {mine.length + ungrouped.length === 0 && extra.length === 0 && (
                      <li className="play-none">No test account holds this role yet.</li>
                    )}
                  </ul>
                  {extra.length > 0 && (
                    <details className="play-more">
                      <summary>{mine.length ? `${extra.length} more` : `${extra.length} account${extra.length > 1 ? 's' : ''}`} in the extra groups</summary>
                      <ul className="play-list is-compact">
                        {extra.map(([u, ctx]) => (
                          <li key={u.id}><Play user={u} where={where(u, ctx)} onClick={() => onPlay(u, { context: key })} /></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
      {noRole.length > 0 && (
        <section className="family" aria-labelledby="fam-none">
          <header className="family-head">
            <h3 id="fam-none">No role yet</h3>
            <p>Faculty accounts the workflow has not given a role. They resolve to no permissions.</p>
          </header>
          <ul className="play-list role-card-solo">
            {noRole.map(u => (
              <li key={u.id}>
                <Play user={u} onClick={() => onPlay(u)}
                  where={u.status !== 'Active' ? `${u.status} — waiting for the System Administrator to activate it` : 'No project assignments'} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** One account to play: name, where they act in this role, and how much is waiting. */
function Play({ user, where, due = 0, onClick }) {
  return (
    <button type="button" className={`play${due ? ' is-due' : ''}`} onClick={onClick}>
      <span className="play-text">
        <span className="play-name">{user.name}</span>
        {where && <span className="play-where">{where}</span>}
      </span>
      {due > 0 && <span className="play-due">{due} to do</span>}
      <span className="play-go" aria-hidden="true">→</span>
    </button>
  )
}

/* --- Groups: each group's cast at its current stage ---------------------------- */

function ByGroup({ snap, onPlay }) {
  const casts = useMemo(() => (snap.projects ?? []).map(p => castOf(snap, p)), [snap])
  const mine = casts.filter(c => isPersonaProject(c.project)).sort((a, b) => a.project.id.localeCompare(b.project.id))
  const npc = casts.filter(c => !isPersonaProject(c.project))
    .sort((a, b) => a.project.program.localeCompare(b.project.program) || a.project.id.localeCompare(b.project.id))
  return (
    <div className="casts">
      <p className="demo-hint">
        Everyone with a part in each group. <span className="who-dot" aria-hidden="true" /> marks whose move it is;
        clicking a name opens the group on the tab where that person acts.
      </p>
      {mine.map(c => <Cast key={c.project.id} cast={c} onPlay={onPlay} />)}
      {npc.length > 0 && (
        <details className="demo-more">
          <summary>Extra groups <span className="faint">— {npc.length} across NW, EMC, CYB and CS</span></summary>
          <div className="casts">
            {npc.map(c => <Cast key={c.project.id} cast={c} onPlay={onPlay} compact />)}
          </div>
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
          <p>{p.block || codeOf(p.program)} · <strong>{macro}</strong>{macro !== label && ` — ${label}`}</p>
        </div>
        <div className="stage-track" title={`${label}: step ${at + 1} of ${STAGES.length}`}>
          <span>Step {at + 1} of {STAGES.length}</span>
          <span className="track" aria-hidden="true"><span style={{ width: `${((at + 1) / STAGES.length) * 100}%` }} /></span>
        </div>
      </header>

      <p className="cast-next">
        <span className="label">Whose move</span>
        {movers.length
          ? movers.map((e, i) => (
            <span key={e.user.id}>
              {i > 0 && <span className="faint"> · </span>}
              <button type="button" className="linkish" onClick={() => play(e)}>{e.group ? 'The group' : e.user.name}</button>
              {e.group ? <span className="faint"> ({e.group} students)</span> : e.roles[0] && <span className="faint"> as {e.roles[0]}</span>}
            </span>
          ))
          : <span className="faint">No one can move this group right now.</span>}
      </p>

      <div className="cast-cols">
        <CastCol title="Faculty" entries={faculty} empty="No faculty assigned yet." onPlay={play} />
        {offices.length > 0 && <CastCol title="Offices acting now" entries={offices} onPlay={play} />}
        <CastCol title={`Students · ${students.length}`} entries={students} empty="No members." onPlay={play} hideRole />
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

/** One person in a group's cast: name, their roles there, and whether it is their move. */
function Who({ user, roles = [], turn = null, onClick }) {
  const due = turn?.ready > 0
  return (
    <button type="button" className={`who${due ? ' is-due' : ''}${user.status !== 'Active' ? ' is-inactive' : ''}`} onClick={onClick}>
      <span className="who-line">
        <span className="who-name">{user.name}</span>
        {roles.map(r => <span key={r} className="who-hat">{r}</span>)}
      </span>
      {due ? (
        <span className="who-turn">
          <span>{turn.next?.label}{turn.ready > 1 && <span className="faint"> · +{turn.ready - 1} more</span>}</span>
        </span>
      ) : turn?.waiting ? (
        <span className="who-wait">Waiting — {turn.waiting.why}</span>
      ) : null}
      <span className="who-go" aria-hidden="true">→</span>
    </button>
  )
}

/* --- Search results ------------------------------------------------------------ */

function Matches({ users, snap, query, onPlay }) {
  if (!users.length) return <p className="demo-empty">No one matches “{query}”.</p>
  return (
    <div>
      <p className="demo-hint">{users.length} match{users.length > 1 ? 'es' : ''} · Enter plays the first</p>
      <ul className="play-list role-grid">
        {users.map(u => (
          <li key={u.id}>
            <Play user={u} onClick={() => onPlay(u)}
              where={[...(u.globalRoles ?? []).filter(r => r !== 'Faculty' && r !== 'Student'),
                ...hatsOf(u, snap).map(h => `${h.label}${h.role === 'Member' ? '' : ` ${h.role}`}`)].join(' · ')} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --- §7 scenarios, filed under the group they test ------------------------------ */

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
      <p className="demo-hint">
        The test plan’s checks (§7, T1–T21). <strong>Load</strong> resets the data, sets up the case, and signs you
        in as the person to test with, on the right screen. Each line says what you should see.
      </p>
      {error && <p className="small error-text" role="alert">{error}</p>}
      {groups.map(on => (
        <section key={on ?? 'none'} className="sc-group">
          <div className="family-head">
            <h3>{on ? on.slice(2).toUpperCase() : 'Accounts and audit'}</h3>
            <p>{on ? titleOf(on) : 'Not tied to one group'}</p>
          </div>
          <ol className="sc-list">
            {SCENARIOS.filter(s => s.on === on).map(sc => (
              <li key={sc.id} className="sc">
                <span className="sc-id">{sc.id}</span>
                <div className="sc-body">
                  <div className="sc-who"><strong>{nameOf(sc.loginAs)}</strong> <span className="faint">· {sc.look}</span></div>
                  <p><span className="faint">Expect:</span> {sc.expect}</p>
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
