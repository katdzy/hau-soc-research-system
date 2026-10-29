import { createContext, useContext, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { worklist, isActionable } from '../services/worklist.js'
import { contextsOf, pickContext, rowsIn } from '../domain/workspaces.js'

// The "Acting as" context the rail and the dashboard follow (Figma F02). The
// choice is remembered per account on this device; it changes what is shown,
// never what is allowed.

const Ctx = createContext(null)
const keyOf = (userId) => `hausoc.context.${userId}`

function readSaved(userId) {
  try { return localStorage.getItem(keyOf(userId)) } catch { return null }
}

export function WorkspaceProvider({ children }) {
  const { me, snap } = useApp()
  const [choice, setChoice] = useState(() => ({ userId: me.id, key: readSaved(me.id) }))
  const saved = choice.userId === me.id ? choice.key : readSaved(me.id)

  const value = useMemo(() => {
    const rows = worklist(snap, me)
    const held = contextsOf(me, snap)
    // With nothing saved, open on the role behind the first thing waiting.
    const first = rows.find(isActionable)
    const firstHat = first && (first.gates[0]?.hat ?? first.tasks[0]?.hat)
    const current = pickContext(held, saved, firstHat === 'Student' ? 'Group member' : firstHat)
    return {
      rows, held, current,
      inContext: rowsIn(current, rows),
      choose: (key) => {
        try { localStorage.setItem(keyOf(me.id), key) } catch { /* private mode */ }
        setChoice({ userId: me.id, key })
      },
    }
  }, [snap, me, saved])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useWorkspace = () => useContext(Ctx)
