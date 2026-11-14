import { useSyncExternalStore } from 'react'

// Developer details — the CAAC Inspector beside a project, the capability
// that grants each step ("granted by roster.endorse") and the backend line in
// the rail. They are for testing CAAC, not for the people using the system:
// hidden by default, never shown in a production build, and switched on for
// this browser from the test panel (Rules), which exists only in dev builds.

const KEY = 'hausoc.devDetails'
const listeners = new Set()

function read() {
  if (!import.meta.env.DEV) return false
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

export function setDevDetails(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode: stays off */ }
  listeners.forEach(l => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether to show the developer details on this browser right now. */
export const useDevDetails = () => useSyncExternalStore(subscribe, read, () => false)
