import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { db, isLiveBackend } from '../backend/index.js'
import { applyStage } from '../backend/stageBuilder.js'
import { STAGES, stageLabel, macroStageOf } from '../domain/stages.js'
import { FLAGS, FLAG_NOTES } from '../domain/flags.js'
import { GLOBAL_ROLES as G, PROJECT_ROLES, ACCOUNT_STATUS, programCode } from '../domain/constants.js'
import { allowedActions } from '../domain/guard.js'
import { worklist } from '../services/worklist.js'
import { verifyEmail, flagOverdueRevisions, confirmProviderVerification } from '../services/api.js'
import { loginWithFirebase, getAuthInstance } from '../services/authService.js'
import { fmtDateTime } from '../components/ui.jsx'
import { readCheckpoint, writeCheckpoint, toStore } from './checkpoint.js'
import { rolesForStage, diffStores } from './spawn.js'
import Spawner from './Spawner.jsx'
import { Icon, Avatar } from './icons.jsx'
import './dev.css'

/**
 * Dev-only (R9) floating test panel, on every screen including sign-in:
 * sign in as anyone, spawn accounts / sections / groups, jump a group to a
 * stage, and read the mock outbox, audit trail and flags. It works on the
 * in-browser store only (VITE_BACKEND=local) — nothing reaches Firebase, and
 * no emulators are needed. These controls bypass the guard on purpose: they
 * set data up, they never act as anyone. On a live Firebase project only the
 * tabs marked `onLive` are shown (Stage, checkpoints and wipe rewrite whole
 * collections). People there lists the dummy accounts (live-accounts.json) and
 * signs in as them for real, with their shared test password; Spawn sends its
 * change to the dev server (scripts/live-spawn/devServer.mjs), which makes the
 * real logins and refuses anything that is not dummy data.
 */

const TABS = [
  { key: 'people', label: 'People', icon: 'people', onLive: true },
  { key: 'spawn', label: 'Spawn', icon: 'spawn', onLive: true },
  { key: 'stage', label: 'Stage', icon: 'stage' },
  { key: 'outbox', label: 'Outbox', icon: 'mail', onLive: true },
  { key: 'trail', label: 'Trail', icon: 'trail', onLive: true },
  { key: 'rules', label: 'Rules', icon: 'rules', onLive: true },
]
const tabsHere = isLiveBackend ? TABS.filter(t => t.onLive) : TABS

// Written by scripts/live-spawn/spawn-live.mjs (gitignored); absent until it has run.
const LIVE_ACCOUNTS = Object.values(import.meta.glob('./live-accounts.json', { eager: true, import: 'default' }))[0] ?? []

const remember = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ } },
}
const OPEN_KEY = 'hausoc.testpanel.open'
const TAB_KEY = 'hausoc.testpanel.tab'
const WIDE_KEY = 'hausoc.testpanel.wide'
const BUBBLE_KEY = 'hausoc.testpanel.bubble'
const WINDOW_KEY = 'hausoc.testpanel.window'

const BUBBLE = 52
const GAP = 8
const PHONE = 600 // below this the window is a full-width sheet (dev.css), not dragged

/** The viewport size, kept current, so dragged things stay on screen after a resize. */
function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}

const clampTo = (vp, w, h) => (p) => ({
  x: Math.round(Math.min(Math.max(GAP, p.x), Math.max(GAP, vp.w - w - GAP))),
  y: Math.round(Math.min(Math.max(GAP, p.y), Math.max(GAP, vp.h - h - GAP))),
})

/**
 * Pointer dragging for one fixed element, its top-left remembered under
 * `key` (null: not moved yet). Arrow keys on the handle move it 16px (64 with
 * Shift). `moved` says whether the last press was a drag, not a click.
 */
