import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { worklist, isActionable, owedBy, readyFirst } from '../services/worklist.js'
import { contextsOf, pickContext, rowsIn, hatsOf } from '../domain/workspaces.js'

// The "Acting as" context the rail and the dashboard follow (Figma F02). The
// choice is remembered per account on this device; it changes what is shown,
// never what is allowed.

const Ctx = createContext(null)
const keyOf = (userId) => `hausoc.context.${userId}`
// The roles this account has already seen on this device, so a role gained
// since (e.g. "Adviser" once the Dean approves) can be announced once.
const knownOf = (userId) => `hausoc.roles.${userId}`

function readSaved(userId) {
  try { return localStorage.getItem(keyOf(userId)) } catch { return null }
}

function readKnown(userId) {
  try {
    const raw = localStorage.getItem(knownOf(userId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeKnown(userId, keys) {
  try { localStorage.setItem(knownOf(userId), JSON.stringify(keys)) } catch { /* private mode */ }
}

export function WorkspaceProvider({ children }) {
  const { me, snap } = useApp()
  const [choice, setChoice] = useState(() => ({ userId: me.id, key: readSaved(me.id) }))
  const saved = choice.userId === me.id ? choice.key : readSaved(me.id)
  const [seen, setSeen] = useState(() => ({ userId: me.id, keys: readKnown(me.id) }))
  const known = seen.userId === me.id ? seen.keys : readKnown(me.id)

  const value = useMemo(() => {
    const rows = worklist(snap, me)
    // Roles count only where they open a group now (a proposed Adviser holds none yet).
    const held = contextsOf(me, snap, rows)
    // With nothing saved, open on the role behind the first thing waiting.
    const first = rows.find(isActionable)
    const firstHat = first && (first.gates[0]?.hat ?? first.tasks[0]?.hat)
    const current = pickContext(held, saved, firstHat === 'Student' ? 'Group member' : firstHat)
    // What each role can do right now, most pressing first — for the
    // switcher's counts and the "next step" bar (Shell.jsx).
    const readyIn = (c) => readyFirst(owedBy(rowsIn(c, rows), hatsOf(c)))
    const ready = Object.fromEntries(held.map(c => [c.key, readyIn(c)]))
    // Roles gained since this device last saw the account (none on a first visit).
    // A project role counts once it opens a group to this account (its rows are
    // the guard-filtered worklist), so a proposed Adviser is told nothing (S2.2).
    const fresh = (known ? held.filter(c => c.key !== current?.key && !known.includes(c.key)) : [])
      .map(c => ({ ...c, open: rowsIn(c, rows).length }))
      .filter(c => c.global || c.open > 0)
    const remember = (keys) => {
      const next = [...new Set([...(known ?? []), ...keys])]
      writeKnown(me.id, next)
      setSeen({ userId: me.id, keys: next })
    }
    return {
      rows, held, current, ready, fresh,
      inContext: rowsIn(current, rows),
      choose: (key) => {
        try { localStorage.setItem(keyOf(me.id), key) } catch { /* private mode */ }
        setChoice({ userId: me.id, key })
        remember([key])
      },
      // "Dismiss" on the new-role notice.
      acknowledge: (key) => remember([key]),
      // First visit on this device, or the role on screen: known from now on.
      _sync: () => {
        const missing = known ? [current?.key].filter(k => k && !known.includes(k)) : held.map(c => c.key)
        if (missing.length || !known) remember(missing)
      },
    }
  }, [snap, me, saved, known])

  // Record the roles in sight once the context is resolved, outside render.
  const { _sync } = value
  useEffect(() => { _sync() }, [_sync])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useWorkspace = () => useContext(Ctx)
