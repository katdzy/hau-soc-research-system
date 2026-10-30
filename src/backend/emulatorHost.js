// Where the browser finds the Firebase Emulator Suite (VITE_USE_EMULATORS):
// the machine that served the page, so another PC on the network that opens
// http://<that machine>:5180 reaches the emulators there too, not its own
// 127.0.0.1. "localhost" becomes 127.0.0.1: Windows resolves localhost to ::1
// first, where the emulators may not answer. VITE_EMULATOR_HOST overrides it.
export function emulatorHost() {
  const set = import.meta.env.VITE_EMULATOR_HOST
  if (set) return set
  const host = globalThis.location?.hostname ?? ''
  return !host || host === 'localhost' || host === '[::1]' ? '127.0.0.1' : host
}
