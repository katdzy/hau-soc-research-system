import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { db, files, backendName, isLiveBackend } from '../backend/index.js'
import { emptyStore, COLLECTIONS } from '../backend/schema.js'
import { getSessionUserId, setSessionUserId } from './session.js'
import { flagOverdueRevisions } from '../services/api.js'
import { unregisterDevice } from '../services/push.js'
import { followClaims } from '../services/claims.js'
import { nameProjects } from '../domain/groupNames.js'

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

  // Groups without a topic yet read as "WD-401-2", not "Untitled" (domain/groupNames.js).
  useEffect(() => db.subscribe((next) => {
    setSnap(next?.projects ? { ...next, projects: nameProjects(ensureArray(next.projects)) } : next)
    setReady(true)
  }), [])

  // Firebase build: refresh the ID token whenever the rules' claims change.
  useEffect(() => { followClaims() }, [])

  // The store starts empty: accounts come from registration or the dev test
  // panel's spawner. The §6 seed (backend/seed.js) is the automated tests' fixture.
  const usersList = useMemo(() => ensureArray(snap?.users), [snap?.users])

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
    // A change of account drops the files this tab already fetched (files.js).
    signIn: (id) => { files.forget(); setSessionUserId(id); setUserId(id) },
    // A shared device stops receiving this account's push notifications first,
    // while the session can still prove whose token it is.
    signOut: async () => {
      await unregisterDevice().catch(() => {})
      files.forget()
      setSessionUserId(null); setUserId(null)
    },
    // Dev tools only (R9) — the production UI never calls these. They replace
    // the whole store, so they refuse to run against a real Firebase project.
    replaceStore: async (store) => { refuseLive(); await db.replaceAll(store) },
    wipe: async () => { refuseLive(); await db.replaceAll(emptyStore()) },
  }), [snap, ready, me])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
