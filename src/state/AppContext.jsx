import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, backendName, isLiveBackend } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { emptyStore, COLLECTIONS } from '../backend/schema.js'
import { getSessionUserId, setSessionUserId } from './session.js'
import { flagOverdueRevisions } from '../services/actions.js'

const AppCtx = createContext(null)

function refuseLive() {
  if (isLiveBackend) {
    throw new Error('Dev data controls run only against the local backend or the Firebase emulators, never a live project.')
  }
}

const blankSnapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, []]))

const ensureArray = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}))

export function AppProvider({ children }) {
  const [snap, setSnap] = useState(blankSnapshot)
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState(getSessionUserId)
  const seeding = useRef(false)

  useEffect(() => db.subscribe((next) => { setSnap(next); setReady(true) }), [])

  const usersList = useMemo(() => ensureArray(snap?.users), [snap?.users])

  // First run on a blank store: load the demo dataset. Never on a live
  // project — replaceAll wipes every collection first.
  useEffect(() => {
    if (!ready || seeding.current || isLiveBackend) return
    if (usersList.length === 0) {
      seeding.current = true
      db.replaceAll(buildSeed()).finally(() => { seeding.current = false })
    }
  }, [ready, usersList])

  // S8.2 — the overdue check. A scheduled Cloud Function in the Firebase build.
  useEffect(() => {
    if (!ready || backendName !== 'local') return
    const run = () => flagOverdueRevisions().catch(() => {})
    run()
    const t = setInterval(run, 60_000)
    return () => clearInterval(t)
  }, [ready])

  const me = useMemo(
    () => usersList.find(u => u.id === userId) ?? null,
    [usersList, userId],
  )

  const value = useMemo(() => ({
    snap, ready, me, backendName,
    signIn: (id) => { setSessionUserId(id); setUserId(id) },
    signOut: () => { setSessionUserId(null); setUserId(null) },
    // Dev tools only (R9) — the production UI never calls these. They replace
    // the whole store, so they refuse to run against a real Firebase project.
    replaceStore: async (store) => { refuseLive(); await db.replaceAll(store) },
    resetDemoData: async () => { refuseLive(); await db.replaceAll(buildSeed()) },
    wipe: async () => { refuseLive(); await db.replaceAll(emptyStore()) },
  }), [snap, ready, me])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
