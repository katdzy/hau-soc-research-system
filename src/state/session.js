// Who is signed in. The guard compares every request's actor with this, so a
// call made "as" another user (e.g. from the browser console) is rejected.
// In the Firebase build the same role is played by the verified ID token.

const SESSION_KEY = 'hausoc.session'
let current = null
try { current = localStorage.getItem(SESSION_KEY) } catch { /* Node, private mode */ }

export const getSessionUserId = () => current

export function setSessionUserId(id) {
  current = id ?? null
  try {
    if (current) localStorage.setItem(SESSION_KEY, current)
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}
