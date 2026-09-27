import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, backendName } from '../backend/index.js'
import { buildSeed } from '../backend/seed.js'
import { emptyStore, COLLECTIONS } from '../backend/schema.js'
import { actingContexts } from '../domain/contexts.js'

const SESSION_KEY = 'hausoc.session'
const ACTING_KEY = 'hausoc.actingAs'
const AppCtx = createContext(null)

const blankSnapshot = () => Object.fromEntries(COLLECTIONS.map(c => [c, []]))

const ensureArray = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}))

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* private mode */ }
}

export function AppProvider({ children }) {
  const [snap, setSnap] = useState(blankSnapshot)
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState(() => read(SESSION_KEY))
  const [acting, setActing] = useState(() => read(ACTING_KEY))
  const seeding = useRef(false)

  useEffect(() => db.subscribe((next) => { setSnap(next); setReady(true) }), [])

  const usersList = useMemo(() => ensureArray(snap?.users), [snap?.users])

  // First run on a blank store: load the demo dataset.
  useEffect(() => {
    if (!ready || seeding.current) return
    if (usersList.length === 0) {
      seeding.current = true
      db.replaceAll(buildSeed()).finally(() => { seeding.current = false })
    }
  }, [ready, usersList])

  const account = useMemo(() => usersList.find(u => u.id === userId) ?? null, [usersList, userId])
  const contexts = useMemo(() => actingContexts(account, snap), [account, snap])

  // `me` carries the acting context, so every CAAC resolution and every write
  // made through the service layer applies only that role's policies.
  const actingAs = contexts.find(c => c.role === acting)?.role ?? contexts[0]?.role ?? null
  const me = useMemo(() => (account ? { ...account, actingAs } : null), [account, actingAs])

  const value = useMemo(() => ({
    snap, ready, me, backendName, contexts, actingAs,
    setActingAs: (role) => { write(ACTING_KEY, role); setActing(role) },
    signIn: (id) => { write(SESSION_KEY, id); write(ACTING_KEY, null); setActing(null); setUserId(id) },
    signOut: () => { write(SESSION_KEY, null); write(ACTING_KEY, null); setActing(null); setUserId(null) },
    resetDemoData: async () => { await db.replaceAll(buildSeed()) },
    wipe: async () => { await db.replaceAll(emptyStore()) },
  }), [snap, ready, me, contexts, actingAs])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