function useDraggable(key, clamp) {
  const [pos, setPos] = useState(() => remember.get(key, null))
  const drag = useRef(null)
  const last = useRef(pos)
  const moved = useRef(false)
  const place = (p) => { last.current = p; setPos(p) }

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('[data-nodrag]')) return
    const box = e.currentTarget.closest('[data-drag-box]') ?? e.currentTarget
    const r = box.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, sx: e.clientX, sy: e.clientY }
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    if (!moved.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
    moved.current = true
    place(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, d.w, d.h))
  }
  const onPointerUp = () => {
    if (drag.current && moved.current) remember.set(key, last.current)
    drag.current = null
  }
  const nudge = (e, from) => {
    const step = e.shiftKey ? 64 : 16
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!dir) return
    e.preventDefault()
    const p = clamp({ x: from.x + dir[0] * step, y: from.y + dir[1] * step })
    place(p); remember.set(key, p)
  }
  const reset = () => { place(null); remember.set(key, null) }
  return { pos, moved, reset, nudge, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

const initialsOf = (name = '') => name.replace(/^(Prof\.|Dean|Dr\.)\s+/, '').split(/\s+/).filter(Boolean)
  .slice(0, 2).map(w => w[0]).join('').toUpperCase()

/** "Group 2 · WD-401" for an untitled group, else its title (shortened). */
const groupLabel = (p) => {
  if (!p) return '?'
  const m = /^Untitled — Group (\d+) \((.+)\)$/.exec(p.title ?? '')
  if (m) return `Group ${m[1]} · ${m[2]}`
  return p.title.length > 34 ? `${p.title.slice(0, 33)}…` : p.title
}

export default function TestPanel() {
  const { snap, me, signIn, signOut, replaceStore } = useApp()
  const navigate = useNavigate()
  const noUsers = !isLiveBackend && (snap.users ?? []).length === 0
  const [open, setOpenState] = useState(() => remember.get(OPEN_KEY, null) ?? noUsers)
  const [tab, setTabState] = useState(() => {
    const saved = remember.get(TAB_KEY, null)
    return noUsers ? 'spawn' : tabsHere.some(t => t.key === saved) ? saved : tabsHere[0].key
  })
  const [wide, setWideState] = useState(() => remember.get(WIDE_KEY, false))
  const [status, setStatus] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const panelRef = useRef(null)
  const launcherRef = useRef(null)

  // Where the bubble and the window sit. The window, until it is dragged,
  // opens beside the bubble — above it in the lower half of the screen.
  const vp = useViewport()
  const phone = vp.w < PHONE
  const winW = Math.min(wide ? 880 : 440, vp.w - 2 * GAP)
  const winH = Math.min(760, vp.h - BUBBLE - 5 * GAP) // room to open beside the bubble without covering it
  const bubble = useDraggable(BUBBLE_KEY, (p, w = BUBBLE, h = BUBBLE) => clampTo(vp, w, h)(p))
  const win = useDraggable(WINDOW_KEY, (p, w = winW, h = winH) => clampTo(vp, w, h)(p))
  const bubbleAt = clampTo(vp, BUBBLE, BUBBLE)(bubble.pos ?? { x: vp.w - BUBBLE - 16, y: vp.h - BUBBLE - 16 })
  const winAt = clampTo(vp, winW, winH)(win.pos ?? {
    x: bubbleAt.x + BUBBLE - winW,
    y: bubbleAt.y > vp.h / 2 ? bubbleAt.y - GAP - winH : bubbleAt.y + BUBBLE + GAP,
  })

  const setOpen = setOpenState
  // Remembered from the first render, so an auto-opened panel stays open across reloads.
  useEffect(() => { remember.set(OPEN_KEY, open) }, [open])
  const setTab = (v) => { setTabState(v); remember.set(TAB_KEY, v); setStatus({ text: '', error: false }) }
  const setWide = (v) => { setWideState(v); remember.set(WIDE_KEY, v) }

  // ` toggles the panel from anywhere outside a text field; Esc inside closes it —
  // except in a field, where Esc belongs to the field (clears a search, shuts a list).
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if (e.key === '`' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setOpen(!open) }
      if (e.key === 'Escape' && open && !typing && panelRef.current?.contains(e.target)) { setOpen(false); launcherRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Apply a store transform `times` times and write the result once. */
  async function edit(fn, times = 1) {
    if (busy) return
    setBusy(true)
    try {
      if (isLiveBackend && !me) throw new Error('Sign in first (People): signed out, the live rules show none of the store.')
      const before = toStore(db.snapshot())
      let store = before
      let note = ''
      for (let i = 0; i < times; i++) {
        const r = fn(store)
        store = r.store; note = r.note
      }
      await (isLiveBackend ? sendToDevServer(diffStores(before, store)) : replaceStore(store))
      setStatus({ text: times > 1 ? `${note} (×${times})` : note, error: false })
    } catch (e) {
      setStatus({ text: e.message ?? String(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function task(fn) {
    if (busy) return
    setBusy(true)
    try { setStatus({ text: await fn(), error: false }) } catch (e) { setStatus({ text: e.message ?? String(e), error: true }) } finally { setBusy(false) }
  }

  const outboxCount = (snap.outbox ?? []).length

  return (
    <>
      <button ref={launcherRef} type="button" className={`tp-bubble${open ? ' is-open' : ''}`} aria-expanded={open}
        aria-controls="test-panel" style={{ left: bubbleAt.x, top: bubbleAt.y }}
        aria-label={`Test panel — ${me ? `signed in as ${me.name}` : 'signed out'}. Drag to move, or arrow keys.`}
        title={`Test panel ( \` ) — ${me ? me.name : 'signed out'}. Drag to move; double-click to send it back to the corner.`}
        {...bubble.handle}
        onClick={() => { if (bubble.moved.current) { bubble.moved.current = false; return } setOpen(!open) }}
        onDoubleClick={() => { bubble.reset(); win.reset() }}
        onKeyDown={e => bubble.nudge(e, bubbleAt)}>
        <span className="tp-bubble-face" aria-hidden="true">{me ? initialsOf(me.name) : 'T'}</span>
        <span className="tp-bubble-tag" aria-hidden="true">test</span>
        {outboxCount > 0 && <span className="tp-bubble-count" aria-hidden="true">{outboxCount > 99 ? '99+' : outboxCount}</span>}
      </button>

      {open && (
        <aside id="test-panel" ref={panelRef} data-drag-box className={`tp${wide ? ' is-wide' : ''}`} aria-label="Test panel"
          style={phone ? undefined : { left: winAt.x, top: winAt.y, width: winW, height: winH }}>
          <header className={`tp-head${phone ? '' : ' is-handle'}`} {...(phone ? {} : win.handle)}
            onDoubleClick={e => { if (!e.target.closest('[data-nodrag]')) win.reset() }}
            title={phone ? undefined : 'Drag to move · double-click to dock it by the bubble'}>
            <div className="tp-title">
              {!phone && (
                <button type="button" className="tp-grip" aria-label="Move the test panel with the arrow keys"
                  onKeyDown={e => win.nudge(e, winAt)}>
                  <Icon name="grip" />
                </button>
              )}
              <strong>Test panel</strong>
              <span className={`tp-pill${isLiveBackend ? ' is-live' : ''}`}>
                <span className="tp-pill-dot" aria-hidden="true" />{isLiveBackend ? 'live Firebase' : 'local store'}
              </span>
            </div>
            <div className="tp-head-actions" data-nodrag>
              {!phone && (
                <button type="button" className="tp-icon" onClick={() => setWide(!wide)} aria-pressed={wide}
                  title={wide ? 'Narrow' : 'Widen'}><Icon name={wide ? 'narrow' : 'widen'} /><span className="sr-only">{wide ? 'Narrow the panel' : 'Widen the panel'}</span></button>
              )}
              <button type="button" className="tp-icon" onClick={() => { setOpen(false); launcherRef.current?.focus() }}
                title="Close ( ` or Esc )"><Icon name="close" /><span className="sr-only">Close the test panel</span></button>
            </div>
          </header>

          <div className="tp-me">
            {me ? (
              <>
                <Avatar name={me.name} kind={kindOf(me)} />
                <span className="tp-me-text" title={`${me.name} · ${me.email}`}>
                  <strong>{me.name}</strong>
                  <span className="tp-sub">{(me.globalRoles ?? []).join(' · ') || 'No Global Role'}</span>
                </span>
                <button type="button" className="tp-btn is-quiet has-icon" disabled={busy}
                  onClick={() => task(async () => { await signOut(); navigate('/'); return 'Signed out.' })}>
                  <Icon name="signout" />Sign out
                </button>
              </>
            ) : (
              <>
                <span className="tp-avatar is-empty" aria-hidden="true"><Icon name="people" /></span>
                <span className="tp-me-text"><strong>Not signed in</strong><span className="tp-sub">Pick an account in People</span></span>
                {tab !== 'people' && (
                  <button type="button" className="tp-btn is-quiet has-icon" onClick={() => setTab('people')}>
                    Pick someone<Icon name="arrow" />
                  </button>
                )}
              </>
            )}
          </div>

          <nav className="tp-tabs" role="tablist" aria-label="Test panel sections" style={{ '--tp-tabs': tabsHere.length }}>
            {tabsHere.map(t => (
              <button key={t.key} type="button" role="tab" id={`tp-tab-${t.key}`} aria-selected={tab === t.key}
                aria-controls="tp-body" onClick={() => setTab(t.key)}>
                <span className="tp-tab-icon">
                  <Icon name={t.icon} size={18} />
                  {t.key === 'outbox' && outboxCount > 0 && <span className="tp-count">{outboxCount > 99 ? '99+' : outboxCount}</span>}
                </span>
                <span className="tp-tab-label">{t.label}</span>
                {t.key === 'outbox' && outboxCount > 0 && <span className="sr-only"> ({outboxCount} emails)</span>}
              </button>
            ))}
          </nav>

          <div key={tab} className="tp-body" id="tp-body" role="tabpanel" aria-labelledby={`tp-tab-${tab}`}>
            {tab === 'people' && (isLiveBackend
              ? <LivePeople snap={snap} me={me} task={task} busy={busy} onSignedIn={(id) => { signIn(id); navigate('/') }} />
              : <People snap={snap} me={me} onPick={(u, path) => { navigate(path); signIn(u.id) }} goSpawn={() => setTab('spawn')} />)}
            {tab === 'spawn' && (
              <>
                {isLiveBackend && <LivePassword compact />}
                <Spawner store={toStore(snap)} edit={edit} busy={busy} me={me} />
              </>
            )}
            {tab === 'stage' && <Stage snap={snap} me={me} edit={edit} task={task} busy={busy} />}
            {tab === 'outbox' && <Outbox snap={snap} task={task} busy={busy} readOnly={isLiveBackend} />}
            {tab === 'trail' && <Trail snap={snap} />}
            {tab === 'rules' && <Rules />}
          </div>

          <footer className="tp-foot">
            <Status busy={busy} status={status} onDismiss={() => setStatus({ text: '', error: false })} />
            {!isLiveBackend && <DataControls snap={snap} me={me} busy={busy} task={task} replaceStore={replaceStore} signIn={signIn} />}
          </footer>
        </aside>
      )}
    </>
  )
}

/**
 * The footer line: "Working…" while a change is in flight (a live spawn makes
 * logins and can take a few seconds), then what happened — a refusal stands
 * out and stays until dismissed or the tab changes.
 */
function Status({ busy, status, onDismiss }) {
  const kind = busy ? 'busy' : !status.text ? 'idle' : status.error ? 'error' : 'ok'
  return (
    <div className={`tp-status is-${kind}`} role="status" aria-live="polite" aria-busy={busy}>
      {kind === 'idle' && <span className="tp-status-idle">Ready · <kbd>`</kbd> toggles the panel</span>}
      {kind === 'busy' && <><span className="tp-working" aria-hidden="true" /><span>Working…</span></>}
      {(kind === 'ok' || kind === 'error') && (
        <>
          <Icon name={kind === 'error' ? 'alert' : 'check'} />
          <span className="tp-status-text">{status.text}</span>
          <button type="button" className="tp-icon is-small" onClick={onDismiss} title="Dismiss">
            <Icon name="close" /><span className="sr-only">Dismiss</span>
          </button>
        </>
      )}
    </div>
  )
}

/* --- Spawn on a live project: the dev server makes the logins ------------------------ */

async function sendToDevServer(changes) {
  if (!changes.length) return
  const { auth } = await getAuthInstance()
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in first (People).')
  const res = await fetch('/__live-spawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ changes, password: session.get() }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 404) throw new Error('This dev server has no live spawner — restart it (docker compose -f docker-compose.live.yml up -d --force-recreate).')
  if (!res.ok) throw new Error(body.error ?? `The dev server refused (${res.status}).`)
}

// Same rule as the dev server's (scripts/live-spawn/core.mjs passwordProblem), checked here first.
const passwordHint = (pw) => (!pw ? 'Not set — new logins need it.' : pw.length < 8 ? 'At least 8 characters.' : null)

/**
 * The shared test password: every dummy login gets it when spawned, and People
 * signs in with it. Kept for this browser tab only (sessionStorage).
 */
function LivePassword({ compact = false }) {
  const [password, setPassword] = useState(session.get)
  const hint = passwordHint(password)
  return (
    <div className={`tp-password${compact ? ' is-compact' : ''}`}>
      <label className="tp-label" htmlFor="tp-live-password">Test password <span className="tp-sub">— every dummy login shares it</span></label>
      <span className="tp-input-icon">
        <Icon name="key" />
        <input id="tp-live-password" type="password" value={password} autoComplete="off"
          autoFocus={!compact && !password && finePointer()} aria-describedby="tp-live-password-hint"
          onChange={e => { setPassword(e.target.value); session.set(e.target.value) }} />
      </span>
      <p id="tp-live-password-hint" className={`tp-hint${hint && password ? ' is-error' : ''}`}>
        {hint ?? 'Set for this tab. Spawned accounts get it; People signs in with it.'}
      </p>
      {compact && (
        <p className="tp-hint">On live, Spawn makes real logins and changes test data only. Stage, checkpoints and
          wipe work on the local store or the emulators.</p>
      )}
    </div>
  )
}

/* --- People on a live project: real sign-in as a dummy account ------------------------ */

const PASSWORD_KEY = 'hausoc.testpanel.livepw'
const session = {
  get() { try { return sessionStorage.getItem(PASSWORD_KEY) ?? '' } catch { return '' } },
  set(v) { try { sessionStorage.setItem(PASSWORD_KEY, v) } catch { /* private window */ } },
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong test password, or that login no longer exists.',
  'auth/wrong-password': 'Wrong test password.',
  'auth/user-not-found': 'That account has no login on this project.',
  'auth/too-many-requests': 'Too many tries — Firebase is blocking sign-in for a while.',
}

function LivePeople({ snap, me, task, busy, onSignedIn }) {
  const [query, setQuery] = useState('')
  // The script's list (works signed out) with what the store shows once signed in.
  const accounts = useMemo(() => {
    const byEmail = new Map(LIVE_ACCOUNTS.map(u => [u.email, u]))
    for (const u of snap.users ?? []) if (u.spawned && u.demo) byEmail.set(u.email, u)
    return [...byEmail.values()]
  }, [snap.users])

  const signInAs = (u) => task(async () => {
    const password = session.get()
    if (!password) throw new Error('Enter the test password first.')
    try {
      const { user } = await loginWithFirebase(u.email, password)
      await db.authSettled(user.uid)
    } catch (e) {
      throw new Error(AUTH_ERRORS[e.code] ?? e.message)
    }
    const record = await confirmProviderVerification(u.email)
    if (!record) throw new Error(`${u.email} signed in, but it has no account record.`)
    if (record.status !== ACCOUNT_STATUS.ACTIVE) throw new Error(`${record.name} is ${record.status}.`)
    onSignedIn(record.id)
    return `Signed in as ${record.name}.`
  })

  if (!accounts.length) {
    return (
      <div className="tp-people">
        <LivePassword />
        <div className="tp-callout">
          <p><strong>No dummy accounts yet.</strong> Set the password above, then make some in Spawn — or list the
            ones already on the project from your machine:</p>
          <pre className="tp-code-block">node scripts/live-spawn/spawn-live.mjs accounts</pre>
        </div>
      </div>
    )
  }

  // Signed in, the store says what each account does (signed out it shows nothing).
  const hatsOf = (u) => {
    const record = (snap.users ?? []).find(x => x.email === u.email)
    return record ? hats(snap, record) : []
  }
  const q = query.trim().toLowerCase()
  const shown = accounts.filter(u => !q || [u.name, u.email, u.block, ...(u.globalRoles ?? []), ...hatsOf(u)]
    .some(v => String(v ?? '').toLowerCase().includes(q)))
  const offices = shown.filter(u => !isStudent(u) && officeRank(u) < 99).sort((a, b) => officeRank(a) - officeRank(b) || a.name.localeCompare(b.name))
  const faculty = shown.filter(u => !isStudent(u) && officeRank(u) === 99).sort((a, b) => a.name.localeCompare(b.name))
  const students = shown.filter(isStudent)
  const blocks = [...new Set(students.map(u => u.block || '—'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const row = (u, meta) => (
    <li key={u.email}>
      <button type="button" className={`tp-person${me?.email === u.email ? ' is-me' : ''}`} disabled={busy}
        onClick={() => signInAs(u)} aria-current={me?.email === u.email ? 'true' : undefined}>
        <Avatar name={u.name} kind={kindOf(u)} />
        <span className="tp-person-text">
          <span className="tp-person-name">{u.name}</span>
          {meta && <span className="tp-sub">{meta}</span>}
        </span>
        {me?.email === u.email ? <span className="tp-here">You</span> : <Icon name="chevron" className="tp-go" />}
      </button>
    </li>
  )

  return (
    <div className="tp-people">
      <LivePassword />
      <Search value={query} onChange={setQuery} autoFocus={finePointer() && Boolean(session.get())} />
      {shown.length === 0 && <p className="tp-none">No one matches “{query}”.</p>}
      {offices.length > 0 && <Group title="Offices" icon="office" count={offices.length}>{offices.map(u => row(u, [rolesLine(u), scopeLine(u), ...hatsOf(u)].filter(Boolean).join(' · ')))}</Group>}
      {faculty.length > 0 && <Group title="Faculty" icon="faculty" count={faculty.length}>{faculty.map(u => row(u, hatsOf(u).join(' · ') || u.email))}</Group>}
      {blocks.map(block => {
        const inBlock = students.filter(u => (u.block || '—') === block).sort((a, b) => a.name.localeCompare(b.name))
        return (
          <Group key={block} title={`Students · ${block}`} icon="student" count={inBlock.length}>
            {inBlock.map(u => row(u, hatsOf(u)[0] ?? u.email))}
          </Group>
        )
      })}
    </div>
  )
}

const finePointer = () => { try { return window.matchMedia('(pointer: fine)').matches } catch { return false } }

const rolesLine = (u) => (u.globalRoles ?? []).filter(r => r !== G.FACULTY).join(', ')

/* --- People: sign in as anyone ------------------------------------------------- */

const isStudent = (u) => (u.globalRoles ?? []).includes(G.STUDENT)
const OFFICE_ORDER = [G.ADMIN, G.DEAN, G.ASSOCIATE_DEAN, G.COORDINATOR, G.URO]
const officeRank = (u) => Math.min(...(u.globalRoles ?? []).map(r => OFFICE_ORDER.indexOf(r)).filter(i => i >= 0), 99)

/** What an account does on the projects: its group, its roles, the sections it teaches. */
function hats(snap, u) {
  const pOf = (id) => (snap.projects ?? []).find(p => p.id === id)
  return [
    ...(snap.projectMembers ?? []).filter(m => m.userId === u.id).map(m => {
      const p = pOf(m.projectId)
      return p ? `${groupLabel(p)} · ${stageLabel(p.currentStage)}` : null
    }),
    ...(snap.projectAssignments ?? []).filter(a => a.userId === u.id).map(a => `${a.roleType} · ${groupLabel(pOf(a.projectId))}`),
    ...(snap.sections ?? []).filter(s => s.instructorId === u.id).map(s => `Teaches ${s.block}`),
  ].filter(Boolean)
}

function People({ snap, me, onPick, goSpawn }) {
  const [query, setQuery] = useState('')
  const users = snap.users ?? []

  // What each person owes right now, and where their first step is done.
  const owed = useMemo(() => new Map(users.map(u => {
    if (u.status !== 'Active') return [u.id, { ready: 0, path: '/' }]
    const rows = worklist(snap, u)
    let ready = 0, path = null
    for (const r of rows) {
      const open = r.gates.filter(g => !g.blocker)
      ready += open.length + r.tasks.length
      const first = open[0]?.gate.handledIn ?? (open[0] ? 'overview' : r.tasks[0]?.tab ?? (r.tasks[0] ? 'overview' : null))
      if (!path && first) path = `/projects/${r.project.id}${first !== 'overview' ? `?tab=${first}` : ''}`
    }
    return [u.id, { ready, path: path ?? '/' }]
  })), [snap, users])

  const hatsOf = (u) => hats(snap, u)

  const q = query.trim().toLowerCase()
  const shown = users.filter(u => !q || [u.name, u.email, u.block, ...(u.globalRoles ?? []), ...hatsOf(u)]
    .some(v => String(v ?? '').toLowerCase().includes(q)))

  const pending = shown.filter(u => u.status !== 'Active' || !u.emailVerified)
  const active = shown.filter(u => !pending.includes(u))
  const offices = active.filter(u => !isStudent(u) && officeRank(u) < 99).sort((a, b) => officeRank(a) - officeRank(b) || a.name.localeCompare(b.name))
  const faculty = active.filter(u => !isStudent(u) && officeRank(u) === 99).sort((a, b) => a.name.localeCompare(b.name))
  const students = active.filter(isStudent)
  const blocks = [...new Set(students.map(u => u.block || '—'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  if (!users.length) {
    return (
      <Empty icon="people" title="No accounts yet"
        action={<button type="button" className="tp-btn is-primary has-icon" onClick={goSpawn}><Icon name="spawn" />Go to Spawn</button>}>
        Spawn some, or register one on the sign-in page — its verification email lands in Outbox.
      </Empty>
    )
  }

  const row = (u, meta) => {
    const o = owed.get(u.id) ?? { ready: 0, path: '/' }
    return (
      <li key={u.id}>
        <button type="button" className={`tp-person${me?.id === u.id ? ' is-me' : ''}`} onClick={() => onPick(u, o.path)}
          aria-current={me?.id === u.id ? 'true' : undefined}>
          <Avatar name={u.name} kind={kindOf(u)} />
          <span className="tp-person-text">
            <span className="tp-person-name">{u.name}</span>
            {meta && <span className="tp-sub">{meta}</span>}
          </span>
          {o.ready > 0 && <span className="tp-due" title={`${o.ready} to do`}>{o.ready}<span className="sr-only"> to do</span></span>}
          {me?.id === u.id ? <span className="tp-here">You</span> : <Icon name="chevron" className="tp-go" />}
        </button>
      </li>
    )
  }

  return (
    <div className="tp-people">
      <Search value={query} onChange={setQuery} autoFocus={finePointer()}
        onEnter={() => { if (shown[0]) onPick(shown[0], owed.get(shown[0].id)?.path ?? '/') }} />
      {shown.length === 0 && <p className="tp-none">No one matches “{query}”.</p>}
      {offices.length > 0 && <Group title="Offices" icon="office" count={offices.length}>{offices.map(u => row(u, [rolesLine(u), scopeLine(u), ...hatsOf(u)].filter(Boolean).join(' · ')))}</Group>}
      {faculty.length > 0 && <Group title="Faculty" icon="faculty" count={faculty.length}>{faculty.map(u => row(u, hatsOf(u).join(' · ') || 'No assignments'))}</Group>}
      {blocks.map(block => {
        const inBlock = students.filter(u => (u.block || '—') === block).sort((a, b) => a.name.localeCompare(b.name))
        return (
          <Group key={block} title={`Students · ${block}`} icon="student" count={inBlock.length}>
            {inBlock.map(u => row(u, hatsOf(u)[0] ?? 'No group'))}
          </Group>
        )
      })}
      {pending.length > 0 && (
        <Group title="Waiting on verification or activation" icon="alert" count={pending.length}>
          {pending.map(u => row(u, `${u.emailVerified ? 'Email verified' : 'Email not verified'} · ${u.status}`))}
        </Group>
      )}
    </div>
  )
}

const scopeLine = (u) => (u.programScope ?? []).map(programCode).join(', ')

function Group({ title, icon, count, children }) {
  return (
    <section className="tp-group">
      <h3 className="tp-group-title">
        {icon && <Icon name={icon} />}<span>{title}</span>
        {count != null && <span className="tp-group-n">{count}</span>}
      </h3>
      <ul className="tp-list">{children}</ul>
    </section>
  )
}

/** The People search: a field with its icon; Enter can pick the first match. */
function Search({ value, onChange, onEnter, autoFocus }) {
  return (
    <span className="tp-input-icon tp-search">
      <Icon name="search" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
        placeholder="Search name, section, role or group" aria-label="Search accounts"
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }} />
    </span>
  )
}

const kindOf = (u) => (isStudent(u) ? 'student' : officeRank(u) < 99 ? 'office' : 'faculty')

/* --- Stage: jump a group forward ---------------------------------------------- */

function Stage({ snap, me, edit, task, busy }) {
  const projects = [...(snap.projects ?? [])].sort((a, b) => (a.block ?? '').localeCompare(b.block ?? '', undefined, { numeric: true }) || a.title.localeCompare(b.title))
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [stage, setStage] = useState('TOPIC_PROPOSAL')
  const pid = projects.some(p => p.id === projectId) ? projectId : projects[0]?.id ?? ''

  const jump = () => edit(s => {
    const { store, roles, spawned } = rolesForStage(s, pid)
    const next = applyStage(store, pid, stage, { roles })
    const id = `l_dev_${Date.now().toString(36)}`
    next.auditLogs[id] = {
      id, actorId: me?.id ?? 'system', hat: 'Test panel', action: 'DEV_SET_STAGE', entityType: 'projects', entityId: pid,
      projectId: pid, before: { stage: s.projects[pid].currentStage }, after: { stage }, at: new Date().toISOString(), meta: {},
    }
    const added = spawned ? ` Added ${spawned} account${spawned > 1 ? 's' : ''} to fill its roles.` : ''
    return { store: next, note: `${groupLabel(s.projects[pid])} is now at ${stageLabel(stage)}.${added}` }
  })

  const current = projects.find(p => p.id === pid)?.currentStage
  const phases = []
  for (const s of STAGES) {
    const name = macroStageOf(s.key)
    if (phases.at(-1)?.name !== name) phases.push({ name, stages: [] })
    phases.at(-1).stages.push(s)
  }

  return (
    <div className="tp-stage">
      {projects.length === 0 ? (
        <section className="tp-block">
          <header><h3><Icon name="flag" />Jump a group to a stage</h3></header>
          <p className="tp-none">No groups yet. Form one in the app, or with Spawn → Class lists → Groups +.</p>
        </section>
      ) : (
        <section className="tp-block">
          <header>
            <h3><Icon name="flag" />Jump a group to a stage</h3>
            <p>Rebuilds its documents, reviews, defenses, forms, logs and history so every earlier step is done and this
              stage’s own work is open. Missing advisers, panelists and offices are taken from the faculty you spawned,
              or spawned now.</p>
          </header>
          <label className="tp-label" htmlFor="tp-project">Group</label>
          <select id="tp-project" className="tp-select is-full" value={pid} onChange={e => setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{groupLabel(p)} — {stageLabel(p.currentStage)}</option>)}
          </select>
          <fieldset className="tp-stages">
            <legend className="tp-label">Stage</legend>
            {phases.map(ph => (
              <div key={ph.name} className="tp-phase" role="group" aria-label={ph.name}>
                <span className="tp-phase-name" aria-hidden="true">{ph.name}</span>
                <div className="tp-phase-rows">
                  {ph.stages.map(s => (
                    <label key={s.key} className={`tp-stage-row${stage === s.key ? ' is-picked' : ''}`}>
                      <input type="radio" name="tp-stage" value={s.key} checked={stage === s.key} onChange={() => setStage(s.key)} />
                      <span className="tp-stage-mark" aria-hidden="true" />
                      <span className="tp-stage-label">{s.label}</span>
                      {current === s.key && <span className="tp-here">Now</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <button type="button" className="tp-btn is-primary has-icon tp-jump-go" disabled={busy || !pid} onClick={jump}>
            {stage === current ? <><Icon name="restore" />Rebuild at {stageLabel(stage)}</> : <>Jump to {stageLabel(stage)}<Icon name="arrow" /></>}
          </button>
        </section>
      )}
      <section className="tp-block">
        <header>
          <h3><Icon name="bolt" />System jobs</h3>
          <p>The overdue-revision check (S8.2) also runs on load and every minute.</p>
        </header>
        <button type="button" className="tp-btn has-icon" disabled={busy} onClick={() => task(async () => {
          const n = await flagOverdueRevisions()
          return n ? `${n} revision(s) flagged overdue.` : 'No revisions are past their deadline.'
        })}><Icon name="bolt" />Run overdue check</button>
      </section>
    </div>
  )
}

/* --- Outbox: the mock email ------------------------------------------------------ */

function Outbox({ snap, task, busy, readOnly }) {
  const mail = [...(snap.outbox ?? [])].sort((a, b) => new Date(b.at) - new Date(a.at))
  if (!mail.length) return <Empty icon="mail" title="No emails yet">Every email the workflow sends lands here; none is delivered.</Empty>
  return (
    <>
    {mail.length > MAIL_SHOWN && <p className="tp-hint tp-cut">The latest {MAIL_SHOWN} of {mail.length} emails.</p>}
    <ol className="tp-mail">
      {mail.slice(0, MAIL_SHOWN).map(m => (
        <li key={m.id} className="tp-entry">
          <span className="tp-entry-icon"><Icon name={m.link?.kind === 'verify' ? 'verify' : 'mail'} /></span>
          <div className="tp-entry-body">
            <div className="tp-entry-head">
              <strong>{m.subject}</strong>
              <time className="tp-sub" dateTime={m.at}>{fmtDateTime(m.at)}</time>
            </div>
            <div className="tp-entry-meta">
              <span className="tp-mono tp-sub tp-to">To {(m.to ?? []).join(', ') || '—'}</span>
              {m.event && <span className="tp-tag">{m.event}</span>}
            </div>
            <p className="tp-mail-text">{m.body}</p>
            {m.link?.kind === 'verify' && !readOnly && (
              <button type="button" className="tp-btn has-icon" disabled={busy}
                onClick={() => task(async () => { await verifyEmail(m.link.token); return `Verified ${m.to?.[0]}.` })}>
                <Icon name="check" />{m.link.label}
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
    </>
  )
}
const MAIL_SHOWN = 80

/** An empty list: its icon, what is missing, and where things will come from. */
function Empty({ icon, title, children, action }) {
  return (
    <div className="tp-empty">
      <span className="tp-empty-icon"><Icon name={icon} size={20} /></span>
      <strong>{title}</strong>
      <p>{children}</p>
      {action}
    </div>
  )
}

/* --- Trail: audit log and workflow history ---------------------------------------- */

const show = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function Trail({ snap }) {
  const [projectId, setProjectId] = useState('')
  const users = snap.users ?? []
  const projects = snap.projects ?? []
  const nameOf = (id) => id === 'system' ? 'System' : users.find(u => u.id === id)?.name ?? id
  const all = useMemo(() => [
    ...(snap.auditLogs ?? []).map(l => ({ ...l, kind: 'Audit' })),
    ...(snap.workflowHistory ?? []).map(h => ({
      ...h, kind: 'History', before: h.fromStage ? { stage: h.fromStage } : null,
      after: h.fromStage === h.toStage ? null : { stage: h.toStage },
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)), [snap.auditLogs, snap.workflowHistory])
  const rows = projectId ? all.filter(r => r.projectId === projectId) : all
  const count = (pid) => all.filter(r => r.projectId === pid).length

  return (
    <div>
      <select className="tp-select is-full" value={projectId} onChange={e => setProjectId(e.target.value)} aria-label="Filter by group" disabled={!all.length}>
        <option value="">All groups and accounts ({all.length})</option>
        {projects.map(p => <option key={p.id} value={p.id}>{groupLabel(p)} ({count(p.id)})</option>)}
      </select>
      {rows.length > TRAIL_SHOWN && <p className="tp-hint tp-cut">The latest {TRAIL_SHOWN} of {rows.length} entries.</p>}
      {rows.length === 0 ? <Empty icon="trail" title="Nothing recorded yet">Audit entries and stage moves show here as the workflow runs.</Empty> : (
        <ol className="tp-trail">
          {rows.slice(0, TRAIL_SHOWN).map(r => (
            <li key={`${r.kind}-${r.id}`} className={`tp-entry is-${r.kind.toLowerCase()}`}>
              <span className="tp-entry-icon" title={r.kind}><Icon name={r.kind === 'Audit' ? 'audit' : 'history'} label={r.kind} /></span>
              <div className="tp-entry-body">
                <div className="tp-entry-head">
                  <span className="tp-action">{r.action}</span>
                  <time className="tp-sub" dateTime={r.at}>{fmtDateTime(r.at)}</time>
                </div>
                <div className="tp-sub">{nameOf(r.actorId)}{r.hat ? ` as ${r.hat}` : ''}{r.projectId ? ` · ${groupLabel(projects.find(p => p.id === r.projectId))}` : ''}</div>
                {(r.before != null || r.after != null) && (
                  <div className="tp-change tp-mono">
                    <span className="tp-diff">{show(r.before)}</span>
                    <Icon name="arrow" />
                    <span className="tp-diff is-after">{show(r.after)}</span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const TRAIL_SHOWN = 200

/* --- Rules: flags and the role hat × stage table ---------------------------------- */

function Rules() {
  return (
    <div>
      <section className="tp-block">
        <header><h3><Icon name="admin" />Config flags</h3><p>Mockup defaults live in src/domain/flags.js.</p></header>
        <dl className="tp-flags">
          {Object.entries(FLAGS).map(([k, v]) => (
            <div key={k} className="tp-flag">
              <dt className="tp-mono">{k}</dt>
              <dd className="tp-flag-value">
                {typeof v === 'boolean'
                  ? <span className={`tp-switch${v ? ' is-on' : ''}`}><span className="tp-switch-dot" aria-hidden="true" />{v ? 'On' : 'Off'}</span>
                  : <span className="tp-mono tp-value">{show(v)}</span>}
              </dd>
              {FLAG_NOTES[k]?.wired && <dd className="tp-sub tp-flag-note">{FLAG_NOTES[k].wired}</dd>}
            </div>
          ))}
        </dl>
      </section>
      <section className="tp-block">
        <header><h3><Icon name="rules" />allowedActions — role × stage</h3><p>From the CAAC policies. Membership, program scope and
          not-approving-yourself are checked per user on top.</p></header>
        {Object.values(PROJECT_ROLES).map(hat => (
          <details key={hat} className="tp-details">
            <summary><Icon name="chevron" className="tp-caret" /><span>{hat}</span>
              <span className="tp-group-n">{STAGES.filter(s => allowedActions(hat, s.key).length).length} stages</span></summary>
            <dl className="tp-acts">
              {STAGES.map(s => {
                const actions = allowedActions(hat, s.key)
                return actions.length ? (
                  <div key={s.key}><dt>{s.label}</dt><dd>{actions.map(a => <span key={a} className="tp-tag">{a}</span>)}</dd></div>
                ) : null
              })}
            </dl>
          </details>
        ))}
      </section>
    </div>
  )
}

/* --- Checkpoint and wipe ------------------------------------------------------------ */

function DataControls({ snap, me, busy, task, replaceStore, signIn }) {
  const { wipe } = useApp()
  const [checkpoint, setCheckpoint] = useState(readCheckpoint)
  const [arming, setArming] = useState(false)

  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 4000)
    return () => clearTimeout(t)
  }, [arming])

  return (
    <div className="tp-data">
      <button type="button" className="tp-btn is-quiet has-icon" disabled={busy}
        onClick={() => task(async () => { setCheckpoint(writeCheckpoint(snap, me?.id)); return 'Checkpoint saved.' })}
        title="Remember the whole store as it is now"><Icon name="save" />Save checkpoint</button>
      <button type="button" className="tp-btn is-quiet has-icon" disabled={busy || !checkpoint}
        title={checkpoint ? `Saved ${fmtDateTime(checkpoint.savedAt)}` : 'Save a checkpoint first'}
        onClick={() => task(async () => {
          const cp = readCheckpoint()
          await replaceStore(cp.store)
          if (cp.signedInAs && cp.store.users?.[cp.signedInAs]) signIn(cp.signedInAs)
          return `Restored the checkpoint from ${fmtDateTime(cp.savedAt)}.`
        })}><Icon name="restore" />Restore</button>
      <button type="button" className={`tp-btn has-icon tp-wipe ${arming ? 'is-danger' : 'is-quiet'}`} disabled={busy}
        onClick={() => {
          if (!arming) { setArming(true); return }
          setArming(false)
          task(async () => { await wipe(); return 'Everything is gone. Spawn a fresh set.' })
        }}><Icon name="trash" />{arming ? 'Click again to wipe' : 'Wipe all'}</button>
    </div>
  )
}
