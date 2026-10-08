/**
 * Progressive Web App glue: registers the service worker (production builds
 * only) and keeps the two things the UI offers in a tiny store —
 *   - an update that is waiting (a new deploy) until the user reloads, so a
 *     half-filled form is never swapped out from under them;
 *   - how this device installs the app: Chrome/Edge on Android fire
 *     `beforeinstallprompt`, iOS has no prompt (Share → Add to Home Screen).
 */
import { useSyncExternalStore } from 'react'
import { currentEnv, installHint } from './browserSupport.js'

let state = { needRefresh: false, installEvent: null }
let updateSW = null
const listeners = new Set()
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()) }
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

export function startPwa() {
  if (typeof window === 'undefined') return
  // The event fires once, early; keep it so the account menu can use it later.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); set({ installEvent: e }) })
  window.addEventListener('appinstalled', () => set({ installEvent: null }))

  if (!import.meta.env.PROD) return
  import('virtual:pwa-register').then(({ registerSW }) => {
    updateSW = registerSW({
      onNeedRefresh: () => set({ needRefresh: true }),
      // Pick up a new deploy on a long-lived tab or home-screen app, hourly.
      onRegisteredSW: (_url, reg) => reg && setInterval(() => reg.update(), 60 * 60 * 1000),
    })
  })
}

export function usePwa() {
  const s = useSyncExternalStore(subscribe, () => state)
  return {
    needRefresh: s.needRefresh,
    reload: () => updateSW?.(true),
    dismissUpdate: () => set({ needRefresh: false }),
    /**
     * 'prompt' (the browser's own install sheet: Chrome, Edge, Samsung Internet),
     * else a hint from browserSupport.installHint — 'ios-safari' | 'ios-other' |
     * 'android-menu' | 'in-app' — or null (installed, or nothing to say).
     */
    install: s.installEvent && !currentEnv().standalone ? 'prompt' : installHint(currentEnv()),
    promptInstall: async () => {
      const e = state.installEvent
      if (!e) return
      e.prompt()
      await e.userChoice
      set({ installEvent: null })
    },
  }
}
