import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, backendName } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { emptyStore, COLLECTIONS } from '../backend/schema.js'

const SESSION_KEY = 'hausoc.session'
const AppCtx = createContext(null)

const blankSnapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, []]))

export function AppProvider({ children }) {
  const [snap, setSnap] = useState(blankSnapshot)
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState(() => {
    try { return localStorage.getItem(SESSION_KEY) } catch { return null }
  })
  const seeding = useRef(false)

  useEffect(() => db.subscribe((next) => { setSnap(next); setReady(true) }), [])

  // First run on a blank store: load the demo dataset.
  useEffect(() => {
    if (!ready || seeding.current) return
    if ((snap.users ?? []).length === 0) {
      seeding.current = true
      db.replaceAll(buildSeed()).finally(() => { seeding.current = false })
    }
  }, [ready, snap.users])

  const me = useMemo(
    () => (snap.users ?? []).find(u => u.id === userId) ?? null,
    [snap.users, userId],
  )

  const value = useMemo(() => ({
    snap, ready, me, backendName,
    signIn: (id) => { try { localStorage.setItem(SESSION_KEY, id) } catch {} ; setUserId(id) },
    signOut: () => { try { localStorage.removeItem(SESSION_KEY) } catch {} ; setUserId(null) },
    resetDemoData: async () => { await db.replaceAll(buildSeed()) },
    wipe: async () => { await db.replaceAll(emptyStore()) },
  }), [snap, ready, me])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
